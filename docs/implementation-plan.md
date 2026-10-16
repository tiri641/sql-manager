# 実装計画

## 1. Phase 1：詳細設計・構成図作成（本Phase）

### 目的

初回リリースの必須機能を省略せず、AWS構成、状態遷移、権限、SQL安全性、監査、障害復旧、UI/APIの契約を実装可能な粒度へ落とす。

### 実装対象

- `docs/requirements.md`、`architecture.md`、`security-design.md`、`data-model.md`、`api-design.md`、`workflow-design.md`、`ui-design.md`、`operations.md`
- Mermaid図3点、Python diagramsソース、PNG
- READMEからのリンク、Open Questions、検証手順

### 依存関係

リポジトリ初期状態のみ。AWSアカウント、DB、Cognito、GitHubソース、個人情報は不要。

### 作業手順

1. 既存リポジトリとエージェント指示を確認する。
2. SQL本文をアプリログ・DynamoDB・GitHubへ保存しない境界を決める。
3. CodeBuild/RDS接続、NAT/VPC Endpoint、環境分離を比較する。
4. 非同期のOutbox、条件付き更新、実行ガード、状態不明処理を設計する。
5. API/UI/データモデル/セキュリティ/運用を文書化する。
6. Mermaid/Python図を作成し、PNG生成と静的検査を行う。
7. 図と設計書の差分を確認する。

### 完了条件

- 必須機能FR-01〜FR-15が各設計書に対応づけられている。
- SQL本文、ログ、認証情報の保存経路と閲覧権限が明確である。
- dry-runの限界、DDL、外部副作用、状態不明、自動再実行禁止が明記されている。
- CodeBuildからRDSへのネットワーク・Secret・DB権限が明記されている。
- 4つの指定ファイルが存在し、PNG生成を試行済みである。
- AWSやDBに接続していない。

### テスト・検証項目

- Mermaidソースの括弧・subgraph・矢印の静的チェック、利用可能ならMermaid CLI。
- `python3 -m py_compile docs/diagrams/aws-infrastructure.py`。
- `diagrams`導入済みならPNG生成。未導入なら失敗原因と再生成手順をREADME/最終報告へ記録。
- 全ファイルのリンク先と必須見出しを確認。
- `rg`でSQL本文・Secret値・本番実在値が成果物に含まれていないことを確認。

### 想定リスク

- diagramsライブラリ未導入またはGraphviz未導入でPNGを生成できない。
- Mermaidのレンダラー差異で表示できない構文が残る。
- CodeBuildとVPC Endpointの必要性を誤解すると、後続実装でNATまたはEndpoint不足になる。
- dry-runを安全と誤認して本番影響を出す。承認画面・実行ポリシー・Runbookで明示する。

### Codexに依頼する単位

図ごと、または設計書ごとに小さく依頼し、各依頼後にリンク、状態遷移、IAM、図の整合性を検証する。Phase 1ではAWSリソース作成を依頼しない。

## 2. Phase 2：AWS基盤構築

### 目的

CDKで環境別の安全なAWS基盤を作り、アプリからSQL本文を直接扱わない境界を検証する。

### 実装対象

CDK(TypeScript)、CloudFront/S3 OAC、Cognito、API Gateway、Lambda骨格、DynamoDB、SQL/Log S3、KMS、VPC/Private Subnet、RDSダミー、Security Group、VPC Endpoint、CodeBuildプロジェクト、Secrets Manager、CloudWatchメトリクス、Budgets。

### 依存関係

Phase 1完了、AWSアカウント/リージョン、料金上限、ダミーDB、承認者・環境設定。

### 作業手順

1. devのみをCDK synth/deploy対象とし、contextで環境設定を外出しする。
2. IAMとS3/KMSポリシーを先に実装し、公開・過剰権限テストを追加する。
3. VPC、RDS、Endpoint、CodeBuildの接続をダミー環境で確認する。
4. testへ昇格し、アカウント分離方式を検証する。

### 完了条件

CDK synth、cdk-nag、AWS Config相当、セキュリティグループ・Endpoint・暗号化・Backupの検査が通り、ダミー環境だけが存在する。

### テスト項目

IAM Policy Simulator、S3公開拒否、署名URL、KMS権限、RDS SG接続、CodeBuild VPC、Secret取得、バックアップ復元、コスト上限。

### リスク

NAT/Endpoint不足、RDS料金、KMSキー削除、誤った環境接続、CDK contextの機密値混入。

### Codexに依頼する単位

CDKスタック1個、IAMポリシー1境界、環境1つ、テスト1セットごと。deploy前に必ずdiffと料金を確認する。

## 3. Phase 3：バックエンド・SQL実行基盤

### 目的

API、S3検証、DynamoDB状態機械、Outbox、CodeBuild executor、ログ保存、状態不明処理を実装する。

### 実装対象

Lambda(TypeScript)、API契約、S3 checksum/VersionId検証、DynamoDB条件式・TransactWriteItems、EventBridge/Dispatcher/Reconciler、CodeBuild固定イメージ、PostgreSQL parser/runner、Secrets取得、監査、DB実行台帳。

### 依存関係

