# コンテキスト軽量化・エージェントハーネス改善 Plan

- Status: `PLAN_APPROVED`
- 対象: リポジトリ内のエージェント指示、セッション引き継ぎ、コンテキスト検証
- 非対象: アプリケーション実装、AWS変更、CDK deploy、実DB接続、SQL実行、Git Push、PR/Merge

## 目的

Codexやレビューエージェントが毎回長大な履歴・設計文書・ツール出力を読み込まなくても、安全な開発ループを維持できるようにする。現在状態と詳細履歴を分離し、リポジトリ内で軽量化ルールを検証可能にする。

## 変更対象

- `AGENTS.md`: 絶対禁止事項、現在Phase、開発ループ、必須レビュー、参照先だけに縮小。AWS/DB/SQL禁止、機密情報禁止、UNKNOWNの成功扱い禁止、PR Gate、ADR/status更新は必須不変条件として残す
- `docs/agent-rules/README.md`: 詳細なレビュー、TDD、コンテキスト読込、ツール出力ルールのindexと正本対応表を追加
- `docs/agent-rules/context-policy.md`: セッション開始時の最小読込セット、作業別の追加読込、エージェントへの限定コンテキスト、出力制限を定義
- `docs/agent-rules/source-of-truth.json`: ルールID、正本ファイル、優先順位、条件付き参照先を機械可読で定義
- `docs/agent-rules/source-of-truth.schema.json`: 正本ID、path、priority、condition、requiredSections、validationRuleの型・必須項目を定義
- `.node-version`: コンテキスト検証jobのNode `24.19.0`を固定
- `docs/agent-rules/context-manifest.schema.json`、`scripts/create-context-manifest.mjs`: レビュー対象のcommit/working-tree digest、許可ファイル、行範囲、検証結果を記録する推奨入力manifestを定義・生成
- `status.md`: `Current phase`、`Gate status`、`In progress`、`Completed`、`Next actions`、`Blockers / limitations`、`Latest verification`、`Active decisions`、`Session handoff`だけを保持
- `docs/status-history/README.md`、`docs/status-history/2026-10-18-status-pre-context-reduction.md`、`docs/status-history/2026-10-18-status-pre-context-reduction.json`: 短縮前の`status.md`を完全保存し、旧セクション、行数、SHA-256、移管先の対応を記録
- `docs/reviews/plan/2026-10-18-context-harness-review.md`: Planレビュー記録
- `scripts/verify-agent-context.mjs`: AGENTS/statusの行数・必須見出し・参照リンク・過度な履歴混入を検査
- `scripts/verify-agent-context.test.mjs`、`scripts/create-context-manifest.test.mjs`: 一時fixtureで行数境界、必須項目、リンク/anchor、アーカイブ完全性、Gate矛盾、正本対応表、Git revision/dirty/untrackedの失敗条件を検証
- `package.json`: `agent:context:verify`を追加。依存追加がないため`package-lock.json`は変更しない
- `.github/workflows/ci.yml`: 既存のverifyを保持した独立`context-policy` jobを追加。AWS認証・DB接続・SQL実行は行わない
- `README.md`: 軽量なセッション継続ルールへのリンクを追加

## 設計判断

1. ルールの優先順位は、`AGENTS.md`（最上位の禁止事項・Gate）→ `docs/engineering-loop.md`（開発ループ）→ path配下のより具体的な`AGENTS.md` → `.github/agents/`（役割別レビュー）→ `docs/security-design.md`/`docs/adr/`（設計正本）→ `docs/agent-rules/`（読込・出力運用）とする。path-specific ruleは対象配下の補足だけを定義でき、rootのAWS/DB/SQL禁止、機密情報禁止、fail-closed、Plan/PR Gate、status/ADR更新を上書きできない。矛盾時は上位を優先し、`source-of-truth.json`とschemaの不一致を検証失敗にする。
2. `AGENTS.md`は自動的に読まれる最上位ルールなので、安定した安全規則だけを置く。`docs/agent-rules/README.md`は通常開始の必須読込とし、`docs/security-design.md`はSQL・認証認可・ログ・S3/KMS作業の必須追加読込とする。詳細資料は作業条件に応じて読む。
3. `status.md`は履歴ファイルにせず、次のセッションが最初に読む一枚の状態ファイルとする。短縮前の全文は日付付きアーカイブへ保存し、過去のレビュー履歴は`docs/reviews/`、設計判断は`docs/adr/`へ残す。
4. Codex UI・CLI・MCPのstdout/stderr量をリポジトリから直接強制する設定はない。この変更で強制するのは、コマンドの選び方、行範囲、レビュー入力契約、CIの検証であり、外部ハーネスの出力上限は対象外と明記する。コマンドは`rg`、`sed -n`、行数・要約出力を優先する。
5. レビューエージェントには親セッション全文を渡さず、`context-manifest`のcommit/working-tree digest、許可ファイル、行範囲、検証結果だけを渡す。親コンテキストを引き継ぐ必要がある場合も、最小限の要約を別途指定する。これは推奨入力プロトコルであり、エージェント起動APIの強制機能ではない。
6. Hard Gateは改行を`\n`へ正規化した行数で、`AGENTS.md <= 100`、`status.md <= 100`とする。必須見出し・必須不変条件を先に満たし、超過時に情報を削除して調整してはならず、アーカイブへ移管してから修正する。

