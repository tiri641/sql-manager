# アーキテクチャ設計

## 1. 結論

コントロールプレーンとSQL実行プレーンを分離する。ReactはCloudFront + S3で配信し、認証はAmazon Cognito、APIはAPI Gateway + Lambda、状態はDynamoDB、SQLと結果ログは非公開S3に保存する。LambdaはRDSへ接続せず、環境別AWS CodeBuildがVPCのPrivate Subnet内からRDS for PostgreSQLへ接続する。

[システムアーキテクチャ図のMermaidソース](diagrams/system-architecture.mmd)

## 2. 論理コンポーネント

| コンポーネント | 責務 | SQL本文の扱い |
| --- | --- | --- |
| React / CloudFront / S3 | 画面配信、S3署名URLへのアップロード、API呼び出し | ブラウザ上だけで扱い、APIログへ送らない |
| Cognito | ユーザー認証、グループ・属性の発行、MFA。個人開発はEssentials、社内導入時はPlus/Threat Protectionを選択 | 本文を扱わない |
| API Gateway / API Lambda | API入力検証、申請単位の認可、署名URL発行、状態遷移 | リクエスト本文にSQLを含めない |
| DynamoDB | Patch、Revision、File metadata、Execution、Approval、Audit、Outbox | 本文を保存しない。SHA-256・VersionIdのみ |
| SQL S3 | SQLオブジェクトの暗号化保存、Versioning、保持・削除制御 | 本文を保存 |
| Log S3 | CodeBuildが生成した実行結果、失敗時の診断最小情報 | SELECT結果等を含み得るため機密扱い |
| EventBridge / Dispatcher Lambda（Phase 3 planned） | Outboxの定期確認・起動漏れ検知、CodeBuild起動、状態反映 | EventBridgeはキューやSQL自動再実行ではない。本文をイベントに載せない |
| CodeBuild | SQLの取得、検査、DB接続、dry-run/execute/rollback、結果ログ作成 | 実行時にだけ取得し、標準出力をCloudWatchへ送らない |
| Secrets Manager | 環境別DB接続情報、ローテーション | Secret ARNだけを状態に保存 |
| RDS PostgreSQL | 開発・検証・本番の接続先 | 実行対象データを保持 |

## 3. データフロー

1. Cognito認証済みブラウザが `POST /patches` を呼び、API LambdaがPatch/Revisionを作成する。
2. API Lambdaが許可された固定S3キーに対する短期PUT署名URLを発行する。ブラウザはSQL本文をS3へ直接PUTする。
3. 完了APIがS3 `HeadObject` とチェックサムを検証し、VersionId・SHA-256・サイズ・構成をDynamoDBへ保存する。
4. ドライラン開始時は、ファイル状態・Revision・所有者・同時実行制御を条件付きで確認し、ExecutionとOutboxをTransactWriteItemsで作成する。
5. DispatcherがOutboxをリースし、環境別CodeBuildへ実行ID、Revision、S3キー、期待VersionId、期待SHA-256を渡す。SQL本文はイベントへ渡さない。
6. CodeBuildはS3から対象VersionIdを取得し、SHA-256を再計算して一致を確認する。Secrets ManagerからDB接続情報を取得し、RDSへTLS接続する。
7. CodeBuildは実行結果を暗号化済みLog S3へ一度だけ保存し、DynamoDBへ完了状態を反映する。状態不明時は成功扱いにしない。
8. 承認後の本実行は追加操作なしで同じ非同期経路を使い、`execute.sql`の再検証後に実行する。
9. UIは権限確認後にだけログ・SQLの短期GET署名URLを取得し、テキストとして表示する。

## 4. ネットワーク設計

### 4.1 配置

- CloudFront、S3、Cognito、API Gateway、DynamoDB、EventBridge、Secrets ManagerはAWSマネージドサービスとして利用する。
- EventBridgeはPhase 3で採用する場合も定期確認・起動漏れ検知のSchedulerとし、耐久配送とSQL再実行はOutbox・Dispatcher・選択したキューの責務として別途確定する。[ADR-0008](adr/0008-eventbridge-scheduler-and-dispatch-queue-boundary.md)
- 個人開発用既定値ではCognito `FeaturePlan.ESSENTIALS`を使用する。社内導入・実データ利用時は`FeaturePlan.PLUS`とThreat Protectionを再評価する。
- CloudFrontのACM証明書ARNとAlternate Domain Nameはdeploy時パラメータで与え、`UiDomainName`を証明書のSANと一致させる。実値はリポジトリやcontextへ保存しない。
- API LambdaはDB接続を行わないため、初期案ではVPCへ入れない。これによりLambdaのNAT経由を避ける。
- CodeBuild自体はAWSマネージドサービスであり、ビルド実行時のVPC build ENIを環境ごとの専用VPCのPrivate Subnetへ作成する。RDSもPrivate Subnetに置く。構成図ではCodeBuildサービスとVPC内の到達経路を混同しないように表記する。
- CodeBuild用Security GroupからRDS用Security GroupのTCP 5432へのみ到達可能にする。RDS側のInboundはCodeBuild SGをソースとし、CIDRを直接許可しない。
- Private SubnetにInboundルールは設定しない。Egressも必要な宛先・ポートに限定する。

