# コンテキスト軽量化 Pre-PR レビュー

- Review target: `2caa9900b64d3623143c313dee86696583cefbf4` vs `origin/main`
- Scope: `AGENTS.md`、`status.md`、agent-rules、status-history、context manifest、出力要約、関連テスト・CIだけ
- Excluded: Phase 3、`apps/`、`infra/`、OpenAPI、AWS変更、DB接続、SQL実行

## Independent agent decisions

| Role | Decision | Blocking | High | Medium | Low |
| --- | --- | ---: | ---: | ---: | ---: |
| Loop Coordinator / Tech Lead / Release | Conditional approval | 0 | 0 | 6 | 0 |
| Security / Platform | `APPROVED` / Release可 | 0 | 0 | 3 | 1 |
| Quality / TDD | `APPROVED` / Release可 | 0 | 0 | 3 | 0 |

## Fixed before this gate

- status検証結果、PlanのDRAFT表記、manifestの基準commit・出力pathを修正。
- source-of-truthのcanonical contract（path、scope、priority、when、requiredSections、validationRule、allowedReferences、overridePolicy）を固定検証。
- AGENTSの安全/Gate行の重複・例外追記を拒否。
- archive/source snapshotのSHA、行数、symlink、realpathを検証。
- manifest既存出力の競合上書きを`wx`で拒否。
- Git status取得失敗、Fine-grained PAT、private key、signal終了コード、GitHub Actions toolchainのテスト・固定を追加。
- 存在しないcontext allowlist pathを削除。

## Accepted residual Medium/Low risks

- manifestの`verification.status=not-run`は、生成物を不変の検証入力として扱うための仕様。CIは同一revision・digestを別コマンドで検証し、成功をmanifestへ偽装記録しない。
- `run-concise`は既知credential形式と出力量を扱う運用補助であり、完全なDLPではない。機密値を出力するコマンドは実行しない。
- malformed manifestの一部は非0終了でfail-closedになるが、構造化エラー形式までは保証しない。
- CI Actionsのimmutable SHA固定、npm取得のintegrity固定は、今回のコンテキスト機能の必須条件ではない供給網hardeningとして次回扱う。
- CIのmanifest生成はrunner一時領域への新規出力であり、リポジトリ内の既存ファイルを上書きしない。
- migration metadataの`to`は監査用文字列であり、本文リンクはarchiveのMarkdown link検証で確認する。

## Gate decision

- Blocking: 0
- High: 0
- Independent review: completed
- Scope isolation: passed（Phase 3/apps/infra/OpenAPI差分なし）
- Final decision: `PRE_PR_REVIEW_PASSED_WITH_ACCEPTED_MEDIUM`
- PR creation: allowed by engineering gate; external GitHub authentication remains an environment prerequisite.

## Verification evidence

- `npm run agent:context:test`: passed（manifest 12、context verifier 14、concise 5）。
- `npm run agent:context:verify`: passed（AGENTS.md 42行、status.md 57行）。
- `npm run docs:verify`: passed。
- `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`、`npm run security:scan`: passed。
- `git diff --check`: passed。
- AWS変更、実DB接続、SQL実行は未実施。
