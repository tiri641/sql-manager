# Plan Review: 個人開発向け低コスト環境プロファイル

- Review date: 2026-10-17
- Status: PLAN_APPROVED
- Scope: Phase 2 CDK環境設定のコスト最適化
- External side effects: なし。AWS deploy、AWS API操作、DB接続、SQL実行、Push、PR作成は行わない。

## Draft plan

個人AWSアカウントでdev/test/prod相当を検証できるようにしつつ、常時稼働の固定費を抑える。SQLパッチの状態遷移、承認分離、IAM、S3非公開、VersionId/SHA-256検証、CodeBuild実行ガードなどの本番想定の設計は変更しない。

変更対象は次のとおり。

- `EnvironmentConfig`にAZ数、VPC Flow Logs、DynamoDB PITR、Cognito Feature Planを明示する。
- 個人開発用の全環境既定値を1 AZ、NATなし、SSE-S3、Cognito Essentials、短期保持、PITR/Flow Logsなしにする。
- devのみ低コストのダミーRDSを定義し、test/prodは外部RDSの参照境界だけを残す。
- 本番相当へ移行する場合に、2 AZ、SSE-KMS、Cognito Plus/Threat Protection、PITR、VPC Flow Logsへ切り替えられる設定境界を文書化する。
- CDKテストで低コスト既定値と環境境界を固定する。
- ADR、architecture、operations、security、status、図のラベルを現行設定と一致させる。

## Role reviews

### Loop Coordinator / Tech Lead

- 判定: Pass
- 必須のSQL実行フロー、認証認可、承認者分離、実行状態不明の扱いは変更しない。
- test/prodを「低コスト設定」にすることと、test/prod RDSをCDKで作成しないことを明確に区別する。
- 本番強化は同じ設定項目の切替として残し、個人開発の既定値を社内導入の本番基準と誤認させない。

### Security Engineer

- 判定: Pass with conditions
- SSE-S3、Cognito Essentials、PITR/Flow Logsなしはダミーデータ限定とする。
- SQL、実行ログ、Secretの非公開、署名URL、API側認可、自己承認拒否、環境別IAMは維持する。
- 社内導入前にSSE-KMS、Threat Protection、PITR、VPC Flow Logs、WAF/Geoを必須再評価する。

### Infrastructure Engineer

- 判定: Pass
- 1 AZのInterface Endpointは個人開発のコスト最適化として妥当。NAT GatewayとInternet Gatewayは引き続き配置しない。
- S3/DynamoDB Gateway Endpointは維持し、Secrets Manager Interface Endpointだけを1 AZにする。
- dev RDSは`t4g.micro`、20GB、Single-AZのままとし、test/prodは外部DB参照のみとする。

### SRE

- 判定: Pass with conditions
- PITRとVPC Flow Logsを無効化するため、個人開発用プロファイルでは復旧・ネットワーク監査能力が低下することを明記する。
- 本番相当プロファイルではPITR、Flow Logs、Multi-AZ/復旧手順を有効化する。

### Quality Engineer

- 判定: Pass
- CDK AssertionsでAZ数、暗号化方式、Cognito tier、PITR、Budget、RDS所有境界を検証する。
- 本変更はAWS上の実リソースを作成せず、synthとテストで検証する。

## Review result

- Blocking: 0
- High: 0
- Conditions: 個人開発用既定値を社内導入の本番基準へ持ち込まないこと。Phase 3 deploy前に強化設定と料金上限を再承認すること。
- Decision: `PLAN_APPROVED`