### 4.2 NAT GatewayとVPC Endpointの判断

| 要素 | 初期案 | 理由・代替案 |
| --- | --- | --- |
| NAT Gateway | 不採用 | 実行時に外部依存を取得しない固定CodeBuildイメージを使い、毎時課金とデータ処理費、外部流出経路を避ける。依存取得が必要な開発時だけ、許可リスト付きNATまたは事前ビルドを検討する |
| Internet Gateway / Public Subnet | 実行VPCでは不採用 | CodeBuildとRDSを公開しない。CloudFrontのエッジ通信はVPC内経路ではない |
| S3 Gateway Endpoint | 採用 | SQL・ログのS3アクセスをAWSネットワーク内に閉じ、Gateway Endpointは通常Interface Endpointよりコストを抑えやすい |
| DynamoDB Gateway Endpoint | 採用 | CodeBuild側の実行ガード・結果メタデータ更新をAWSネットワーク内で行う |
| Secrets Manager Interface Endpoint | 採用 | DB Secret取得に必要。個人開発は1 AZ、社内導入は可用性要件に応じて2 AZ以上とする |
| CodeBuild Interface Endpoint | 初期の実行コンテナには不要 | Dispatcher LambdaはVPC外からCodeBuild APIを呼ぶ。VPC内からCodeBuild APIを呼ぶ運用ツールを追加する場合に採用 |
| CloudWatch Logs Interface Endpoint | CodeBuildでは不採用 | CodeBuildのCloudWatch Logsを無効化し、SQL出力は専用Log S3へ保存する。Lambdaの運用ログはLambdaサービス経由でCloudWatchへ送る |
| STS Interface Endpoint | 初期案では不採用 | CodeBuildの実行ロール資格情報を直接使い、実行中のロールチェーンを行わない。採用する場合は追加する |