## セッション読込ポリシー

| 作業 | 必須読込 | 必要時だけ読む |
| --- | --- | --- |
| 通常開始 | `AGENTS.md`、`status.md`、`docs/engineering-loop.md`、`docs/adr/README.md`、`docs/agent-rules/README.md` | 対象コード・対象テスト |
| Plan | 上記 + 現行Plan + 関連ADR。SQL・認証認可・ログ・S3/KMSに関するPlanなら`docs/security-design.md`も必須 | 過去レビュー全文、全設計書 |
| 実装 | 上記 + 対象Plan + 対象コード/テスト。SQL・認証認可・ログ・S3/KMSなら`docs/security-design.md`も必須 | 無関係なPhaseの資料 |
| レビュー | 上記 + 最終Diff + 対象設計/テスト + context manifest。SQL・認証認可・ログ・S3/KMSなら`docs/security-design.md`も必須 | 会話履歴全体、過去の重複レビュー |
| 引き継ぎ | `status.md`を更新 | 詳細履歴はリンクのみ |

`source-of-truth.json`はこの表と同じ必須読込・条件付き読込・優先順位を機械可読に保持し、`source-of-truth.schema.json`で`id`、`canonicalPath`、`scope`、`priority`、`when`、`requiredSections`、`validationRule`、`allowedReferences`、`overridePolicy`を必須化する。`overridePolicy`は`root-safety-non-overridable`または`scoped-additive-only`だけを許可する。検証スクリプトはAGENTS内の参照先、manifest、正本対応表の対応を確認し、root安全規則を上書きするfixtureをexit code 1にする。

## テスト・検証

- Red/Greenが必要なアプリケーションコード変更はない。代わりに検証スクリプトの失敗系を先に確認する。
- `node scripts/verify-agent-context.mjs`で、行数、必須見出し、必須安全不変条件、Gate状態、statusアーカイブリンク、相対リンク、禁止された巨大履歴セクションを検査する。検証はrepository rootを基準にし、CRLF/最終改行の差を吸収する。
- `node --test scripts/verify-agent-context.test.mjs`で、`N`行と`N+1`行、必須見出し欠落、必須不変条件欠落、壊れた相対リンク・anchor、アーカイブリンク欠落、履歴見出し混入、矛盾したGate状態、正本対応表違反を検査する。検査失敗はexit code 1、成功は0とする。
- アーカイブ完全性は、短縮前statusの正規化行数・UTF-8 bytes SHA-256をmetadataへ保存し、archive本文の同一digest、必須旧見出し、旧セクションの移管表を検査する。現行statusからアーカイブへ到達できない場合は失敗する。
- status移管の全件表は、`Current phase`→現行保持、`Completed`→現行の要約＋関連レビュー/ADRリンク、`Current session update`→アーカイブ＋現行`In progress`/`Next actions`、`Next actions`→現行保持、`Blockers / limitations`→現行保持、`Latest validation evidence`/`Validation evidence`→現行の最新結果＋アーカイブ、`Active decisions`→現行保持＋ADR、`Session handoff`→現行保持、`Historical review notes`→アーカイブ＋各レビュー記録リンク、とする。未マッピング見出しは失敗させる。
- `context-manifest.schema.json`はJSON Schemaとして、`revision`、`workingTreeDigest`、`allowedFiles`（repository-relative path、`..`禁止、1以上のline range）、`verification`（command/status/digest）、`sensitiveData=false`を必須化し、SHA-256は`^[a-f0-9]{64}$`、statusは許可enum、`additionalProperties=false`とする。working tree digestは、対象ファイルを相対pathの辞書順に並べ、LF改行・UTF-8へ正規化した`path\0bytes\0`連結をSHA-256化する。`.git`、node_modules、manifest自身、Secret/SQL本文を含むファイルは対象外とし、dirty/untrackedはmanifestへ明示する。生成・schema検証・再計算のexact commandをREADMEへ記載する。Codexの親コンテキスト継承を検出・強制するものではない。
- `npm run agent:context:verify`、`npm test`、`npm run docs:verify`、`git diff --check`を実行する。既存CIのtest、typecheck、lint、build、security scan、docs、CDK synth/nagは削除・置換しない。
- CIの`context-policy` jobは`pull_request`と`main` pushで実行し、`checkout` → `.node-version`でNode `24.19.0`をsetup → 公式npm registryから`npm install --global npm@11.17.0` → `node --version`/`npm --version`の一致検証 → `node --test scripts/verify-agent-context.test.mjs` → `npm run agent:context:verify`の順で実行する。global npmはアプリ依存ではなく検証jobのツールチェーン固定であり、取得失敗はjob失敗とする。`package-lock.json`は変更せず、失敗時に全文ファイルや機密情報をartifactへ保存しない。既存のCI jobとAWS/DB/SQL禁止境界は維持する。

