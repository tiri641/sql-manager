# ADR-0006: 個人開発向け低コスト環境プロファイル

- Status: Accepted
- Date: 2026-10-17
- Owners: SQL Patch Manager
- Reviewers: Loop Coordinator / Tech Lead / Security / Infrastructure / SRE / Quality
- Amends: [ADR-0004](0004-phase2-cdk-environment-boundary.md), [ADR-0005](0005-phase2-security-warning-remediation.md)

## Context

本プロジェクトは個人開発・学習から開始する。処理フロー、状態遷移、認証認可、承認分離、SQL実行の安全対策は本番を意識するが、dev/test/prod相当のAWSリソースを高可用構成で常時稼働させる必要はない。個人AWSアカウントでは固定費と誤作成リスクを最小化する。

## Decision

Phase 2の個人開発用既定値は次とする。

- 全環境のVPCは1 AZ、Private Isolated Subnet、NAT Gatewayなし、Internet Gatewayなしとする。
- S3はSSE-S3を使用する。カスタマーマネージドKMSキーは作成しない。
- CognitoはEssentialsを使用し、Threat Protection/Plusは有効化しない。MFA、強いパスワードポリシー、JWT検証、API側認可は維持する。
- DynamoDBのPITRとVPC Flow Logsは個人開発用既定値では無効とする。
- devだけ`db.t4g.micro`、20GB、Single-AZのダミーRDSを定義する。
- test/prodは外部RDSとSecretの参照境界だけを定義し、RDSを作成しない。
- CodeBuildは`SMALL`、同時実行1、自動再試行0、Private Subnet、S3ログのみを維持する。
- 月額Budgetはdev 35 USD、test 15 USD、prod 15 USDとする。Budgetは請求上限ではなく通知用のしきい値である。

以下の本番強化は設定変更として残す。

- 2 AZ以上、VPC Flow Logs、DynamoDB PITR、SSE-KMS、Cognito Plus/Threat Protection、WAF/Geo restriction、RDS Multi-AZ、長期保持。

## Alternatives

| 案 | 判断 |
| --- | --- |
| 全環境を2 AZ、KMS、PITR、Cognito Plusで常時稼働 | 不採用。個人開発の固定費に対して過剰 |
| test/prodにもダミーRDSを作る | 不採用。RDS料金と誤接続リスクが増える。外部RDS参照境界だけを維持 |
| NAT Gatewayを追加する | 不採用。固定費とインターネット経路が増える |
| セキュリティ・承認・実行ガードを簡略化する | 不採用。コスト削減と安全な処理フローは分離する |

## Consequences

### Positive

- 個人AWSアカウントで3環境相当のCDK synth・テストを低コストで検証できる。
- 本番想定の責務分離、権限境界、失敗状態、承認・実行フローは維持できる。
- 本番強化の差分が`EnvironmentConfig`の設定として追跡できる。

### Negative / Risks

- 1 AZ、PITRなし、Flow Logsなし、SSE-S3、Cognito Essentialsは本番の可用性・監査・脅威検知基準ではない。
- Cognito Plusを無効化するため、個人開発環境ではThreat Protectionを検証できない。
- dev RDSを常時稼働させると、Interface Endpointと合わせてBudgetを超える可能性がある。未使用時はdev環境を停止または削除する運用が必要である。

## Revisit / rollback conditions

- 社内導入、実データ、社外公開、本番DB接続のいずれかを開始する前に、2 AZ、SSE-KMS、PITR、Flow Logs、Threat Protection、WAF、RDS可用性を再承認する。
- 個人情報や会社機密を扱う場合は、このADRの個人開発用既定値を適用しない。
