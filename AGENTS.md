# SQL Patch Manager — Agent Operating Rules

このファイルは、Codex、GitHub Copilot、その他の開発エージェントが本リポジトリで作業するときの最上位ルールです。より深いディレクトリに別の `AGENTS.md` が追加された場合、その配下ではより具体的な指示が優先されます。

## 1. プロジェクトの現在地

- セッションをまたぐ作業では、開始時に `status.md`、`AGENTS.md`、`docs/engineering-loop.md`、`docs/adr/README.md` を読み、終了時に `status.md` を更新する。
- 現在はPhase 2（AWS基盤CDK実装・検証）である。
- 既存の成果物は `docs/` にある。設計内容を変更する場合は、図・API・データモデル・運用設計との整合性を同時に確認する。
- `apps/backend/` と `infra/cdk/` はPhase 2の基盤コード配置である。Phase 3のSQL実行・API実装やPhase 4のReact実装は先取りしない。
- AWSリソースの作成、変更、削除、デプロイ、実DB接続、SQL実行は禁止する。ダミーDBを用いた将来のPhaseでも、明示的な依頼なしに実行しない。
- SQL本文、実行ログ、Secret値、個人情報、会社機密をGit、DynamoDB、通常のアプリケーションログ、PR本文へ書き込まない。

## 2. 必須の開発ループ

すべての設計変更・実装変更・PR準備は、次の順序で進める。現在のPhaseで不要な手順は「対象外」と記録する。

1. **Scope** — 目的、対象外、外部副作用、環境境界、完了条件を確認する。
2. **Inspect** — 既存ファイル、設計書、テスト、package scripts、ブランチ、作業ツリー、リポジトリ固有の指示を確認する。無関係な変更を上書きしない。
3. **Plan** — 変更対象、設計判断、テスト戦略、運用影響、リスク、完了Gateを計画へ記録する。同時に `in_progress` にする項目は1つだけにする。
4. **Plan Review Gate** — Planモードで作成した初稿を、ユーザーへ最終Planとして提示する前に影響範囲のエージェントへレビューさせる。指摘を反映して再レビューし、`PLAN_APPROVED` になるまで提示しない。記録は `docs/reviews/plan/` に保存する。
5. **Design review** — 実装前にTech Lead、Security、Infrastructure、Database、SRE、Platform、Qualityの各観点でレビューする。Blocking/Highを解消するまで実装へ進まない。
6. **Red** — 期待する動作を表す最小テストを先に追加し、意図した理由で失敗することを確認する。
7. **Green** — テストを通す最小実装だけを行う。仕様変更や不要なリファクタリングを混ぜない。
8. **Refactor** — テストをGreenに保ったまま、命名、責務、重複、エラー境界、ドキュメントを整理する。
9. **Verify** — 対象テスト、全テスト、型チェック、Lint、Build、CDK synth/差分、セキュリティ検査、図の構文検査を段階的に実行する。
10. **Pre-PR Agent Review Gate** — PRを作成する前に、最終Diffを独立した影響範囲のエージェントへ渡す。想定結論を事前に伝えず、ファイル・行番号・重要度付きで指摘を得て、`docs/reviews/` に記録する。Draft PRもこのGate通過前は禁止する。
11. **Fix and re-verify** — Blocking/Highを修正し、関連テストと全検証を再実行する。Mediumはリスクとスコープを記録して判断する。
12. **Handoff / PR** — 変更ファイル、ブランチ、コミット、検証コマンド、レビュー指摘、残存リスク、外部設定を報告する。Pre-PR Agent Review Gate通過後、かつユーザーが明示した場合だけPRを作成する。

### Planモード固有のルール

- Planは最初から完成版として提示せず、まず内部の `DRAFT` として作成する。`update_plan` で進捗を管理する場合も、レビュー完了までは提示用の最終Planとみなさない。
- 初稿には、目的、非目的、変更ファイル、設計判断、依存関係、テスト戦略、セキュリティ・運用影響、完了条件、未決定事項を含める。
- 最低限、Loop Coordinator / Tech Lead、Security Engineer、Quality Engineerがレビューする。AWS、DB、SRE、Platform、TDD、Privacyに影響する場合は該当エージェントを追加する。
- レビューでは、要件欠落、実装範囲の過不足、危険な前提、テスト不足、運用・復旧不足、機密情報の扱いを確認する。Blocking/Highは修正し、影響エージェントに再レビューさせる。
- レビュー経緯、指摘、修正、再レビュー、最終判定を `docs/reviews/plan/YYYY-MM-DD-<slug>.md` に記録する。Plan本文にSQL、Secret、個人情報を含めない。
- `PLAN_APPROVED` になったPlanだけをユーザーへ提示し、その後の実装・設計作業へ引き渡す。レビュー未完了のドラフトを最終案として提示しない。

