# 運用設計

## 1. 環境構成

| 環境 | 用途 | DB | 承認 | 推奨分離 |
| --- | --- | --- | --- | --- |
| 開発 | 個人開発・単体/結合テスト | ダミーRDS PostgreSQL | 開発用承認者。自己承認は本番同様に禁止 | 個人アカウント内の専用VPC/SG/Secret |
| 検証 | E2E、障害、負荷、権限テスト | 個人開発は外部参照のみ。必要時に別途検証用DBを用意 | 検証グループ | 別アカウントまたは別VPC |
| 本番 | 社内導入後の業務DB | 社内導入時の本番RDS | 厳格な環境グループ、職務分離 | 別AWSアカウント、別KMS、別IAM境界 |

環境ごとにCodeBuildプロジェクト、実行IAMロール、DB Secret、DB SG、RDS endpoint、許可SQLポリシーを持つ。環境選択はクライアントの文字列を信頼せず、サーバー側の環境設定を参照する。

### Phase 2の運用境界

Phase 2では、CDKテンプレートを合成・検査するだけで、`cdk bootstrap`、`cdk deploy`、AWSリソース作成、RDS接続、SQL実行は行わない。初回deploy前には、対象アカウント・リージョン、Budget通知先、削除・復旧方針、外部RDS接続、Secret rotation、CloudFront証明書を別Gateで確認する。

### CloudFront・Cognitoのdeploy前後Gate

1. 個人開発ではCognito Essentialsを使用する。社内導入・実データ利用前に、Cognito Plusの料金上限とThreat Protection要件を承認する。
2. CloudFront用ACM証明書が`us-east-1`にあり、`UiDomainName`が証明書のSANに含まれることを確認する。`UiCertificateArn`と`UiDomainName`の実値はリポジトリへ保存しない。
3. 初回deploy後にCloudFront Distribution IDを確認し、KMS Key policyのCloudFront Source ARNがDistribution IDだけを許可していることを確認する。CDKが初回循環依存回避のため生成した`distribution/*`ワイルドカードを残したまま本番利用しない。
4. 社外公開または機密UIを許可する前に、CloudFront WAF、Geo restriction、レート制限、ログ保持を再評価し、必要な構成を別レビューで承認する。

## 2. 監視とアラーム

### メトリクス

- API: 4xx/5xx、Latency、Throttles、署名URL発行数、認可拒否数。
- Lambda: Errors、Duration、Throttles、ConcurrentExecutions、Outbox滞留、未処理例外。
- DynamoDB: ThrottledRequests、ConsumedCapacity、ConditionalCheckFailedRequests、TransactionConflict、GSI遅延。
- S3: 4xx/5xx、IncompleteMultipartUpload、サイズ、Version数、Lifecycle失敗、CloudTrail data event。
- CodeBuild: ビルド失敗、タイムアウト、開始待ち時間、環境別同時実行数、重複抑止数、結果ログ保存失敗。
- RDS: CPU、FreeStorage、DatabaseConnections、Read/Write IOPS、Locks、Deadlocks、FreeableMemory、Performance Insights。
- 業務: `UNKNOWN`、`ROLLBACK_UNCONFIRMED`、`DISPATCH_UNKNOWN`、承認待ち滞留、ログなし終端Execution。

### アラーム

通常の運用ログにはSQL本文やSELECT結果を出さず、`patchId`、`executionId`、`requestId`、環境、状態、エラーコード、件数、サイズだけを記録する。PIIを含むDBエラーの全文はLog S3へ隔離し、CloudWatchへ要約だけを出す。

## 3. 障害対応Runbook

### CodeBuild起動漏れ・状態不整合

1. `executionId`、Outbox、Patch、Audit、CodeBuildプロジェクトを照合する。
2. `QUEUED`/リース期限切れを確認し、StartBuild応答不明ならBuild一覧とattemptIdを調査する。
3. Buildが見つかればDynamoDBのBuild IDを条件付きで補完し、SQL実行済みかログを確認する。
4. Buildが見つからない場合も、直ちに再実行せず、待機後に `DISPATCH_UNKNOWN` として人手承認を求める。

### DB結果不明