AWS CodeBuildのVPCビルドはVPC内リソースへ接続できる一方、公開エンドポイントへ出るにはNAT等が必要であるため、初期案は依存物を固定する。採用したVPC Endpointとバケットポリシーは同一リージョンに限定する。[AWS CodeBuild VPC support](https://docs.aws.amazon.com/codebuild/latest/userguide/vpc-support.html)、[CodeBuild VPC endpoints](https://docs.aws.amazon.com/codebuild/latest/userguide/use-vpc-endpoints-with-codebuild.html)

## 5. CodeBuildからRDSへの接続

1. Dispatcherは環境別プロジェクトのみを起動できる環境別IAMロールを使う。
2. CodeBuildは専用の実行ロールでSecrets Managerの対象Secret ARNだけを `secretsmanager:GetSecretValue` する。
3. Secretには `host`、`port`、`database`、`username`、`password`、`sslmode`、`caBundleVersion` を持たせ、パスワードをDynamoDBや環境変数の平文へ出さない。
4. `sslmode=verify-full` とRDS CA証明書を使い、RDSのSecurity GroupでTCP 5432をCodeBuild SGからのみ許可する。
5. DBユーザーは環境ごと、用途ごとに分ける。マスター／管理者ユーザーは使わず、必要なスキーマ権限だけを持つ実行ユーザーを作成する。DDLは所有権・ロック・拡張機能権限を別途審査する。
6. 初期案はSecrets Manager管理パスワードを採用する。IAM DB Authenticationはパスワードレスの代替案だが、トークン有効期限、`rds_iam`、TLS必須、運用ロール設計を検証してから切り替える。

DB結果不明の相関を強めるため、対象環境のDB所有者が許可する場合は、パッチSQLとは別に事前プロビジョニングした `sql_patch_manager.execution_ledger` を使用する。`executionId` と `operation` の一意制約、`patchId`、Revision、ファイルSHA-256、attemptId、開始時刻、終端状態を記録し、同じExecutionの再実行をDB側でも検出する。ただし、この台帳はDynamoDBの実行ガードの代替ではない。台帳自体への書込み失敗や、SQL送信後の接続切断は `UNKNOWN` として手動確認し、台帳の存在だけでSQL成功を証明しない。台帳を許可できない既存DBでは、RDS監査・対象データ・接続相関を使う手動確認手順へ切り替える。

RDSはTLS接続をサポートし、IAM DB Authenticationも選択肢だが、DBユーザーへ必要最小限の権限を与える点は共通である。[RDS database authentication](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/database-authentication.html)、[RDS PostgreSQL SSL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)

## 6. 環境分離

### Phase 2 CDK実装境界

Phase 2では、論理設計を以下のCDK Stackへ分割して定義する。これはCloudFormationテンプレートを合成するための実装であり、AWSアカウントへデプロイ済みであることを意味しない。

| Stack | Phase 2の責務 | RDS/SQLの扱い |
| --- | --- | --- |
| `NetworkStack` | VPC、Private Isolated Subnet、Security Group、S3/DynamoDB Gateway Endpoint、Secrets Manager Interface Endpoint、条件付きVPC Flow Logs | DB接続なし |
| `StorageStack` | UI、SQL、実行ログ、アクセスログの非公開S3、Versioning、SSE-S3（社内導入時SSE-KMS）、CloudFront OAC | SQL本文を実行しない |
| `DatabaseStack` | devのダミーRDS定義、test/prodの外部Secret参照境界 | Phase 2では作成・接続しない |
| `ControlPlaneStack` | Cognito、HTTP API JWT Authorizer、DynamoDB、Lambda骨格、APIアクセスログ | SQL本文・Secret値を扱わない |
| `ExecutionStack` | 環境別CodeBuild、VPC build ENI、IAM、retry 0、同時実行1、`NO_SOURCE`/`NO_ARTIFACTS`、標準ログ無効のFail-Closed BuildSpec | Phase 3までSQL実行不可。Phase 2はSQL/Log S3、DynamoDB、Secret、KMSのデータプレーン権限を付与しない |
| `BudgetStack` | 環境別の月額Budget定義 | 通知先はdeploy前に設定 |

個人開発用既定値は全環境SSE-S3、1 AZ、DynamoDB PITRなし、VPC Flow Logsなし、devのみ将来作成可能なダミーRDS、test/prodは外部RDS参照とする。社内導入時は環境設定でSSE-KMS、2 AZ以上、PITR、VPC Flow Logs、Cognito Plus/Threat Protectionへ切り替える。CloudFront/S3アクセス監査ログ専用バケットは配信互換性のためSSE-S3とし、SQL本文・実行結果を保存しない。CloudFront証明書ARNとドメイン名はdeploy時パラメータで渡し、contextやリポジトリへ実値を保存しない。KMS + OACの初回ワイルドカードポリシーはCDKの循環依存回避による既知の例外であり、KMSを有効化する環境では初回deploy後にDistribution IDへ絞る。

Phase 2のCodeBuildは実行プレーンの将来境界を合成検証するだけで、ソース、成果物、標準ビルドログ、SQL/Log S3、DynamoDB、Secretへのデータプレーン権限を持たない。SQL取得、DB接続、結果ログの明示的な新規Put、実行状態更新はPhase 3で実行単位のIAMとテストを追加する。

Phase 2の検証は`npm test`、`npm run typecheck`、`npm run build`、`npm run cdk:synth`、`npm run cdk:nag`、`npm run security:scan`で行う。`cdk bootstrap`、`cdk deploy`、実RDS接続、SQL実行はPhase 2の対象外である。

### 個人開発・検証

コストを抑えるため単一AWSアカウント内に `dev`、`test`、`prod-like` のリソースを分けることを許容する。個人開発用のtest/prodは外部RDS参照境界だけを合成し、RDSを作成しない。ただし、CodeBuildプロジェクト、IAMロール、Secret、Security Group、RDS、S3 prefix/bucket、DynamoDBの環境属性を分離し、本番DBは絶対に接続しない。

### 社内導入

推奨はAWS Organizations配下のTools/Development/Verification/Productionアカウント分離である。少なくともProductionは別アカウントにし、中央UIから環境別実行ロールをAssumeRoleする構成へ拡張する。アカウント分離が難しい場合の代替は、同一アカウント内の別VPC・別KMSキー・別IAMロール・明示的な環境条件付きポリシーであるが、権限境界と誤接続防止の強度は下がる。

## 7. コストと容量の初期想定

- S3、DynamoDBは少量利用では従量課金が中心だが、ログ・Versioning・不完全Multipart Uploadのライフサイクルを設定する。
- CodeBuildは実行時間課金のため、タイムアウト、並列数、Compute Type、不要な再実行を制限する。
- NATを使わない代わりに、Secrets Manager Interface EndpointのAZ数・時間課金、KMSキー、CloudFront、CloudWatchを見積もる。
- VPC Endpointは最初は必要最小限とし、通信要件が変わった場合に追加する。リソース作成時はAWS Pricing Calculatorでリージョンと利用時間を再確認する。

## 8. 代替案

| 代替 | 不採用理由 |
| --- | --- |
| LambdaからRDSへ直接接続 | LambdaをVPCへ入れる必要、接続プール・タイムアウト・Secrets取得経路が増える。SQL実行時間・ログ収集に不向き |
| ECS/Fargateタスク | 長時間・カスタム実行には向くが、初期の実行回数と運用負荷に対してCodeBuildより構築量が多い |
| Step Functions Standard | 状態管理は強いが、CodeBuild外部起動の二重実行・SQLACK不明は別途扱う必要がある。将来の複雑な分岐で採用候補 |
| NAT Gateway | 公開アクセスとコストが増える。固定イメージとVPC Endpointで代替できる間は採用しない |
| CloudWatch Logsへ実行出力 | PIIを含む可能性があるため、一般運用ログと同じ流路に流さず、暗号化Log S3に隔離する |
