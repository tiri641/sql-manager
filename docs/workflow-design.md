# ワークフロー設計

## 1. Revisionアップロード

1. 利用者が環境、タイトル、指定承認者を入力する。APIは承認者が環境権限を持つか確認する。
2. APIはPatchとRevisionを `UPLOADING` で作成し、許可された3つの固定キーのPUT署名URLを発行する。`rollback.sql` は任意で、その他のファイルはURLを発行しない。
3. ブラウザはファイルをS3へ直接PUTする。アップロード失敗時は同じURLを使い回さず、TTL内の再送または新Revisionを使用する。
4. 完了APIは、想定された全ファイルの存在、件数、サイズ、Content-Type、S3 VersionId、S3検証済みSHA-256、prefixを確認する。余分なファイルがあれば失敗にする。
5. 全検証成功時だけRevisionを `UPLOAD_VERIFIED` へ条件付き更新し、File項目とAuditを保存する。S3に孤児オブジェクトが残った場合はライフサイクルで隔離・削除する。

SQL修正は既存S3キーへの上書きではなく、新しいRevisionと新しいキーで行う。既存Approval、dry-run成功、Execution結果は新Revisionへコピーしない。

## 2. ドライラン

### 開始条件

- Patchのownerが操作している。
- Revisionが最新の `UPLOAD_VERIFIED` である。
- `dry-run.sql` が存在する。
- 同じPatch/DB環境にアクティブなExecutionがない。
- APIがExecutionを条件付きで作成し、Patch状態、Outbox、Auditを同一DynamoDBトランザクションで記録する。

### CodeBuild内部の実行順

```text
入力メタデータ検証
  -> CodeBuild実行ガード取得
  -> S3 VersionId取得 + SHA-256検証
  -> parserによるSQL検査
  -> Secrets ManagerからSecret取得
  -> RDSへTLS接続確認
  -> BEGIN + session policy
  -> dry-run.sql実行（ON_ERROR_STOP）
  -> SELECT/件数/エラーを結果バッファへ記録
  -> ROLLBACK
  -> 新規接続でロールバック・セッション終了を確認
  -> Log S3へ新規キーで保存
  -> 成功状態を条件付き反映
```

`COMMIT`、`ROLLBACK`、`BEGIN`等のトランザクション制御をSQL本文内で許可しない。`CREATE INDEX CONCURRENTLY`などトランザクション非対応SQLはdry-run不可とする。正規表現は補助的な早期警告に留め、最終判断はPostgreSQL parserと許可リスト・拒否リスト・DB接続前検証で行う。

### ドライラン結果

- 成功: SQL実行、明示的ROLLBACK、セッション終了、Log S3保存、Execution状態反映がすべて確認できた場合だけ `DRY_RUN_SUCCEEDED`。
- SQLエラー: `DRY_RUN_FAILED`。ログを保存し、承認申請を拒否。
- タイムアウト・接続切断・CodeBuild失敗: `DRY_RUN_UNKNOWN` または `ROLLBACK_UNCONFIRMED`。再実行・承認申請を自動で行わず、DB側確認後に新Revisionまたは明示的な再試行を行う。
- ログ保存失敗: DB結果が成功でも `RESULT_PERSISTENCE_FAILED` とし、成功表示をしない。部分ログの場所と保存失敗をAuditへ記録する。

### 業務影響

dry-runは書込みをROLLBACKするが、行・テーブルロック、CPU、I/O、トリガー処理、シーケンスなどの影響を受ける。本番ではメンテナンス時間、statement/lock timeout、対象行数上限、同時実行上限、監視メトリクス、承認者の影響確認を必須にする。重いSELECT結果はサイズ上限と表示上限で制御する。

## 3. 承認申請・承認

1. ownerが成功したdry-runの結果と、dry-run/executeのハッシュ・差分・警告・対象環境を確認して申請する。
2. APIはRevision、File VersionId、SHA-256、dry-run Execution、owner、approver、状態を条件付きで確認する。
3. Approvalを `PENDING` で作成し、Patchを `APPROVAL_PENDING` にする。既存Approvalがあれば409にする。
4. approverが承認画面を開く。ownerと異なるsub、環境の承認権限、対象Revisionを再検証する。
5. 承認をDynamoDBへ条件付きで保存し、Patchを `APPROVED`、Executionを `QUEUED`、Outboxを作成する。同じトランザクションで状態を反映する。
6. 承認後はDispatcherが自動的に本実行を開始する。利用者の「実行」ボタンを追加で要求しない。

