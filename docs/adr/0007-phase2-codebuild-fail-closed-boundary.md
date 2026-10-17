# ADR-0007: Phase 2 CodeBuildのFail-Closed実行境界

- Status: Accepted
- Date: 2026-10-17
- Owners: SQL Patch Manager
- Reviewers: Loop Coordinator / Tech Lead / Security / Infrastructure / Database / SRE / Platform / Quality / Release Manager
- Amends: [ADR-0004](0004-phase2-cdk-environment-boundary.md), [ADR-0006](0006-cost-conscious-learning-profile.md)

## Context

PR #2の独立レビューで、Phase 2のCodeBuildプレースホルダーにSQLバケット全体のRead、実行ログバケットへの標準ログ・成果物Write/Delete、単一テーブル全体へのDynamoDB書込み権限が付与されていることが判明した。Phase 2ではSQL実行を禁止しているため、これらの権限は不要であり、将来の機密情報漏えい・監査ログ改ざんの余地になる。

## Decision

Phase 2の`ExecutionStack`は、SQL実行基盤ではなくFail-Closedのインフラ境界だけを提供する。

- CodeBuildは`NO_SOURCE`、`NO_ARTIFACTS`、SQL実行を拒否するBuildSpecとする。
- CloudWatch LogsとCodeBuild標準S3ログを無効化し、機密Log S3をCodeBuild標準機能へ接続しない。
- CodeBuildはL1の`AWS::CodeBuild::Project`として定義し、ログ送信を無効化した状態で標準ログ用IAM権限自体も生成しない。CDK高レベルConstructの暗黙的なログ権限に依存しない。
- CodeBuild実行ロールには、SQL S3、Log S3、DynamoDB、Secrets Manager、KMSのデータプレーン権限を付与しない。
- CodeBuild実行ロールは、VPC build ENI作成に必要なAWSサービス統合権限だけを持つ。`StartBuild`だけを持つDispatcherロールは将来のPhase 3実装境界として定義する。
- Phase 3でSQL実行を有効化する際は、実行対象のS3 VersionId・prefix、結果ログの新規キー、Execution Guard、Secret、KMS権限を別々に設計し、IAM Assertionsを追加する。

## Alternatives

| 案 | 判断 |
| --- | --- |
| Phase 2からSQL/Log/DynamoDB/Secret権限を付与する | 不採用。Fail-Closedプレースホルダーに不要で、侵害時の横断取得・改ざん範囲が増える |
| CodeBuild標準ログをLog S3へ保存する | 不採用。標準出力に機密結果が混入し得るため、Phase 3の実行プログラムが許可済み結果だけを新規キーへ保存する |
| Phase 2でCodeBuild自体を定義しない | 不採用。VPC build ENI、同時実行、タイムアウト、IAM境界を合成検証するため、Fail-Closedの骨格は維持する |

## Consequences

### Positive

- Phase 2のCodeBuildを誤って起動してもSQL実行を拒否し、機密S3・状態テーブル・Secretへ到達できない。
- CodeBuild標準ログによるSQL結果の意図しない保存経路を作らない。
- Phase 3で必要な権限を実行単位で追加する差分が明確になる。

### Negative / Risks

- Phase 2のCodeBuild失敗原因を標準ログから確認できない。Phase 3で非機密のシステム失敗ログを専用経路へ保存する設計が必要である。
- CodeBuildからRDS、Secret、S3、DynamoDBへの実接続はPhase 3以降のdeploy前Gateまで検証しない。

## Revisit / rollback conditions

- Phase 3で実行権限を追加する前に、本ADRを参照した設計レビュー、IAM Assertions、失敗・状態不明テストを完了する。
- 実行ログの保持、KMS、環境別DB接続、Execution Guardの責務が変わる場合は、新しいADRでAmendする。
