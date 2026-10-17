# セキュリティ設計

## 1. セキュリティ境界

```text
利用者ブラウザ
  ├─ 認証境界: Amazon Cognito
  ├─ API境界: API Gateway + Lambdaで申請単位認可
  ├─ データ境界: 非公開S3 / DynamoDB / KMS
  └─ 実行境界: 環境別IAMロール + CodeBuild Private Subnet + RDS SG
```

ブラウザにAWS認証情報を渡さず、S3直接アクセスはAPIが発行した短期URLだけにする。S3の通常のGetObject権限を一般ユーザーへ付与しない。AWS管理者やアカウントルート相当の権限をアプリ側で無効化できるとは説明せず、特権アクセス管理と監査を別途行う。

## 2. 認証・認可

個人開発用既定値ではCognito Essentialsを使用する。MFA、強固なパスワードポリシー、JWTのissuer/audience/有効期限検証、`sub`ベースのAPI認可は維持する。社内導入・実データ利用時はCognito Plus/Threat Protectionを有効化するか、IdP側の同等機能を再評価する。

- Cognito User Poolで認証し、API Gateway JWT Authorizerでトークン署名・issuer・audience・有効期限を検証する。
- 利用者IDはメールアドレスではなく、トークンの不変な `sub` を使用する。表示名・メールは監査補助情報として扱い、認可判定に使わない。
- `ownerSub`、`approverSub`、`environment`、`revision`、状態、操作対象をDynamoDBから取得し、LambdaがAPIごとに認可する。
- 承認者はクライアント入力をそのまま信用せず、環境の承認者グループ・担当者マッピングと照合してサーバーが確定する。
- 申請者と承認者の `sub` が同じ場合は401ではなく403相当の業務エラー `SELF_APPROVAL_FORBIDDEN` とする。
- 直接S3アクセス、担当外PatchのSQL・ログ取得、担当外Approval決定、環境外の実行はすべてAPI側で拒否する。
- 管理者の緊急アクセスは通常ユーザーグループと別のBreakGlassロールにし、理由、チケット、開始・終了時刻、対象PatchをAuditへ記録する。可能なら短時間の承認付き権限昇格にする。

## 3. IAMロール分離

| ロール | 許可 | 明示的な禁止・制約 |
| --- | --- | --- |
| Frontend配信 | CloudFront OACからUIバケットGetObject | 公開Read、ユーザーへのS3権限 |
| API Lambda | Cognito claims、DynamoDB、署名URL生成、Audit書込み | SQL本文GetObject、RDS接続、環境別CodeBuildの無制限StartBuild |
| Outbox Dispatcher | 対象EnvironmentのCodeBuild StartBuild、BatchGet、DynamoDB更新 | SQL本文の読み取り、他環境プロジェクト起動 |
| CodeBuild実行ロール | 指定S3 VersionId Get、Log S3の指定prefix Put、対象Secret Get、対象DynamoDBの実行ガード更新、VPC Endpoint経由のAPI | CloudWatch LogsへのSQL出力、S3全体List/Delete、KMS管理、別環境Secret、管理者DB権限 |
| Audit/Recovery | 状態不明確認、CodeBuild照会、必要時の停止・隔離 | 自動的なSQL再実行。削除や状態強制変更は別のBreakGlass承認 |
| CDKデプロイ | Phase 2以降の環境構築 | 実行時ロールとの兼用、SQL本文の取得 |

CodeBuild実行ロールはS3キーをprefixとVersionIdの両方で制限し、`s3:ExistingObjectTag` だけを根拠にしない。S3バケットポリシーでは、TLS未使用、想定KMSキー以外、非TLS、公開ACL、想定VPC Endpoint以外のアクセスを拒否する。

## 4. S3・KMS・改ざん対策

### バケット

