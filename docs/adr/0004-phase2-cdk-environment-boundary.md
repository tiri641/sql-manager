# ADR-0004: Phase 2 CDKの環境境界とデプロイ禁止

- Status: Accepted
- Date: 2026-10-17
- Owners: SQL Patch Manager
- Reviewers: Loop Coordinator / Tech Lead / Security / Infrastructure / Database / SRE / Platform / Quality / Privacy / Release Manager
- Supersedes: なし

## Context

Phase 2では、将来のAWS環境を再現可能なCDKとして定義する必要がある。一方、個人AWSアカウントでの誤作成、RDS料金、実データ接続、Secretの混入を避ける必要がある。Phase 1では`apps/`と`infra/`は設計上の配置だったが、Phase 2からCDKとLambdaの骨格を追加する。

## Decision

- Phase 2はCDKコード、Lambda骨格、テスト、`cdk synth`、`cdk-nag`までとし、`cdk bootstrap`・`cdk deploy`・AWS API操作・実RDS接続・SQL実行を行わない。
- `NetworkStack`、`StorageStack`、`DatabaseStack`、`ControlPlaneStack`、`ExecutionStack`に責務を分割する。
- 開発環境は将来作成可能なダミーRDSをCDKで定義する。検証・本番のRDSは外部所有を標準とし、Secret名などの参照境界だけを定義する。
- 開発のSQL・実行ログS3暗号化はSSE-S3、検証・本番相当はSSE-KMSとする。CloudFront/S3アクセス監査ログ専用バケットは配信互換性のためSSE-S3とし、SQL本文・実行結果を保存しない。実際のキー・アカウント・Secret値はcontextへ入れない。
- 実行VPCにはPublic Subnet、Internet Gateway、NAT Gatewayを標準配置せず、S3/DynamoDB Gateway EndpointとSecrets Manager Interface Endpointを使用する。
- CodeBuildはPrivate SubnetへのVPC build ENI、環境別IAM、同時実行1、自動再試行0、CloudWatch Logs無効のFail-Closedプレースホルダーとする。

## Alternatives considered

| 案 | 利点 | 欠点 | 判断 |
| --- | --- | --- | --- |
| Phase 2でdevへdeployする | 実環境との差分を早く確認できる | AWS料金、誤接続、Secret・DB作成の外部副作用が発生する | 不採用。Phase 3以降に別Gateで判断 |
| 全環境のRDSをCDK管理する | IaCで一貫する | 社内導入時の既存RDS所有境界を壊しやすい | 不採用。devのみダミー、test/prodは外部参照 |
| NAT Gatewayを標準配置する | 外部依存の取得が容易 | 固定費、外部流出経路、実行時依存が増える | 不採用。固定イメージとEndpointを優先 |
| 全環境SSE-S3 | 安価で簡単 | 本番の鍵分離・監査要件に弱い | 不採用。prod相当はSSE-KMS |

## Consequences

### Positive

- Phase 2の検証はAWS資格情報なしで再現できる。
- RDS所有境界、暗号化、IAM、ネットワーク、CodeBuildの重要な境界をCloudFormationテンプレートで検査できる。
- 後続Phaseでdevを作成するか、外部RDSへ接続するかを設定差分として変更できる。

### Negative / Risks

- `cdk synth`だけでは実際のVPC Endpoint、RDS、CodeBuild、Secretの接続可否を証明できない。
- CloudFront ACM証明書ARNなど、デプロイ時に必要な外部設定が残る。
- devダミーRDSのDeletion Protection、Multi-AZ、Secret rotationはコスト・用途の理由で抑制している。

### Operational impact

- Phase 3開始前に、リージョン、Budget、デプロイアカウント、RDS接続方式、Secret rotation、削除・復旧手順を決定する。
- `cdk diff`、料金確認、AWSアカウント・リージョン確認をdeploy前Gateにする。

## Security and privacy

- Secret値、SQL本文、実行ログ、個人情報はリポジトリ、DynamoDB、通常ログ、Plan、PRへ保存しない。
- CodeBuildのログは専用S3へ保存するが、Phase 2のBuildSpecはSQL実行を禁止する。
- cdk-nagの抑制はdev用途またはAWSサービス固有のワイルドカードに限定し、理由をコードへ記録する。

## Validation

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run cdk:synth`
- `npm run cdk:nag`
- `npm run security:scan`

## Revisit / rollback conditions

- 実際のAWSアカウントへdeployする前に本ADRを再レビューする。
- RDS所有者、ネットワーク、IdP、暗号鍵、保持期間、CodeBuildイメージが変わる場合は新しいADRでAmendする。
