# AWS SQL Patch Manager

AWS上の専用Web UIからSQLパッチを申請し、ドライラン、承認、本実行、ロールバック、監査、ログ確認までを一元管理するシステムの設計リポジトリです。

Canonical GitHub repository: [tiri641/sql-manager](https://github.com/tiri641/sql-manager)

## 現在のPhase

現在はPhase 2（AWS基盤CDK実装・検証）です。CDKコード、Lambda骨格、インフラテスト、synth、cdk-nagを扱います。`cdk deploy`、`cdk bootstrap`、AWSリソース作成、実RDS接続、SQL実行は行いません。

セッション間の引き継ぎは [status.md](status.md) を正本とし、重要な設計判断は [ADR一覧](docs/adr/README.md) に記録します。

## 設計書

- [エージェント開発ルール](AGENTS.md)
- [ループエンジニアリング運用](docs/engineering-loop.md)
- [設計・PRレビュー・チェックリスト](docs/review-checklists.md)
- [PR前エージェントレビュー記録](docs/reviews/README.md)
- [Planモードレビュー記録テンプレート](docs/reviews/plan-review-template.md)
- [開発状況・セッション引き継ぎ](status.md)
- [ADR一覧](docs/adr/README.md)
- [リリースチェックリスト](docs/release-checklist.md)
- [Contributionガイド](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [CODEOWNERS](.github/CODEOWNERS)
- [GitHubエージェント定義](.github/agents/README.md)

- [要件定義](docs/requirements.md)
- [アーキテクチャ設計](docs/architecture.md)
- [セキュリティ設計](docs/security-design.md)
- [データモデル設計](docs/data-model.md)
- [API設計](docs/api-design.md)
- [ワークフロー設計](docs/workflow-design.md)
- [UI設計](docs/ui-design.md)
- [運用設計](docs/operations.md)
- [実装計画](docs/implementation-plan.md)

## 構成図

- [システムアーキテクチャ図](docs/diagrams/system-architecture.mmd)
- [AWSインフラ構成図ソース](docs/diagrams/aws-infrastructure.py)
- [AWSインフラ構成図PNG](docs/diagrams/aws-infrastructure.png)（ローカルGraphvizで生成済み）
- [SQL実行フロー図](docs/diagrams/sql-execution-flow.mmd)
- [権限・アクセス制御図](docs/diagrams/access-control.mmd)

## 採用方針の要約

- SQL本文と実行ログは非公開S3へ保存し、DynamoDBには本文を保存しない。
- ブラウザからS3へ短期有効な署名付きURLで直接アップロードし、完了APIがS3のVersionId・SHA-256・構成を検証する。
- API LambdaはDBへ接続せず、環境別CodeBuildをVPCのPrivate SubnetからRDS PostgreSQLへ接続する。
- CodeBuildはS3 Gateway Endpoint、DynamoDB Gateway Endpoint、Secrets Manager Interface Endpointを利用し、実行VPCにNAT Gatewayを標準配置しない。
- DynamoDBの条件付き更新、TransactWriteItemsによるOutbox、CodeBuildのStartBuild idempotency token、CodeBuild側の実行ガードを組み合わせ、起動漏れ・重複起動・状態不明を別々に扱う。
- ドライランは「完全な無副作用」を保証しない。トランザクション制御、非トランザクションDDL、外部副作用などを拒否し、明示的にROLLBACK確認できた場合だけ成功とする。
- 開発・検証・本番は論理的に分離し、社内導入ではAWSアカウント分離を推奨する。個人開発では同一アカウント内の環境別リソース分離を許容する。
- 個人開発用既定値は全環境1 AZ、NATなし、SSE-S3、Cognito Essentials、PITR/Flow Logsなし、devのみ最小RDSとし、本番向け強化は環境設定で切り替える（[ADR-0006](docs/adr/0006-cost-conscious-learning-profile.md)）。

## 検証方針

Phase 1では、Mermaidソースの静的構造検査とCLI描画試行、Python構文検査、`diagrams`ライブラリによる画像生成を実施します。AWS操作なしで、次の手順により開発環境で再生成できます。

```bash
# GraphvizとNode.js/npmを用意した環境で実行
python3 -m venv .venv-diagrams
./.venv-diagrams/bin/pip install diagrams
./.venv-diagrams/bin/python docs/diagrams/aws-infrastructure.py

# Mermaidの構文・描画確認（プロジェクトの開発依存へ追加する場合）
npx @mermaid-js/mermaid-cli -i docs/diagrams/system-architecture.mmd -o /tmp/system-architecture.svg
npx @mermaid-js/mermaid-cli -i docs/diagrams/sql-execution-flow.mmd -o /tmp/sql-execution-flow.svg
npx @mermaid-js/mermaid-cli -i docs/diagrams/access-control.mmd -o /tmp/access-control.svg
```

`aws-infrastructure.py` はAWS SDK/CDKを呼び出さず、Graphvizのローカル描画だけを行います。PNG生成後は `docs/diagrams/aws-infrastructure.png` をGit管理し、Mermaid描画確認後はソースと同じ変更としてレビューします。今回の環境ではAWSインフラPNGの生成とMermaidソースの静的構造検査は成功しましたが、Mermaid CLIの完全描画は実行環境のChromium sandbox制約により未完了です。

## リポジトリ構成

```text
apps/
├── frontend/       # React + TypeScript
└── backend/        # Phase 2: Lambda骨格、Phase 3以降: API・非同期処理
infra/
└── cdk/            # AWS CDK(TypeScript)、Phase 2で基盤を定義
docs/               # 本Phaseで作成する設計書・構成図
```
