# Development Status

最終更新: 2026-10-17
対象リポジトリ: [tiri641/sql-manager](https://github.com/tiri641/sql-manager)

## Current phase

**Phase 1: 詳細設計・構成図・開発プロセス整備**

アプリケーション実装、CDK実装、AWSリソース操作、実DB接続、SQL実行はまだ開始していない。

## Completed

- SQL Patch Managerの日本語詳細設計書を作成
- システム、AWSインフラ、SQL実行フロー、アクセス制御の図ソースを作成
- `AGENTS.md` にTDD、セキュリティ、レビュー、SRE、Platform、引き渡しルールを追加
- ループエンジニアリング運用、設計・PRレビュー基準、PRテンプレートを作成
- `.github/agents/` に12役割のレビューエージェントを作成
- Planモードのレビュー・修正・提示Gateと記録テンプレートを作成
- Plan承認後の自動実行ポリシーを追加
- `CONTRIBUTING.md`、`SECURITY.md`、`CODEOWNERS`を作成
- ADR運用、テンプレート、初期ADR-0001/0002を作成
- GitHubリポジトリを読み取り取得し、空リポジトリであることを確認
- Phase 1設計をTech Lead、Security、Infrastructure、Database、SRE、Platform、Quality観点でレビューし、指摘を修正
- AWSインフラ構成図PNGを生成・目視確認し、ADR-0003でCodeBuildとVPC build ENIの境界を明確化
- リリースチェックリストを作成
- PRをPhase単位で作成し、Phase間の変更混在を禁止する開発フローを追加
- READMEから主要な開発ルール・設計書・エージェントへリンク

## In progress

- Phase 1成果物のユーザー承認待ち

## Next actions

1. 次のセッション開始時に、このファイル、`AGENTS.md`、`docs/engineering-loop.md`、`docs/adr/README.md`を読む。
2. Open Questions（IdP、承認者割当、DDL/ロック、保持期間、アカウント分離、DB実行台帳、IAM DB Authentication）を確定する。
3. Phase 1成果物をユーザーが承認する。
4. 承認後、Phase 2実装Planを作成し、Plan Review Gateでレビュー・修正・再レビューしてから提示する。

## Blockers / limitations

- GitHubリポジトリは取得済みだが、`tiri641/sql-manager` はコミット・ブランチ上のソース・テスト・GitHub Actionsがない空のリポジトリだった。
- 現Workspaceの`.git`は空の読み取り専用メタデータで、GitHub remote・Commit・Pushは未実施。
- Mermaid CLIの完全描画はChromium sandbox制約で未完了。Mermaidの静的構造検査とAWSインフラPNG生成は成功している。
- `.agents/` は実行環境側で読み取り専用のため、役割定義は`.github/agents/`へ配置した。

## Active decisions

- [ADR-0001](docs/adr/0001-codebuild-vpc-execution.md): CodeBuildをPrivate SubnetからRDSへ接続し、NAT Gatewayを標準採用しない。
- [ADR-0002](docs/adr/0002-outbox-and-execution-guard.md): Outbox、条件付き更新、CodeBuild側実行ガードで二重実行を防ぐ。
- [ADR-0003](docs/adr/0003-codebuild-vpc-build-eni.md): CodeBuildマネージドサービスとVPC build ENIの境界を明確化する（ADR-0001をAmend）。
- [ADRテンプレート](docs/adr/0000-template.md): 重要な設計判断は既存ADRを書き換えず、新しいADRで記録する。

## Validation evidence

- Python AST/構文検査: 成功
- Mermaidヘッダー、subgraph/end対応、静的構造検査: 成功
- 設計書・エージェント定義・READMEリンク検査: 成功
- PlanモードレビューGate、テンプレート、関連リンク検査: 成功
- 秘密情報パターン検査: 問題なし
- `diagrams`/GraphvizによるAWSインフラPNG生成: 成功、目視確認済み
- Mermaid静的構造検査: 成功。CLI完全描画: Chromium sandbox制約で未完了
- GitHubリポジトリ取得: 成功。ただし空リポジトリ
- GitHub remote/PR/Push: 未実施

## Session handoff

作業を再開するときは、まずこのファイルの `In progress`、`Next actions`、`Blockers / limitations` を確認し、完了した項目を更新する。設計判断を変更する場合は、関連文書を直接上書きする前にADRを追加または既存ADRとの関係を記録する。セッション終了時には、変更ファイル、検証結果、残存リスク、次の一手を更新する。
