# ループエンジニアリング運用

## 1. 目的

SQL Patch Managerの設計・実装・レビューを、計画、TDD、検証、複数観点レビュー、修正、再検証の閉じたループとして運用する。レビューを形式的な承認にせず、失敗系・セキュリティ・運用・DB副作用を早い段階で発見する。

## 2. フェーズ別のゲート

| ゲート | 成果物 | 必須レビュアー | 通過条件 |
| --- | --- | --- | --- |
| G0 Scope | 目的、非目的、影響範囲、外部副作用 | Tech Lead / Quality | 依頼と変更範囲が一致 |
| G1 Design | 要件、状態遷移、API、データ、ネットワーク、脅威、Runbook | Tech Lead / Security / Infra / Database / SRE | Blocking/Highなし、Open Questionsが明記 |
| G2 Red | 失敗する最小テスト | TDD / Quality | 期待する理由で失敗し、テストが仕様を表す |
| G3 Green | 最小実装 | TDD / Code Review | 対象テストが通り、未要求の機能がない |
| G4 Verify | 全テスト、型、Lint、Build、IaC、セキュリティ検査 | Quality / Platform / SRE | 失敗を隠さず、証拠が保存される |
| G5 Pre-PR Agent Review | 独立エージェントの最終Diffレビューと記録 | 全影響ロール / Release Manager | Blocking/Highなし、再検証済み、レビュー記録あり |
| G6 Handoff / PR | PR、変更一覧、残存リスク、運用手順 | Tech Lead / Release Manager / SRE | G5通過後のみPR作成可能 |

## 3. Planモードのレビュー・提示Gate

Planモードで実装計画や変更計画を作成する場合、初稿をそのままユーザーへ提示しない。Planを設計成果物の一部として扱い、以下のループを完了してから提示する。

1. `DRAFT` として、目的、非目的、変更対象、設計判断、依存関係、テスト戦略、セキュリティ・運用影響、完了条件、Open Questionsを作成する。
2. `IN_REVIEW` として、Loop Coordinator / Tech Lead、Security Engineer、Quality Engineerへ同じPlan初稿と対象スコープを渡す。AWS、DB、SRE、Platform、TDD、Privacyに影響する場合は該当ロールも追加する。
3. 要件欠落、過剰なスコープ、危険な前提、テスト不足、障害・復旧不足、権限境界、コスト、機密情報の扱いをレビューする。
4. Blocking/High指摘を修正し、影響するエージェントへ再レビューを依頼する。修正前の指摘と修正後の判断を記録する。
5. `PLAN_APPROVED` を記録した後にだけ、ユーザーへ最終Planとして提示する。未レビューのPlanはドラフトとしても、最終案と誤認される形では提示しない。

レビュー記録は `docs/reviews/plan/YYYY-MM-DD-<slug>.md` に保存し、[Planレビュー記録テンプレート](reviews/plan-review-template.md)を使用する。Planレビューは、実装レビューやPR前レビューの代替ではない。承認後も、実装でスコープや設計が変わった場合はPlanへ戻って再レビューする。

### Plan承認後の自動実行

`PLAN_APPROVED` 後は、通常の調査、編集、テスト、静的解析、Build、図の検証、ドキュメント更新を自動的に連続実行する。確認で停止するのは、破壊的操作、AWS・外部環境・実DBへの変更、SQL実行、Secret・個人情報の取得、Push、PR作成、Merge、外部通知など、不可逆または外部影響がある操作に限る。権限昇格の確認が必要でも、読み取り・ローカル検証・一時依存導入は可能な範囲でまとめて進める。

## 4. 設計レビューの進め方

1. 変更者が設計判断、代替案、リスク、Open Questionsを記載する。
2. Tech Leadが要件・設計書・構成図・API・データモデルの矛盾を確認する。
3. Securityが認証・認可・IAM・S3・KMS・Secret・ログ・特権アクセスを確認する。
4. InfrastructureがAWS配置、VPC、Security Group、Endpoint、アカウント分離、コストを確認する。
5. DatabaseがPostgreSQL transaction、DDL、lock、timeout、sequence、外部副作用、DB権限を確認する。
6. SREが状態不明、再試行、監視、アラーム、バックアップ、PITR、Runbook、SLOを確認する。
7. Platformが再現可能な開発環境、CI、CDK検証、依存管理、変更の小ささを確認する。
8. Qualityが要件の受入基準、UI/APIの状態網羅、図と文書の整合性を確認する。
9. 指摘を重要度分類し、Blocking/Highを修正後に再レビューする。

## 5. PR前エージェントレビューGate

PR作成前に、GitHub PRがDraftかどうかに関係なく、最終Diffをエージェントへレビューさせる。レビュー記録がない状態でPRを作成してはならない。