Phase 2のdev基盤、ダミーRDS、SQL安全性ポリシー、API/UI契約。

### 作業手順

1. 状態遷移と条件付き更新を先にユニットテストする。
2. S3 upload-completionと改ざんテストを実装する。
3. Outboxの起動漏れ・重複・応答不明テストを実装する。
4. CodeBuild guard、parser、transaction/rollback確認、Log S3を実装する。
5. dry-run、approval、execute、rollbackを段階的に接続する。

### 完了条件

FR-02〜FR-15がdevダミーDBで自動テストされ、SQL・SecretがCloudWatchへ漏れず、状態不明時に自動再実行しない。

### テスト項目

条件付き書込み競合、Lambda再試行、EventBridge重複、CodeBuild二重起動、S3差替え、SQL構文・拒否リスト、DDL、timeout、接続切断、結果保存失敗、RBAC、ログ上限、Rollback失敗。

### リスク

SQL parserの不完全性、DB副作用、ログのPII、外部ACK不明、PostgreSQLバージョン差異。

### Codexに依頼する単位

状態機械、S3検証、Outbox、CodeBuild runner、ログ、API endpointを1単位ずつ。各単位で失敗系テストを先に作る。

## 4. Phase 4：フロントエンド

### 目的

権限と状態に応じた安全な操作画面を提供する。

### 実装対象

React/TypeScript、Cognitoログイン、10画面、状態表示、署名URLアップロード、差分・ハッシュ表示、ポーリング、ターミナルログ、アクセシビリティ、XSS対策、操作確認。

### 依存関係

Phase 3のAPI・DTO・状態、CDKのCloudFront/S3/Cognito。

### 作業手順

ログイン、一覧、アップロード、詳細、dry-run、approval、execute、rollback、履歴を順に実装し、権限なし・状態不明・巨大ログを先に確認する。

### 完了条件

権限のないボタンが出ない、出てもAPIで拒否される。10画面の必須操作、警告、ログ表示、再取得、エラー表示が実装される。

### テスト項目

Cognito期限切れ、owner/approver/other、自己承認、403、二重クリック、S3 URL期限、XSS文字列、巨大ログ、モバイル幅、キーボード操作。

### リスク

UIの表示制御だけを認可と誤認する、署名URLの漏えい、XSS、状態更新遅延。

### Codexに依頼する単位

画面1枚または共通コンポーネント1つ。各画面でAPIエラーと権限マトリクスを実装する。

## 5. Phase 5：E2E・セキュリティテスト

### 目的

初回リリースの全必須機能をダミー環境で検証し、本番投入前の安全性を証拠化する。

### 実装対象

E2E、負荷、障害注入、IAM/S3/KMS、SQL安全性、監査、バックアップ復元、コスト、脆弱性、アクセシビリティ、CDK/構成図整合性CI。

### 依存関係

Phase 2〜4、test環境、テストデータ、承認者、Runbook。

### 作業手順

正常系、拒否系、重複系、状態不明系、復旧系、データ漏えい系を自動化し、証跡と残存リスクをレビューする。

### 完了条件

必須機能の受入テスト、脅威モデルの対策、復元テスト、重大・高リスク脆弱性0件、運用Runbook承認、コスト上限確認。

### テスト項目

FR-01〜FR-15、全画面、全状態、SQL差替え、自己承認、環境越境、二重CodeBuild、RDS切断、KMS/S3拒否、監査改ざん、PITR。

### リスク

本番相当データを使う誘惑、テストカバレッジ不足、AWSマネージドサービスの遅延・リトライ差異。

### Codexに依頼する単位

シナリオ群単位で依頼し、テストデータと証跡の機密性を確認する。

## 6. Phase 6：社内導入準備

### 目的

組織認証、アカウント分離、運用体制、教育、移行、監査・法務を整える。

### 実装対象

SAML/OIDC、Organizations/Control Tower相当、Tools/Dev/Test/Prodアカウント、クロスアカウント実行ロール、承認グループ、変更管理、SLO、インシデント対応、GitHub既存履歴の是正、利用者教育。

### 依存関係

Phase 5の受入、社内セキュリティ・法務・DBA・業務オーナーの合意。

### 作業手順

パイロット部署、非機密・低リスクDB、監査期間、段階的本番、旧GitHub Actionsの停止・移行計画を定める。

### 完了条件

本番アカウント分離、認証・承認・緊急アクセス、保持・削除、復旧、SLO、教育、連絡網、移行・ロールバック計画が承認される。

### テスト項目

クロスアカウント権限、IdP停止、承認者不在、BreakGlass、監査レビュー、復旧演習、Cost/Security通知、旧履歴の調査。

### リスク

組織ルール・法令・DBA権限との不整合、承認遅延、既存GitHub履歴やartifactの残存。

### Codexに依頼する単位

アカウント境界、IdP連携、移行手順、Runbook、監査レポートを個別にレビューする。

## 7. 初回リリースGate

初回リリースはFR-01〜FR-15、10画面、4構成図、ログ・監査・Rollback・状態不明・復旧手順をすべて含む。段階的実装は許可するが、いずれかの必須機能を「将来対応」として省略した状態ではリリースしない。