却下時は理由（秘密情報を含めない）を保存し、Patchを `REJECTED` とする。再提出は新Revisionまたはポリシーで許可した再申請だけとし、却下済みApprovalを上書きしない。

## 4. 非同期起動と障害処理

### 正常系

```text
TransactWriteItems
  -> Outbox PENDING
  -> Dispatcher lease
  -> StartBuild(idempotencyToken)
  -> BuildIdを条件付き保存
  -> CodeBuild guard
  -> SQL実行
  -> Result S3
  -> CodeBuild / ReconcilerがExecution反映
```

### 起動漏れ

定期Reconcilerが `QUEUED`、`PENDING`、リース期限切れのOutboxを検索する。ただし、StartBuild呼出しの応答が不明な場合は、CodeBuildのBuild ID、プロジェクト、Execution ID、attemptIdを照合してから状態を反映する。検索が一時的に空でも即時再実行せず、待機後に `DISPATCH_UNKNOWN` へ遷移し、手動確認を要求する。

### 重複起動

同じStartBuildリクエストは5分以内のidempotency tokenを使う。別attemptのBuildが起動した場合でも、SQL開始前のDynamoDB実行ガードを条件付き取得できるBuildだけが実行する。ガードを取れないBuildはSQLへ接続せず、抑止結果を保存する。

CodeBuildプロジェクトの自動Retry（`RetryBuild`）はSQL実行用途では無効化し、`autoRetryLimit`を0にする。Build失敗・タイムアウト・StartBuild応答不明を、CodeBuildの自動Retryで再実行してはならない。再試行が必要な場合も、まずCodeBuild、Log S3、DynamoDB、DB実行台帳を照合し、状態不明を解消した後に新しい明示申請・承認・Execution IDで行う。

### DB結果不明

SQL送信後にネットワークが切断された場合、CodeBuildの失敗だけではDBが実行済みか未実行か判断できない。Executionを `UNKNOWN` にし、次を手動確認する。

- DB側の監査・実行台帳、対象データ、トランザクション状態、`pg_stat_activity`。
- CodeBuildログではなくLog S3の保存状態と最後に確認できたSQL結果。
- 実行IDとDBセッションへの相関情報。ただしSQL本文やSecretは記録しない。
- 必要に応じてバックアップ/PITR、業務所有者、DBA承認。

確認完了前に自動再実行を許可しない。

## 5. 本実行

- 実行直前に`execute.sql`のS3 VersionId・SHA-256をHeadObjectで検証する。
- dry-run成功は同Revisionの`dry-run.sql`にのみ紐づき、`execute.sql`の実行結果を保証しない。
- CodeBuildの環境変数にはSQL本文・Secret値を入れず、S3キー、VersionId、ハッシュ、Execution IDだけを渡す。
- 実行は1つの専用DB接続・明示的タイムアウト・TLSで行い、DB権限は環境別に分離する。
- 成功・失敗・タイムアウト・不明・ログ保存失敗を区別して保存する。

## 6. ロールバック

1. 本実行が終端状態になり、`rollback.sql` がある場合、ownerがRollback申請を作成する。
2. Rollbackは本実行の完了を条件とし、同一RevisionのrollbackファイルVersionId・SHA-256を記録する。
3. 指定承認者が本実行と同じ職務分離ルールで承認・却下する。
4. 承認後に自動CodeBuildを開始し、CodeBuild側のguard、S3再検証、DB接続、Log保存を行う。
5. 失敗・タイムアウト・不明は新たなRollback Executionとして残し、自動再実行しない。再実行する場合は新しい明示申請と承認を必要にする。

Rollback SQLは元の状態を完全復元する保証がなく、部分実行・外部副作用・新規データとの競合で失敗し得る。復旧計画にはRDS automated backup、PITR、スナップショット、手動補正、業務判断を含める。

## 7. 保持・削除

- SQLとログは環境別保持期間を設定し、非現行Version、孤児アップロード、古いログのLifecycleを設計する。
- AuditとApprovalは法令・社内規程の保持期間を優先し、削除は管理操作と承認を要する。
- 削除要求があっても法的保持・事故調査・実行履歴の要件を確認する。削除後もAuditの要約を残す必要があるかOpen Questionで確定する。
