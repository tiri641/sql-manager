# Development Status

最終更新: 2026-10-18

## Current phase

Phase 2（AWS基盤CDK実装・検証）。PR #2は`main`へマージ済み。Phase 3のアプリケーション実装は未着手。

## Gate status

- コンテキスト最適化Planは`PLAN_APPROVED`で、実装とコンテキスト用ローカル検証を完了した。
- 今回の変更はエージェント引き継ぎ情報、ツール出力制御、検証CIに限定する。Phase 3の実装・設計変更は含めない。
- AWSリソース作成・変更・デプロイ、実DB接続、SQL実行は未実施。

## In progress

- コンテキスト最適化はPR前レビュー・PR作成・マージ待ち。

## Completed

- 短縮前のstatus全文を[アーカイブ](docs/status-history/2026-10-18-status-pre-context-reduction.md)と[移管metadata](docs/status-history/2026-10-18-status-pre-context-reduction.json)へ保存。
- [エージェントルール索引](docs/agent-rules/README.md)、[コンテキストポリシー](docs/agent-rules/context-policy.md)、正本ルールとSchemaを追加。
- `AGENTS.md`を短縮し、必須安全規則・開発ループ・レビューGate・参照先を残した。
- `scripts/verify-agent-context.mjs`とテストを追加し、Node/npmのバージョンを固定した。
- 明示的allowlist、symlink/path traversal/root外出力のfail-closed、manifestの行範囲・digest・Schema検証を追加。
- `scripts/run-concise.mjs`でコマンド出力の行数・バイト数制限と一般的なcredentialパターンのマスクを追加。
- TDD証跡は[こちら](docs/reviews/2026-10-18-context-harness-tdd-evidence.md)。最終レビュー判定は[こちら](docs/reviews/2026-10-18-context-harness-final-review.md)。Planレビュー記録は[こちら](docs/reviews/plan/2026-10-18-context-harness-review.md)。

## Next actions

1. Pre-PRエージェントレビューで最終Diffを確認する。
2. レビューと検証が通ったら、コンテキスト最適化だけのPRを作成・マージする。
3. マージ後にPhase 3のPlan Review Gateへ進む。Phase 3実装は別PRとする。

## Blockers / limitations

- リポジトリ内のルールで、外部Codex UI・CLI・MCPが表示するstdout全量を強制的に制御することはできない。出力抑制はエージェント運用ルールとCI検証で担保する。
- 現Workspaceの`.git`にはGitメタデータがないため、PR作業はリモートmainから作成した一時worktreeで行う。
- Phase 2では`cdk deploy`、AWS API、実RDS接続、SQL実行を検証していない。

## Latest verification

- `npm run agent:context:test`: 3 test files passed（manifest、context verifier、conciseのケース）。
- `npm run agent:context:verify`: 分離worktreeで再実行予定。
- Phase 2の既存テスト・synth検証は今回の変更範囲外であり、コンテキストPRでは既存CIに委ねる。

## Active decisions

- `AGENTS.md`と`status.md`の正規化後の上限を各100行とし、過去全文はdigest付きでアーカイブする。
- セッションへ渡すファイルは明示的な非機密allowlistに限定し、未知のパス・SQL・Secret候補はfail closedとする。
- Planは影響するエージェントのレビューで`PLAN_APPROVED`になるまで提示用の最終版にしない。
- 重要判断は[ADR一覧](docs/adr/README.md)、詳細な安全設計は[security-design.md](docs/security-design.md)を正本とする。

## Session handoff

- 今回の作業対象はコンテキスト入力とツール出力の削減だけ。Phase 3のローカル未マージ変更はこのPRへ含めない。
- 開始時は本ファイル、`AGENTS.md`、[engineering-loop.md](docs/engineering-loop.md)、[ADR一覧](docs/adr/README.md)、[agent-rules README](docs/agent-rules/README.md)を読む。