1. 自動再実行を停止する。UIにも再実行ボタンを表示しない。
2. Log S3の最後の確定イベント、RDS接続、DB監査、対象テーブル、`pg_stat_activity`をDBAが確認する。
3. 実行済みと判明した場合はExecutionを手動確認済みへ更新し、再実行が必要なら新しい申請・承認を作る。
4. 未実行と確定できる場合だけ、承認者と運用管理者が再実行方針を決定する。結果不明のまま再実行しない。
5. 影響がある場合はRDSバックアップ/PITR、スナップショット、手動補正、業務連絡を実施する。

### ROLLBACK未確認

dry-runは成功扱いにせず、接続が残っていないか、ロック、対象データ、DB監査、セッション状態を確認する。確認不能なら本番承認を禁止し、新Revisionまたは別途DBA手順へ移行する。

## 4. バックアップ・復旧

- RDS automated backup、保持期間、PITR、手動スナップショット、復元先、復元テスト頻度を環境ごとに設定する。
- S3 SQL/LogはVersioning、Lifecycle、必要ならObject Lock/法的保持を設定する。復元テストでVersionId・KMS権限も確認する。
- 個人開発用既定値ではDynamoDBのPoint-in-Time Recoveryを無効化する。社内導入時は有効化し、Audit/Approval/Executionの復元整合性を検証する。
- Cognito、KMS、Secrets Managerの復旧手順と、BreakGlassの保管を別文書で管理する。
- RTO/RPOは本番業務オーナーと決める。SQLロールバックの成功をRPO/RTOの代替にしない。

## 5. 保持期間・削除

初期値は暫定であり、社内規程確定後に変更する。

| データ | 開発 | 検証 | 本番候補 |
| --- | --- | --- | --- |
| SQL非現行Version | 30日 | 30日 | 規程・法的保持に従う |
| 実行Log | 30日 | 30日 | 1年以上を候補に業務・法務確認 |
| Execution/Approval | 90日 | 1年 | 監査規程に従う |
| Audit | 1年 | 1年以上 | 改ざん防止・法的保持に従う |
| 失敗アップロード | 7日 | 30日 | 監査・調査後に削除 |

削除は不可逆操作のため、保持期間、法的ホールド、事故調査、管理者承認を確認する。S3オブジェクトはVersioningの非現行Versionも対象にする。

## 6. コスト管理

- CodeBuildのCompute Type、ビルドタイムアウト、同時実行数、リトライ回数を環境別に制限する。
- 個人開発はRDS停止時間、S3ライフサイクル、DynamoDBオンデマンド、SSE-S3の選択を検討する。ただし本番基準へ移行するときはSSE-KMS、PITR、Multi-AZなどを再評価する。
- NAT Gatewayは標準構成に含めない。依存取得のために一時導入する場合は、外部通信先・時間・EIP・削除確認を記録する。
- VPC EndpointはS3/DynamoDB Gatewayを優先し、Secrets Manager Interface Endpointは必要なAZ数に絞る。
- Phase 2ではAWS Budgetsの予算定義だけを合成する。通知先、Cost Anomaly Detection、環境別Cost Allocation Tagは、AWSアカウント・通知先・デプロイ対象を確定した後のdeploy前Gateで設定する。Budgetは請求上限ではない。

## 7. GitHubに機密SQLが残っている場合

移行前に、GitHub履歴、fork、Actions artifact、キャッシュ、ログ、Issue/PRコメントを調査する。履歴から削除しても既に取得されたコピーを消せるとは限らない。個人情報・認証情報が含まれる場合は、影響評価、アクセスログ調査、必要な資格情報ローテーション、関係者・法務・セキュリティへの報告を先に行う。履歴の書換えは共同利用者のcloneと整合しないため、技術的削除だけで是正完了とみなさない。

## 8. 設計とCDKの整合性検証

Phase 2以降は次をCIの設計Gateにする。

1. CDK `synth`で全環境のテンプレートを生成する。
2. cdk-nagまたはAWS Config相当でS3公開、暗号化、IAMワイルドカード、CodeBuildログ、RDS公開、SG 0.0.0.0/0を検査する。
3. CDKコンテキストから環境名・CodeBuildプロジェクト・Secret ARN・S3 bucket・VPC Endpointを抽出し、構成図のモデルと比較する。
4. APIの状態遷移テスト、DynamoDB条件式テスト、CodeBuildのログ設定テストを実行する。
5. 構成図ソースを変更したらPNGを再生成し、差分レビューを必須にする。
