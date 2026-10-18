# Context Harness TDD Evidence

対象: AGENTS/status短縮、コンテキストallowlist、manifest、出力要約ラッパー

## Red

- `node --test scripts/verify-agent-context.test.mjs`: 初回は未実装モジュールで失敗（`ERR_MODULE_NOT_FOUND`）。
- path traversal、`docs/credentials.json`、manifest行範囲、symlink、root外出力、digest不一致、invalid schema、出力制限の各失敗系を、実装前にテストへ追加した。

## Green

- `npm run agent:context:test`: 3 test files passed（manifest 11、context verifier 14、concise 5のケース）。
- `npm run agent:context:verify`: `AGENTS.md` 42行、`status.md` 57行で終了コード0。
- 検証基準commitは`f420a7e650e82db7791dc492a83642f3740f51b4`。後続の証跡追記はmanifest対象ファイルを変更しない。
- `node scripts/create-context-manifest.mjs --files AGENTS.md:1-42,status.md:1-57,docs/agent-rules/README.md:1-27 --revision f420a7e650e82db7791dc492a83642f3740f51b4 > /tmp/sql-manager-context-manifest.json && node scripts/verify-context-manifest.mjs /tmp/sql-manager-context-manifest.json`: 3ファイルのdigest一致、終了コード0。

## Refactor / Verify

- 正規化前の`..`、symlink、明示的allowlist外、SQL/Secret候補、root外出力をfail-closed化。
- `run-concise`のmarker込み総量上限、AWS環境変数/JSON credentialマスク、非0終了コードを検証。
- 正本Schema、status移管表、アーカイブSHA-256・行数・Markdownリンクを検証。
- `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`、`npm run docs:verify`、`npm run security:scan`は全て終了コード0。

## Scope note

リポジトリ内ラッパーは子プロセスの表示を上限・マスク付き要約へ変換する。外部Codex UI・CLI・MCPがツール呼び出し自体を表示する方式はリポジトリから制御できないため、そこは運用上の制約として残る。
