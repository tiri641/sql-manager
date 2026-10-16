# ADR-0003: CodeBuildマネージドサービスとVPC build ENIの境界を明確化する

- Status: Accepted
- Date: 2026-10-17
- Owners: SQL Patch Manager
- Reviewers: Tech Lead / Security / Infrastructure / SRE
- Relation: Amends ADR-0001

## Context

CodeBuildはAWSマネージドサービスであり、CodeBuildサービスそのものをVPCのSubnetへ配置するわけではない。一方、VPC設定付きのビルドでは、ビルド実行時のVPC build ENIを指定Subnetへ作成して、RDSやVPC Endpointへ到達させる。図でこの境界を曖昧にすると、CodeBuildサービス、ビルド実行環境、VPC内ネットワークの責務を誤認する。

## Decision

ADR-0001のネットワーク判断は維持し、以下の表現を標準とする。

- CodeBuildはマネージドサービスとしてVPCの外側にある。
- CodeBuildプロジェクトのVPC設定で、ビルド実行時のVPC build ENIを環境別Private Subnetへ作成する。
- VPC build ENIからRDSのTCP 5432、S3/DynamoDB Gateway Endpoint、Secrets Manager Interface Endpointへ必要最小限で到達させる。
- NAT Gateway、Internet Gateway、Public Subnetは初期の実行VPCへ配置しない。
- AWS構成図と実装時のCDKコメントでは、CodeBuildサービスとVPC build ENIを同一のVPC内リソースとして表現しない。

## Consequences

- AWS構成図の配置が実際のCodeBuild VPC設定と対応する。
- CodeBuildプロジェクトのVPC設定、サービスロール、Endpoint、Security Groupを個別に検証する必要がある。
- 外部依存を実行時に取得する場合は、NATまたは別の事前ビルド経路を新しいADRで再評価する。

## Validation

- [AWS CodeBuild VPC support](https://docs.aws.amazon.com/codebuild/latest/userguide/vpc-support.html)
- [AWS CodeBuild VPC endpoints](https://docs.aws.amazon.com/codebuild/latest/userguide/use-vpc-endpoints-with-codebuild.html)
- `docs/diagrams/aws-infrastructure.py` のPNG生成と目視確認

## Revisit / rollback conditions

CodeBuildのVPC接続仕様、使用するEndpoint、外部依存、アカウント分離方針が変わる場合に再評価する。
