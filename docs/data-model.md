# データモデル設計

## 1. DynamoDB方針

単一テーブル `SqlPatchManager` を採用する。SQL本文・実行ログ本文は格納せず、S3キー、VersionId、SHA-256、サイズ、結果S3キーだけを格納する。DynamoDBの項目は400KBを超えないよう、SELECT結果やエラーメッセージを含む実体ログを入れない。

テーブルは本番では環境・アカウントごとに分離し、個人開発で同一テーブルを使う場合も全キーに `environment` を持たせ、IAMとアプリの条件で境界を二重化する。オンデマンド容量を初期値とし、利用量が安定したらProvisioned + Auto Scalingを評価する。

## 2. キー設計

| エンティティ | PK | SK | 主な属性 |
| --- | --- | --- | --- |
| Patch | `PATCH#<patchId>` | `META` | patchId, environment, ownerSub, approverSub, currentRevision, state, title, createdAt, updatedAt, version |
| Revision | `PATCH#<patchId>` | `REV#<revisionNo>` | revisionNo, state, createdBy, createdAt, fileCount, dryRunExecutionId, approvedAt, semanticWarnings |
| File | `PATCH#<patchId>` | `REV#<revisionNo>#FILE#<type>` | type, s3Bucket, s3Key, s3VersionId, sha256, sizeBytes, contentType, verifiedAt |
| Execution | `PATCH#<patchId>` | `EXEC#<createdAt>#<executionId>` | executionId, revisionNo, kind, status, requestedBy, approverSub, codeBuildProject, codeBuildId, attemptId, resultS3Key, resultSha256, startedAt, completedAt, timeoutAt |
| Approval | `PATCH#<patchId>` | `APPROVAL#<operation>#<approvalId>` | approvalId, operation, revisionNo, requesterSub, approverSub, status, decisionAt, reason |
| Outbox | `OUTBOX#<shard>#<createdAt>` | `<eventId>` | eventId, eventType, executionId, deliveryStatus, leaseOwner, leaseUntil, attemptCount, lastError, createdAt |
| Audit | `PATCH#<patchId>` | `AUDIT#<timestamp>#<auditId>` | auditId, actorSub, actorType, action, targetType, targetId, environment, requestId, result, metadataSummary, createdAt |
| Global Audit | `AUDIT#<yyyy-mm-dd>` | `<timestamp>#<auditId>` | 上記Auditと同じ。Patchがない設定変更・権限変更用 |

`Execution`のSKは時刻の同一性だけに依存せず、末尾にULID等の一意IDを付ける。Auditのキーはアプリが上書きできないよう、同一auditIdのPutを条件付きで拒否する。

## 3. GSI

| GSI | Partition Key | Sort Key | 用途 |
| --- | --- | --- | --- |
| GSI1 | `OWNER#<ownerSub>` | `<updatedAt>#<patchId>` | 自分のPatch一覧 |
| GSI2 | `APPROVER#<approverSub>` | `<state>#<updatedAt>#<patchId>` | 承認待ち一覧。担当者の項目だけ |
| GSI3 | `ENV#<environment>#STATE#<state>` | `<updatedAt>#<patchId>` | 運用・リカバリ・環境別一覧 |
| GSI4 | `EXECUTION#<executionId>` | `PATCH#<patchId>` | Dispatcher/監視から実行IDでPatchを解決 |
| GSI5 | `ACTOR#<actorSub>` | `<createdAt>#<auditId>` | 操作主体の監査確認 |
| GSI6 | `OUTBOX#<deliveryStatus>` | `<createdAt>#<eventId>` | `PENDING`/リース期限切れOutboxの配送 |

GSIの結果も権限の根拠にはしない。取得後にLambdaがowner/approver/environmentを再確認する。GSIのEventually Consistentな遅延により承認待ち一覧から一時的に見えなくても、直接キー取得と操作APIの条件式が正とする。

## 4. 状態と条件付き更新

### Patch / Revision

```text
UPLOADING -> UPLOAD_VERIFIED -> DRY_RUN_REQUIRED -> DRY_RUN_RUNNING
DRY_RUN_RUNNING -> DRY_RUN_SUCCEEDED | DRY_RUN_FAILED | DRY_RUN_UNKNOWN | ROLLBACK_UNCONFIRMED
DRY_RUN_SUCCEEDED -> APPROVAL_PENDING
APPROVAL_PENDING -> APPROVED | REJECTED
APPROVED -> EXECUTION_QUEUED -> EXECUTION_RUNNING
EXECUTION_RUNNING -> EXECUTION_SUCCEEDED | EXECUTION_FAILED | EXECUTION_UNKNOWN
EXECUTION_SUCCEEDED -> ROLLBACK_REQUESTED (rollback.sqlがある場合)
ROLLBACK_REQUESTED -> ROLLBACK_APPROVAL_PENDING
ROLLBACK_APPROVAL_PENDING -> ROLLBACK_APPROVED | ROLLBACK_REJECTED
ROLLBACK_APPROVED -> ROLLBACK_QUEUED -> ROLLBACK_RUNNING
ROLLBACK_RUNNING -> ROLLBACK_SUCCEEDED | ROLLBACK_FAILED | ROLLBACK_UNKNOWN
```

