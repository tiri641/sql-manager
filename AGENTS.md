# SQL Patch Manager — Agent Operating Rules

このファイルはリポジトリの最上位ルールです。path配下のより具体的な`AGENTS.md`は補足だけを定義でき、ここにある安全規則とGateを弱めてはいけません。

## Current phase

- Phase 2（AWS基盤CDK実装・検証）。Phase 2 PR #2は`main`へマージ済みで、Phase 3の実装は未着手。
- `status.md`がセッション引き継ぎの正本。開始時に`status.md`、`docs/engineering-loop.md`、`docs/adr/README.md`、`docs/agent-rules/README.md`を読む。終了時に`status.md`を更新する。

## Safety invariants

- `SAFE-NO-AWS-DB-SQL`: AWSリソースの作成・変更・削除・deploy、外部環境・実DB接続、SQL実行は禁止。明示依頼なしに行わない。
- `SAFE-NO-SENSITIVE-DATA`: SQL本文、実行ログ、Secret、credential、個人情報、会社機密をGit、通常ログ、PR、レビュー記録へ保存・出力しない。
- `SAFE-UNKNOWN-FAIL-CLOSED`: 外部ACK、DB結果、ログ保存、状態更新が不明な場合は成功・削除・再実行・lock解放へ変換しない。
- `GATE-PLAN-REVIEW`: PlanはDRAFTとして作成し、影響エージェントのレビューでBlocking/Highを解消して`PLAN_APPROVED`になるまで最終Planとしない。
- `GATE-PRE-PR-REVIEW`: PRはPhase単位とし、最終Diffの独立エージェントレビュー、再検証、Blocking/High 0件、ユーザー明示依頼が揃うまで作成しない。
- `STATE-STATUS-ADR`: 重要な判断はADRへ、現在状態・Blocker・検証結果・次の作業は`status.md`へ記録する。

## Development loop

Scope → Inspect → Plan → Plan Review → Design Review → Red → Green → Refactor → Verify → Pre-PR Review → Fix/Re-verify → Handoff。

- TDDでは期待する失敗系テストを先に追加し、外部副作用はFake/Portで分離する。
- 実行結果不明、timeout、遅延ACK、認可失敗、改ざん、機密漏えいを優先して検証する。
- 必須検証の未実行は成功と報告しない。AWS、DB、SQL、Push、PR、Merge、外部通知はユーザー明示依頼なしに行わない。

## Required reviewers

PlanはLoop Coordinator/Tech Lead、Security、Quality/TDDを必須とし、影響に応じてInfrastructure、Database/PostgreSQL、SRE、Platform、Privacy、Releaseを追加する。指摘は重要度、path:line、Issue、Impact、Evidence、Recommendationで記録する。

## References

- 詳細な開発ループ: [docs/engineering-loop.md](docs/engineering-loop.md)
- コンテキスト・ツール出力運用: [docs/agent-rules/README.md](docs/agent-rules/README.md)
- セキュリティ・SQL設計: [docs/security-design.md](docs/security-design.md)
- 役割別エージェント: [.github/agents/README.md](.github/agents/README.md)
- ADR: [docs/adr/README.md](docs/adr/README.md)
- レビュー記録: [docs/reviews/README.md](docs/reviews/README.md)

## Scope boundary

Phase 2ではCDK基盤、テスト、synth、cdk-nag、設計・運用文書だけを扱う。AWSリソース作成、deploy、実DB接続、SQL実行、Phase 3以降のアプリケーション実装を先取りしない。変更前に現在の作業ツリーを確認し、無関係な変更を破棄しない。