- SQL、実行ログ、UI配信用途を分ける。SQLとログは少なくとも非公開専用バケットにする。
- Block Public Access、Versioning、S3 Object Ownership `BucketOwnerEnforced`、TLS強制、リージョン固定を有効化する。
- SQLバケットの書込みはアップロード用の短期署名PUTと、サーバーの検証済み処理だけに限定する。承認済みRevisionのキーへのPut/Deleteをアプリロールに許可しない。
- ログバケットはCodeBuildの実行ロールが新規キーだけPutでき、既存キーの上書き・Deleteを拒否する。再実行は新しいExecution IDのキーへ保存する。
- Versioningだけでは削除不能にならない。運用上の保持期間、非現行VersionのLifecycle、法的保持、削除承認、S3 Object Lockの要否を社内規程に合わせて決定する。

### 暗号化

- 推奨本番基準は環境別のcustomer managed KMS keyによるSSE-KMS。KMS key policyはS3、CodeBuild、Lambdaの用途別に分離し、キーユーザーとキーユースを分ける。
- 個人開発用既定値はダミーデータ限定のSSE-S3とする。社内導入・実データ利用前にSSE-KMSへ切り替え、KMS権限を再レビューする。
- DynamoDB、CloudWatch Logs、Secrets Managerもサービス側暗号化を有効化し、アプリログには本文・Secret値・接続文字列を出さない。個人開発用既定値ではDynamoDB PITRとVPC Flow Logsを無効化し、社内導入前に有効化する。

### 完全性

- PUT時にS3 SigV4のSHA-256チェックサムヘッダーを署名対象へ含め、S3の検証済み `ChecksumSHA256` を完了APIが取得する。
- `File`にはS3 `VersionId`、SHA-256、サイズ、検証日時を保存する。ETagはマルチパート時にSHA-256ではないため、改ざん検知の根拠にしない。
- 完了APIとCodeBuildの実行直前検証は `HeadObject` の `ChecksumMode=ENABLED` を使い、保存したVersionId・SHA-256・サイズと一致しなければ `INTEGRITY_FAILED` で停止する。SSE-KMSの場合、ChecksumModeでチェックサムを取得する主体にはKMSキーの用途限定 `kms:Decrypt`（環境・権限設計によっては `kms:GenerateDataKey`）を許可し、KMS管理権限とは分離する。
- S3のオブジェクト差し替えだけでなく、PatchメタデータのRevision変更、承認対象の変更、実行対象の環境変更も条件付き更新で拒否する。

S3の署名付きURLは指定オブジェクトへの短期アクセスを付与する機構で、SigV4ではSHA-256チェックサムも利用できる。[S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)

## 5. SQL安全性ポリシー

### dry-runの実行境界

1. CodeBuildは固定イメージ内のPostgreSQL parserでSQLを構文解析する。正規表現だけで許可・拒否を決めない。
2. SQLファイル内の `BEGIN`、`COMMIT`、`ROLLBACK`、`SAVEPOINT`、psqlメタコマンド、接続先変更を拒否する。アプリが外側のトランザクション境界を管理するためである。
3. `CREATE INDEX CONCURRENTLY`、`REINDEX CONCURRENTLY`、`VACUUM`、`CREATE DATABASE`、`ALTER SYSTEM`、`COPY ... PROGRAM`、未許可の`DO`、外部FDW/dblink、未許可拡張・外部関数など、トランザクション外または外部副作用の可能性があるものを拒否する。
4. DB接続後に専用セッションで `BEGIN`、固定した `statement_timeout`、`lock_timeout`、`idle_in_transaction_session_timeout`、検索パス、対象DBを設定し、`dry-run.sql` を実行する。
5. `ON_ERROR_STOP=1` でエラーを途中成功として扱わず、最後に明示的な `ROLLBACK` と新規接続によるセッション終了確認を行う。
6. ROLLBACK確認が得られない、接続切断・タイムアウト・CodeBuild停止などの場合は `ROLLBACK_UNCONFIRMED` または `UNKNOWN` とし、承認申請を禁止する。