1. 変更対象と影響範囲を確定し、該当する役割を選ぶ。標準セットはLoop Coordinator、Code Reviewer、Security、Quality、Release Managerである。
2. 設計、AWS、DB、運用、CI、個人情報が影響する場合は、Infrastructure、Database/PostgreSQL、SRE、Platform、Privacy、TDDを必ず追加する。
3. 各エージェントへ同じ最終Diff、関連設計、テスト結果を渡す。先に期待する結論や「問題なし」という前提を渡さない。
4. レビュー結果を [レビュー記録](reviews/README.md) の形式で `docs/reviews/YYYY-MM-DD-<slug>.md` に保存する。
5. Blocking/Highをすべて修正し、関連テスト・全検証を再実行する。修正後は影響するエージェントに再レビューさせる。
6. Coordinatorがレビュー完了を確認し、Release Managerがリリース/PRの証拠を確認する。
7. PRテンプレートにレビュー記録へのリンク、対象ロール、指摘数、再検証結果を記載してからPRを作成する。

### Gate判定

```text
NOT_READY
  -> AGENT_REVIEWING
  -> CHANGES_REQUESTED     -- Blocking/Highあり
  -> RE_REVIEW
  -> PR_ALLOWED             -- 記録あり、Blocking/Highなし、再検証済み
  -> PR_CREATED             -- ユーザーが明示依頼した場合のみ
```

`PR_ALLOWED`になる前のPR作成、Draft PR作成、外部レビュー依頼は行わない。レビューエージェントはMerge、Deploy、SQL実行を行わない。

## 6. Phase単位のPR

- PRの単位はPhaseとする。Phase 1〜6をまたぐ変更を1つのPRへ混在させない。
- PRタイトルは `[Phase N] <summary>` とし、PR本文の対象Phase、変更ファイル、完了条件、検証結果、残存リスク、次Phase開始条件を対応させる。
- Phase内では、実装・テスト・設計・運用文書を複数コミットへ分けてよい。ただし、Phaseの完了条件を満たす成果物として1つのPRでレビュー可能にする。
- 次PhaseのPR作成は、前PhaseのPRがレビュー・承認・マージ済みで、`status.md` に記載された開始条件を満たした後に行う。
- 後続Phaseの実装を先取りする変更は含めない。共通基盤の変更が必要な場合は、影響するPhaseと理由をPRへ明記し、先行Phaseに含めるか別途承認する。
- PR前エージェントレビューはPhase単位の最終Diff全体を対象にし、Phaseをまたぐ未追跡の作業や別PR予定の変更を混ぜない。

## 7. PRレビューの進め方

- 差分だけでなく、変更に影響される設計書、テスト、IAM、構成図、Runbookも読む。
- 「テストがあるか」だけでなく、二重実行、古いVersion、権限越境、失敗ACK、状態不明、ログ漏えいのテストがあるかを確認する。
- レビューコメントは人格ではなく、再現手順、影響、証拠、修正案に集中する。
- Blocking/High修正後は、修正対象テストと全検証を再実行する。テスト未実行のままApprovedにしない。
- Medium/Lowを見送る場合は、理由、リスク、`status.md`、ADR、またはPR本文の対応Phaseを記録する。Issueは必須にしない。

## 8. レビュー結果の状態

```text
REQUESTED
  -> IN_REVIEW
  -> CHANGES_REQUESTED  -- Blocking/Highあり
  -> RE_REVIEW
  -> PR_ALLOWED          -- Pre-PR Agent Review Gate通過
  -> APPROVED            -- 必須Gate通過
  -> MERGED              -- ユーザー/リポジトリ権限者の操作
```

レビューエージェントはMerge、PR作成、Deploy、AWS変更を実行しない。最終的なPR作成、Merge、Push、AWS変更は明示的な権限と人間の判断に委ねる。

## 9. Phase 1での適用

現在は設計フェーズのため、G0、G1、G4の文書・構成図検証部分だけを実施する。TDDの実装テスト、CDK synth、E2E、AWS接続は未実施として扱う。`docs/implementation-plan.md` のPhase 2以降で、各ゲートを実装作業へ適用する。

## 10. セッション継続と設計判断

- セッション開始時は `status.md` のCurrent phase、In progress、Next actions、Blockers、Active decisionsを読む。
- セッション終了時は、完了項目、未完了項目、検証結果、残存リスク、次の一手を `status.md` に更新する。
- 重要な判断は `docs/adr/` に記録し、ADRの状態がAcceptedになる前に実装やリリースへ進めない。
- 既存ADRと異なる判断を採用する場合は、旧ADRを書き換えず、SupersedesまたはAmendsの新ADRを作成する。
- Release Managerは [リリースチェックリスト](release-checklist.md) と `status.md` の証拠を確認してHandoffを判定する。