新Revisionの作成時は、`currentRevision`を条件付きで更新し、旧Revisionの承認・ドライラン結果を再利用しない。承認申請は次の条件を同一のTransactWriteItemsで確認する。

- Patchの `currentRevision` が申請Revisionと一致する。
- Revisionが `DRY_RUN_SUCCEEDED` である。
- `dryRunExecutionId`の結果が成功かつROLLBACK確認済みである。
- FileのVersionId・SHA-256が保存済みである。
- 現在のApprovalが未作成である。
- 申請者と承認者が異なる。

Rollbackの状態はPatch METAの表示用状態と、`Approval.operation=ROLLBACK`、`Execution.kind=ROLLBACK` の履歴を組み合わせて管理する。本実行の成功とRollbackの成功を同一状態へ上書きせず、失敗・タイムアウト・状態不明を個別Executionとして保持する。

### Execution

同一Patch・Revision・operationにつき、アクティブなExecutionが1つだけになる条件を設ける。`PutItem`の `attribute_not_exists(pk)` だけでは不十分な場合は、Patch METAに `activeExecutionId` を持たせ、`attribute_not_exists(activeExecutionId)` または終端状態である条件を同時に更新する。

## 5. Outboxと非同期整合性

DynamoDB状態更新、Dispatcherの起動通知、CodeBuild StartBuildは同一トランザクションではない。したがって、実行申請時に次を一つのTransactWriteItemsで作成する。

1. Executionを `QUEUED` で作成。
2. Patch METAの状態を `EXECUTION_QUEUED` に変更。
3. Outboxを `PENDING` で作成。
4. Auditを追加。

DispatcherはOutboxを条件付きで `DISPATCHING` にリースし、同じExecution IDを含むStartBuildを呼ぶ。AWS CodeBuildの`StartBuild` idempotency tokenは同じ要求を短時間重複送信した場合の保護に使うが、5分を超える障害回復の唯一の根拠にはしない。開始応答前後で失敗した場合は `DISPATCH_UNKNOWN` とし、ReconcilerがCodeBuild ID、Execution ID、attemptIdの組み合わせを確認する。見つからないからといって自動再実行しない。

EventBridgeを採用する場合の役割は、Dispatcher/Reconcilerの定期確認と起動漏れ検知に限定する。EventBridge自体を耐久キューやSQL実行の自動再試行として扱わず、SQS Standard + DLQを採用するかDispatcherから直接CodeBuildを起動するかはPhase 3のPlan Review Gateで決定する。[ADR-0008](adr/0008-eventbridge-scheduler-and-dispatch-queue-boundary.md)

CodeBuild起動後にプロセスが落ちるケースへ備え、CodeBuild自身がSQL開始前にDynamoDBのExecutionガードを条件付き取得する。既に別のattemptIdが取得済みなら、重複ビルドはSQLを実行せず抑止ログだけを残す。これにより、CodeBuild起動APIの重複をSQL二重実行へ直結させない。

DynamoDBは条件付き書込みとTransactWriteItemsを提供し、TransactWriteItemsにはClientRequestTokenによる冪等性もあるため、状態変更とOutbox作成に利用する。[DynamoDB TransactWriteItems](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html)

## 6. S3キー設計

```text
s3://<sql-bucket>/<environment>/<patchId>/rev-<revisionNo>/<fileType>.sql
s3://<log-bucket>/<environment>/<patchId>/rev-<revisionNo>/<executionId>/result.jsonl
s3://<log-bucket>/<environment>/<patchId>/rev-<revisionNo>/<executionId>/metadata.json
```

実際のキーにはランダムなPatch IDを含め、利用者入力をそのままprefixにしない。File metadataに保存したキー以外は読み取らない。ログはExecution IDごとに別キーへ保存し、再実行で上書きしない。

## 7. 整合性・削除・保持

- File、Approval、Execution、Auditは履歴として追加し、承認済み項目を更新・削除しない。訂正は新しいイベントを追加する。
- Patch METAの表示用状態は履歴の派生値であり、Audit/Executionの事実と矛盾した場合はReconcilerが検出する。
- TTLは短期の冪等性キー・Outboxリース補助のみに使い、Audit・Approval・Executionには使わない。保持期限を過ぎた削除はLifecycle/運用承認で実行する。
- 400KBを超えるエラー・SELECT結果はLog S3へ保存し、DynamoDBには件数・サイズ・結果キー・先頭の安全な要約だけを保存する。