実行ツールはシェルtraceを無効にし、psqlの標準出力・標準エラーを機密結果用の一時バッファへ取り込む。終了時に結果本文、件数、エラー種別、実行メタデータをLog S3へ新規Putする。CodeBuildの初期化失敗などでツールが起動できない場合は、ReconcilerがSQL本文を含まないシステム失敗ログを作成し、CodeBuildの標準ログをCloudWatchへ転送しない。ログPutが途中で失敗した場合は、部分ログ・サイズ・保存失敗を別状態として扱う。

### 完全性の限界

- PostgreSQLの通常のDML・多くのDDLはトランザクションで戻せるが、シーケンスの採番、通知、外部サービス、トリガーが呼ぶ外部処理、拡張機能、FDW、ユーザー定義関数の副作用は一律に保証できない。
- SQL parserは構文と既知の危険な構造を検査するが、関数の意味・データ依存・ロック競合・業務影響を証明しない。
- `dry-run.sql` と `execute.sql` の内容が異なるリスクがあるため、両方のハッシュ、行数、parser警告、差分サマリを承認画面に表示する。安全性を証明できない場合は拒否または手動審査とする。
- 本実行は、必ず承認時のRevision・VersionId・SHA-256を参照し、別ファイル・別Revisionの成功を流用しない。

## 6. 機密ログの制御

- CodeBuildのCloudWatch LogsとS3の標準ビルドログは初期設定で無効化し、実行ツールが暗号化Log S3へ明示的に保存する。AWSのCodeBuild設定上はCloudWatch LogsとS3 logsを選択できるため、誤って有効化されないCDKテストをPhase 2で追加する。[CodeBuild project logs](https://docs.aws.amazon.com/codebuild/latest/userguide/change-project.html)
- シェルのtrace、SQL引数、Secret値、接続URI、環境変数全体を出力しない。
- SQL結果はJSON Linesまたはプレーンテキストの構造化フォーマットで保存し、UIはHTML解釈せずtext nodeとして描画する。
- ログは最大サイズを超えたら出力を切り詰め、`truncated=true`、総バイト数、行数、切り詰め位置を記録する。途中で保存失敗した場合は、部分ログと保存失敗を別状態で残す。
- S3 GET署名URLは短時間・単一オブジェクト・認可後に発行し、UIは受け取ったURLを履歴やURLパラメータへ保存しない。URL流出時の有効期限、ブラウザキャッシュ、Referer漏えいを考慮する。

## 7. 脅威と対策

| 脅威 | 対策 |
| --- | --- |
| SQL本文のGitHub流出 | GitHubへSQLを保存しない。既存履歴に残る場合はsecret scanning、履歴改変の影響評価、資格情報・個人情報のローテーション、アクセス済み範囲の調査を行う |
| 署名URLの共有 | 短いTTL、対象キー固定、HTTPS、認可ログ、URLを画面やログに残さない。流出後の失効はVersion/キー隔離と再申請で対応 |
| 承認者なりすまし | Cognito JWT検証、sub判定、承認者グループ、自己承認拒否、条件付き更新、Audit |
| 承認後のファイル差し替え | S3 Versioning、アプリのPut/Delete拒否、VersionId・SHA-256実行直前検証 |
| 二重実行 | 申請の状態条件、DynamoDBトランザクション、Outboxリース、StartBuild idempotency token、CodeBuild実行ガード、DB台帳 |
| CodeBuildのログ漏えい | CloudWatch/S3標準ビルドログ無効、専用暗号化Log S3、trace禁止、IAM制限 |
| RDSへの横展開 | 環境別SG・Secret・IAMロール・DBユーザー、別アカウント、送信先制限 |
| DDLによるロック・停止 | allow/deny policy、statement/lock timeout、承認画面の警告、メンテナンス時間、DB監視、状態不明時停止 |
| 特権管理者による閲覧 | アプリ権限とAWS特権は別物であることを明記し、SCP、BreakGlass、CloudTrail、KMS key policy、職務分離を採用 |