### 承認後の自動実行ポリシー

- `PLAN_APPROVED` 後は、通常の読み取り、ファイル編集、テスト、Lint、型チェック、Build、構文検証、ローカル一時環境への依存導入、ドキュメント更新を確認待ちにせず連続して実行する。
- 次の操作だけは、ユーザーの明示承認なしに実行しない。破壊的操作、Workspace外の重要データの削除・上書き、AWSリソースの作成・変更・削除、外部環境・実DBへの接続、SQL実行、Secretや個人情報の取得・出力、Git Push、PR作成、Merge、外部コメント・通知。
- 権限昇格やネットワークアクセスがツール上必要な場合でも、上記の禁止操作に該当しない読み取り・検証・一時依存導入なら、可能な限り一括して実行する。ただし、実行環境の承認プロンプトを回避するために安全性を下げたり、権限を迂回したりしてはならない。
- 重要な不明点で停止した場合は、何が不可逆か、どの対象が影響するか、再開に必要な判断を短く報告する。単なる進捗確認や通常のレビュー待ちで停止しない。

## 3. レビューエージェント

役割別のレビュー指示は `.github/agents/` に置く。レビュー時は変更内容に応じて最小限ではなく、影響する役割をすべて招集する。

| 役割 | 主な責任 | 原則としてBlockingにするもの |
| --- | --- | --- |
| Loop Coordinator / Tech Lead | 計画、設計整合性、トレードオフ、スコープ | 要件欠落、設計間矛盾、未記録の重大判断 |
| TDD Test Engineer | Red/Green/Refactor、失敗系・競合系テスト | 再現可能な回帰を表すテスト欠落 |
| Security Engineer | 認証認可、IAM、S3/KMS、秘密情報、脅威 | 認可バイパス、秘密情報漏えい、公開S3、自己承認 |
| Infrastructure Engineer | AWS/VPC/CDK、環境分離、コスト | 本番経路の越境、RDS公開、必要性のないNAT、IaC不整合 |
| Database/PostgreSQL Engineer | transaction、DDL、lock、接続、DB権限 | DB結果不明の自動再実行、Rollback保証の誤認、過剰権限 |
| SRE | 障害、状態不明、監視、復旧、SLO、Runbook | 不明状態の成功扱い、無制限リトライ、復旧不能 |
| Platform Engineer | CI/CD、開発者体験、標準化、再現性 | 手作業依存、再現不能なBuild、環境差分の秘匿 |
| Quality Engineer | 受入基準、E2E、品質ゲート、文書整合性 | 必須機能の未検証、エラー表示欠落、図と実装の不一致 |
| Code Reviewer | 最終Diff、保守性、変更範囲、テスト証拠 | 無関係な変更、未検証の変更、重大な複雑性増加 |
| Release Manager | リリース判定、検証証拠、ロールバック、引き渡し | 未解決重大指摘、復旧不能、承認・検証証拠の欠落 |
| Privacy / Data Governance | 個人情報分類、保持、削除、移行、漏えい対応 | 公開機密情報、監査不能、保持・削除不能 |

各エージェントは、指摘を次の形式で返す。

```text
[Blocking|High|Medium|Low] path:line
Issue: 何が問題か
Impact: セキュリティ・データ・運用・保守への影響
Evidence: 具体的な根拠
Recommendation: 修正案または受容条件
```

## 4. TDDと検証のルール

- 状態遷移、認可、重複防止、再試行、外部ACK不明、S3改ざん、Secret・エラー文の漏えいを優先してテストする。
- 外部副作用の境界をテストダブルで分離し、実DB・本番AWSへの接続をテストの暗黙の前提にしない。
- 再試行可能な失敗を、証拠なしにACK・成功・終端状態へ変換しない。
- DB実行後の結果不明を自動再実行しない。再実行には新しい申請、承認、Execution IDを要求する。
- テストログにSQL本文、個人情報、Secret、接続文字列、内部例外全文を出力しない。
- 設計フェーズでは、Python構文、Mermaid構造、必須リンク、機密値スキャンを検証する。依存ツールがない場合は成功と報告せず、Blockerと再現手順を残す。

## 5. SQL Patch Manager固有の安全ルール

