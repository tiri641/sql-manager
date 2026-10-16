# Contributing

SQL Patch Managerへの変更は、設計・実装・テスト・レビュー・運用を一つのループとして扱います。作業開始前に [AGENTS.md](AGENTS.md) と [ループエンジニアリング運用](docs/engineering-loop.md) を確認してください。

## 1. 作業開始

1. 目的、非目的、対象Phase、外部副作用、完了条件を確認する。
2. 作業ツリー、既存設計書、テスト、依存、ブランチを確認する。
3. 変更計画、設計判断、テスト戦略、運用影響、残存リスクを記録する。
4. 設計変更は実装前にTech Lead、Security、Infrastructure、Database、SRE、Platform、Qualityの影響範囲をレビューする。

Planモードを使用する場合、初稿Planはユーザーへ提示する前にLoop Coordinator / Tech Lead、Security、Quality、および影響範囲のエージェントへレビューさせる。指摘を修正し、`docs/reviews/plan/` に記録して `PLAN_APPROVED` になったPlanだけを最終案として提示する。

Plan承認後は、通常の調査・編集・テスト・検証を自動的に進める。破壊的操作、AWS・実DB・SQL実行、Secretや個人情報の取得、Push・PR・Merge・外部通知などの外部影響操作だけは、明示承認を得てから実行する。

## 2. TDD

- Red: 期待する振る舞いを表す最小テストを追加し、意図した理由で失敗させる。
- Green: テストを通す最小実装を行う。
- Refactor: テストをGreenに保ったまま責務・命名・重複を整理する。
- 競合、古いVersion、権限越境、リトライ、状態不明、ログ漏えい、Secret漏えいを優先してテストする。
- 実DB・本番AWS・実個人情報をテストに使わない。

## 3. ブランチとコミット

```text
feature/<short-name>
fix/<short-name>
docs/<short-name>
security/<short-name>
```

コミットは小さく意味のまとまりを保ち、次の形式を基本にする。

```text
type(scope): summary
```

例: `docs: add ADR workflow`、`fix(api): reject stale revision`。

## 4. 検証

変更内容に応じて、対象テストから始めて全体検証へ進む。

- Unit / integration / E2E
- Type check / Lint / Format / Build
- CDK `synth` / `diff` / cdk-nag（Phase 2以降）
- IAM、S3公開、KMS、Secret、環境越境、ログ漏えい検査
- Mermaid、Python diagrams、READMEリンク、ADR参照
- 失敗・タイムアウト・状態不明・復旧手順

未実行の検証は成功として報告しない。ツール不足やネットワーク不可はBlockerとして記録し、再現コマンドを残す。

## 5. PR

PRはPhase単位で作成します。1つのPRに複数Phaseの変更を混在させず、PRタイトルは `[Phase N] <summary>` を基本とします。PRには対象Phaseの目的、非目的、変更一覧、設計判断、TDDのRed/Green/Refactor、検証コマンド、セキュリティ・DB・SRE・コスト影響、残存リスク、次Phase開始条件を記載します。次PhaseのPRは、前PhaseのPRが承認・マージ済みで、`status.md` の開始条件を満たしてから作成します。

PRを作成する前に、変更に影響するエージェントをすべて招集し、`docs/reviews/` にレビュー記録を保存します。Blocking/Highを修正して再レビュー・再検証し、Loop CoordinatorとRelease ManagerがGateを確認するまで、Draftを含めPRを作成しません。

PR作成・Push・Merge・Deploy・AWS変更・SQL実行は、明示的な依頼と承認がある場合だけ行う。

## 6. 機密情報

SQL本文、個人情報、会社機密、Secret、トークン、接続情報をGit、テストログ、PR、CI artifact、通常のCloudWatchログへ入れない。脆弱性や漏えいの疑いは公開Issueではなく [SECURITY.md](SECURITY.md) の手順で報告する。