## 完了条件

- `AGENTS.md`が短い必須ルールと参照リンクだけになる。
- `status.md`が100行以下の現在状態へ整理され、Gate状態、未実施検証、次Phase開始条件、AWS/DB/SQL未実施、残存リスクを保持する。
- 短縮前の`status.md`全文が日付・変更前状態付きでアーカイブされ、旧セクションと移管先の対応が追跡できる。
- 詳細ルール、履歴、設計判断の参照先が失われない。正本対応表と既存文書のリンク検査が通る。
- `AGENTS.md`の必須安全不変条件が検証スクリプトで保護される。
- `source-of-truth.json`、context manifest schema、アーカイブmetadataと実ファイルの対応が検証される。
- ルール不変条件ID（`SAFE-NO-AWS-DB-SQL`、`SAFE-NO-SENSITIVE-DATA`、`SAFE-UNKNOWN-FAIL-CLOSED`、`GATE-PLAN-REVIEW`、`GATE-PRE-PR-REVIEW`、`STATE-STATUS-ADR`）ごとに正本・必須条件・検査が対応し、欠落時は失敗する。
- コンテキスト検証スクリプトとCIが成功する。
- 既存のテスト、docs検証、セキュリティ境界に変更がない。
- 変更後の独立レビューでBlocking/Highがない。

## リスク・制約

- Codex UIやツールランナーの内部stdout上限を、リポジトリファイルから直接強制することはできない。運用ルール・ラッパー・CI検証で軽減する。
- 旧`status.md`は短縮前に`docs/status-history/2026-10-18-status-pre-context-reduction.md`へ完全保存し、行数・SHA-256をmetadataへ記録して現行statusからリンクする。移行後に履歴を削除しない。
- `AGENTS.md`を短くすることで詳細ルールが自動読込されなくなるため、必要な詳細資料へのリンクと「必要時に読む」条件を明記する。

## Related documents and rollback

- status移管表: `Current phase`/`Gate status`/`In progress`/`Next actions`/`Blockers`は現行`status.md`へ、`Completed`の履歴は関連PR・ADR・レビュー記録へのリンクへ、`Latest verification`は現行の最新結果へ、旧`Current session update`/`Historical review notes`/`Validation evidence`/`Active decisions`/`Session handoff`は完全アーカイブまたは現行項目へ1対1で移管する。移管metadataに旧見出し、移管先、件数、source/archive digestを記録する。
- 影響文書: `AGENTS.md`、`docs/engineering-loop.md`、`.github/agents/README.md`、`docs/reviews/README.md`、`CONTRIBUTING.md`、`README.md`、`docs/adr/README.md`、`docs/security-design.md`。
- 正本は既存文書の役割を維持し、`docs/agent-rules/`は重複した設計規則を新たに定義せず、読込順・出力運用・移行対応だけを定義する。
- 変更は、アーカイブ・検証スクリプト・ルール・AGENTS/status・package/CIの順で適用する。失敗時はアーカイブを保持したまま変更一式を直前の状態へ戻し、`npm run agent:context:verify`、`npm run docs:verify`、`git diff --check`を再実行する。外部変更はない。
- Open Question: 外部Codexハーネスの出力上限を設定する方法はリポジトリ外のため、本変更では扱わない。Owner: 開発者、対応先: Codex設定/運用。