- `dry-run.sql`、`execute.sql`、`rollback.sql` は別S3 Versionとして扱い、承認対象の差し替え・上書きを許可しない。
- 実行直前にS3 VersionIdとSHA-256を再検証する。
- dry-run成功は「完全無副作用」の証明ではない。DDL、sequence、trigger、extension、FDW、外部連携、ロック、性能影響を別々に評価する。
- SQL parserやdeny-listを正規表現だけで実装しない。安全性を証明できないSQLは拒否または手動審査にする。
- Cognitoの不変な `sub` を認可判定に使い、画面のボタン制御を認可の代わりにしない。
- CodeBuildログをCloudWatchや一般ログへ流さず、機密ログ専用S3へ暗号化保存する。画面ではHTML解釈せずテキスト表示する。
- 開発・検証・本番のCodeBuild、IAM、Secret、Security Group、DB接続先を分離する。本番は社内導入時に別AWSアカウントを推奨する。

## 6. ブランチ、コミット、PR

- ブランチ作成前に現在のベースと作業ツリーを確認する。既存変更を破棄しない。
- コミットは意味のまとまりごとに作成し、実装・テスト・設計変更を追跡可能にする。
- コミットメッセージは `type(scope): summary` を基本とする（例: `docs: add review loop guidance`）。
- PRはPhase単位で作成する。1つのPRに複数Phaseの実装・設計変更を混在させない。
- 各PhaseのPRには、そのPhaseの目的、対象範囲、完了条件、検証結果、残存リスク、次Phase開始条件だけを含める。Phase内の細かいコミット分割は許容する。
- Phaseをまたぐ共通変更が必要になった場合は、影響を記録して対象Phaseを明示し、原則として先行PhaseのPRへ含める。後続Phaseの実装を先取りしない。
- PRタイトルは `[Phase N] <summary>` を基本とし、PR本文の対象Phaseと変更一覧が一致していることを確認する。
- 次PhaseのPRは、前PhaseのPRがレビュー・承認・マージ済みで、`status.md` の次Phase開始条件を満たしてから作成する。
- PRには目的、非目的、設計判断、TDDのRed/Green/Refactor証拠、検証コマンド、セキュリティ・運用影響、残存リスクを記載する。
- PR作成は、ユーザーの明示依頼に加えて、Pre-PR Agent Review Gateを通過した場合だけ許可する。GitHub上のDraft PRも同じ扱いとする。
- PR前に、影響する全エージェントのレビュー記録を `docs/reviews/YYYY-MM-DD-<slug>.md` に保存する。最低限、Loop Coordinator、Code Reviewer、Security、Quality、Release Managerを含め、変更に関係するInfrastructure、Database、SRE、Platform、TDD、Privacyを追加する。
- Blocking/High指摘が0件であること、修正後に関連テストと全検証を再実行したこと、CoordinatorとRelease ManagerがレビューGateを確認したことをPRテンプレートへ記録する。
- レビュー実行前に実装者が結論を誘導してはならない。実装者自身のレビューを、独立レビューの代替にしない。
- Push・外部コメント・AWS変更は、ユーザーが明示的に依頼した場合だけ行う。
- Git remoteがない、URLが不明、ブランチが作れない場合は、ローカル変更と検証まで行い、外部操作はBlockerとして報告する。

## 7. セッション継続とADR

- `status.md` はセッション間の引き継ぎ情報を記録する。完了済み、進行中、次の作業、Blocker、検証証拠を古くしたまま放置しない。
- 重要な設計判断は `docs/adr/` に記録する。既存ADRの本文を書き換えて履歴を消さず、変更・撤回・採用範囲は新しいADRで表現する。
- ADRのStatusは `Proposed`、`In Review`、`Accepted`、`Rejected`、`Superseded`、`Amended` のいずれかを使う。
- `status.md` のActive decisions、設計書、図、実装計画が参照するADR番号を一致させる。

## 8. Definition of Done

- 要件、設計、実装、テスト、運用、構成図の内容が一致している。
- 必須機能を「将来対応」として無断で省略していない。
- Security、Database、SREのBlocking/High指摘がない。
- 対象テスト、全テスト、型チェック、Lint、Build、IaC検証、構文検証の結果が記録されている。未実行は成功と書かない。
- 機密情報や実データが変更・ログ・テスト・PRへ混入していない。
- 失敗、タイムアウト、状態不明、再試行、復旧の動作が定義されている。
- 変更ファイル、レビュー結果、残存リスク、次のPhase開始条件が引き渡し報告に含まれている。
