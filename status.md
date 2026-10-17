# Development Status

最終更新: 2026-10-17
対象リポジトリ: [tiri641/sql-manager](https://github.com/tiri641/sql-manager)

## Current phase

**Phase 2: AWS基盤CDK実装・検証**

CDKコード、Lambda骨格、インフラテスト、synth、cdk-nagを実装した。`cdk bootstrap`、`cdk deploy`、AWSリソース作成、実RDS接続、SQL実行は行っていない。

## Completed

- Phase 1の設計・開発プロセス・レビュー基盤を確認
- `phase/2-infra-cdk`ブランチをPhase 1成果物から作成
- npm workspace、TypeScript、Node.js 24系、lockfileを追加
- `NetworkStack`を追加（個人開発用1 AZのPrivate Isolated Subnet、NATなし、S3/DynamoDB Gateway、1 AZのSecrets Manager Interface、Security Group。VPC Flow Logsは本番強化設定で有効化）
- `StorageStack`を追加（UI/SQL/実行ログ/アクセスログS3、Versioning、Block Public Access、個人開発用SSE-S3。社内導入時はSSE-KMSへ切替可能、CloudFront OAC、TLS証明書パラメータ）
- `DatabaseStack`を追加（devダミーRDS定義、test/prod外部Secret参照、Private RDS、バックアップ）
- `ControlPlaneStack`を追加（Cognito Essentials、MFA、強固なパスワードポリシー、HTTP API JWT Authorizer、DynamoDB GSI。PITRは本番強化設定で有効化、Lambda骨格、APIアクセスログ）
- `ExecutionStack`を追加（環境別CodeBuild、VPC build ENI、同時実行1、自動再試行0、CloudWatch Logs無効、Fail-Closed BuildSpec、環境別IAM）
- `BudgetStack`を追加（個人開発用Budget: dev 35 USD、test/prod各15 USD。通知用しきい値であり請求上限ではない）
- 個人開発向け低コスト環境プロファイルを追加（[ADR-0006](docs/adr/0006-cost-conscious-learning-profile.md)）
- CDK警告を是正（Cognito Threat Protection、CloudFront `UiDomainName`、KMS OAC既知警告の承認、EC23判定不能の根拠付き抑制、CloudFront WAF/Geoの公開前ゲート化）
- `diagrams` + Graphvizで現行AWS構成図PNGを再生成し、目視確認
- TDDテストを追加し、環境設定、ネットワーク、S3、RDS、Cognito、DynamoDB、CodeBuild、Budgetの境界を検証
- GitHub Actions CIを追加（AWS認証・deployなし）
- ADR-0004、Phase 2 Planレビュー記録、Phase 2設計境界を追加
- README、AGENTS、architecture、operations、implementation-planをPhase 2向けに更新

## In progress

- Phase 2の低コスト環境プロファイル反映、検証、役割別レビューは完了
- GitHub upstreamを再取得し、`phase/2-infra-cdk`の更新コミット`dd0789f`をPush済み。CodeBuildはL1 `CfnProject`、NO_SOURCE/NO_ARTIFACTS、標準ログ権限なしのFail-Closed境界
- [PR #2 `[Phase 2] AWS基盤CDK実装・検証`](https://github.com/tiri641/sql-manager/pull/2)のPush済みHEADは`dd0789f`
- `dd0789f`のGitHub Actions CIは実行中。ローカルではdev/test/prodのcdk-nagを再検証済み
- Push後レビューで指摘されたCodeBuild VPC ENI IAM不足、Secrets Manager Endpointの到達範囲、Phase 3 planned表記を修正済み
- 旧レビュー記録の`912624e`/`054d980`は履歴記録。`dd0789f`を対象に最終3観点レビューを実施し、結果を新しいレビュー記録へ保存する

## Next actions

1. `dd0789f`のGitHub Actions CIと独立3観点レビューでBlocking/High 0件を確認する。
2. 最終レビュー証跡とstatusを更新する。
3. 条件を満たしたらPR #2をマージし、Phase 3のPlan Review Gateへ進む。

## Blockers / limitations

- Workspaceの`.git`は読み取り専用の空ディレクトリのため、現在のGit操作は取得済みupstreamのGitディレクトリを明示指定している。コミット・Push・PR操作時も同じGitディレクトリを使う。
- GitHub CLIの表示上の認証状態は再確認が必要だが、Git PushとPR作成は完了している。次回の外部操作前に認証状態を確認する。
- `npm audit`のオンラインアドバイザリ取得はDNS制限で確認できなかった。依存導入時のオフライン監査結果は0 vulnerabilitiesだが、ネットワーク復旧後に再確認する。
- 社内導入・実データ利用前に、Cognito Plus/Threat Protection、SSE-KMS、PITR、VPC Flow Logs、2 AZ以上、ACM証明書と`UiDomainName`のSAN一致、初回deploy後のKMS OACポリシー絞り込み、CloudFront WAF/Geo restrictionを再承認する。
- Phase 2では実AWSの接続、料金、バックアップ復元、Secret rotation、外部RDSネットワークを検証していない。

## Active decisions

- [ADR-0001](docs/adr/0001-codebuild-vpc-execution.md): CodeBuildをPrivate SubnetからRDSへ接続し、NAT Gatewayを標準採用しない。
- [ADR-0002](docs/adr/0002-outbox-and-execution-guard.md): Outbox、条件付き更新、CodeBuild側実行ガードで二重実行を防ぐ。
- [ADR-0003](docs/adr/0003-codebuild-vpc-build-eni.md): CodeBuildマネージドサービスとVPC build ENIの境界を明確化する。
- [ADR-0004](docs/adr/0004-phase2-cdk-environment-boundary.md): Phase 2はCDK実装・検証のみ。devダミーRDS、test/prod外部RDS、SSE-S3/SSE-KMS、deploy禁止を採用する。
- [ADR-0005](docs/adr/0005-phase2-security-warning-remediation.md): Cognito Threat Protection、CloudFrontパラメータ、KMS OAC初回例外、cdk-nag抑制の根拠を定める。
- [ADR-0006](docs/adr/0006-cost-conscious-learning-profile.md): 個人開発の全環境を低コスト既定値にし、本番強化を設定で切り替える。
- [ADR-0007](docs/adr/0007-phase2-codebuild-fail-closed-boundary.md): Phase 2のCodeBuildはNO_SOURCE/NO_ARTIFACTS・標準ログ無効・データプレーン権限なしとする。
- [ADR-0008](docs/adr/0008-eventbridge-scheduler-and-dispatch-queue-boundary.md): EventBridgeは定期確認・起動漏れ検知に限定し、Phase 3で耐久配送方式を決定する。

## Validation evidence

- `npm run lint`: 成功
- `npm run typecheck`: 成功
- `npm test`: 成功（backend骨格、CDK設定・インフラAssertions）
- `npm run build`: 成功
- `npm run security:scan`: 成功
- `npx cdk synth --context environment=dev`: 成功
- `npx cdk synth --context environment=test`: 成功
- `npx cdk synth --context environment=prod`: 成功
- `npm run cdk:nag`: 成功。非推奨・CloudFrontドメイン・KMS OAC・EC23の警告なし。根拠付き抑制はINFOとして出力
- `npx cdk synth --context environment=<dev|test|prod> --context runNag=true`: 3環境で成功。警告なし、根拠付き抑制はINFOとして出力
- Mermaid構文の静的検査: 成功（3図、危険なscript/javascript/file URIなし）
- `npm install --ignore-scripts --offline`: 成功、lockfileと依存関係を検証
- `python3 docs/diagrams/aws-infrastructure.py`: 一時環境の`diagrams`/Graphvizで成功、PNG目視確認済み
- `python3 -m ast docs/diagrams/aws-infrastructure.py`: 成功
- `file docs/diagrams/aws-infrastructure.png`: 修正後PNG生成結果を確認（3149x4786、RGBA）
- `docs/reviews/2026-10-17-phase2-cost-conscious.md`: 最終Diffを含む役割別レビュー。`PR_ALLOWED`、Blocking/High 0件
- `git diff --check`: 修正後の作業ツリーで成功
- CodeBuild生成テンプレートにSQL/Log S3、DynamoDB、Secrets Managerのデータプレーン権限がないことを確認
- 修正後のdev/test/prod `cdk synth`・`cdk-nag`: 成功。ERROR/WARNINGなし、根拠付きINFOのみ
- GitHub Actions CI: `054d980`の`verify (dev)`, `verify (test)`, `verify (prod)`はPass。`dd0789f`は実行中
- `054d980` Push後レビュー: Security/Infrastructure/PlatformはBlocking/High 0件。Tech Lead/Database/SRE、TDD/Quality/Releaseの指摘を`dd0789f`で修正
- `cdk deploy` / `cdk bootstrap`: 未実行（Phase 2の禁止境界）
- AWS API、RDS、SQL: 未実行

## Session handoff

次のセッションでは、まずこのファイル、`AGENTS.md`、`docs/engineering-loop.md`、`docs/adr/README.md`を読み、[PR #2](https://github.com/tiri641/sql-manager/pull/2)のレビュー状態を確認する。Phase 3へ進む前に、デプロイ対象アカウント、リージョン、Cognito Plus料金上限、ACM証明書とドメイン、初回deploy後のKMS OAC絞り込み、WAF/Geo、RDS所有境界、Secret rotation、DB実行台帳、CodeBuild実行イメージを決定する。
