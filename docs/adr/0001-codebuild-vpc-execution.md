# ADR-0001: CodeBuildをPrivate SubnetからRDSへ接続する

- Status: Accepted
- Date: 2026-10-17
- Owners: SQL Patch Manager
- Reviewers: Tech Lead / Security / Infrastructure / Database / SRE

## Context

SQL実行はRDS PostgreSQLへ到達する必要がある。API LambdaへDB接続を持たせると、接続プール、タイムアウト、長時間処理、ログ回収、Lambda VPC経路の責務が増える。実行環境から外部インターネットへ出る経路は、SQL本文やSecretの流出面にもなる。

## Decision

環境別CodeBuildをVPCのPrivate Subnetへ配置し、専用Security Groupから環境別RDSのTCP 5432へTLS接続する。S3/DynamoDB Gateway EndpointとSecrets Manager Interface Endpointを使い、初期構成ではNAT Gateway、Internet Gateway、Public Subnetを採用しない。依存物は固定された実行イメージへ含める。

## Alternatives considered

| 案 | 利点 | 欠点 | 判断 |
| --- | --- | --- | --- |
| LambdaからRDS | サービス数が少ない | 長時間処理・接続管理・VPC/NATの責務が増える | 不採用 |
| CodeBuild + NAT | 公開エンドポイントへ容易に接続 | コスト、外部流出経路、許可リスト運用が増える | 標準では不採用 |
| CodeBuild + Private Subnet + Endpoint | RDS到達、AWS内通信、コスト抑制 | Endpoint管理、固定イメージが必要 | 採用 |

## Consequences

- NAT不要で外部通信を減らせる。
- CodeBuild実行ロール、Endpointポリシー、S3/KMSポリシーの設計が必要。
- 依存ライブラリは実行時にインターネットから取得せず、更新時に検証・再ビルドする。
- 外部依存が必要になった場合はNATを暗黙に追加せず、新しいADRで再評価する。

## Revisit conditions

依存物の取得、社内Proxy、外部監視、別リージョンアクセス、CodeBuild制約が変わった場合に再評価する。

