# Agent Review Records

このディレクトリには、PR作成前に実施したエージェントレビューの記録を保存します。レビュー記録がない、またはBlocking/High指摘が残っている変更は、Draftを含むPRを作成しません。

## ファイル名

```text
YYYY-MM-DD-<change-slug>.md
```

1変更につき1記録を作成します。修正後の再レビューは同じ記録へ追記し、実施日時と対象Diffを明記します。

## Phase単位のPR

- PRはPhase単位で作成し、レビュー記録のMetadataに対象Phaseを明記します。
- 1つのPRへ複数Phaseの変更を混在させません。Phase内の複数コミットは許容します。
- `PR_ALLOWED` は対象Phaseの最終Diff全体に対して判定します。
- 次Phaseのレビュー記録は、前PhaseのPRが承認・マージ済みで、`status.md` の開始条件を満たした後に作成します。

## 必須レビュアー

- Loop Coordinator
- Code Reviewer
- Security Engineer
- Quality Engineer
- Release Manager

変更に応じて、Infrastructure、Database/PostgreSQL、SRE、Platform、Privacy/Data Governance、TDD/Testを追加します。設計、AWS、DB、運用、CI、個人情報のいずれかに影響する場合は該当ロールを省略しません。

## 記録ルール

- [pre-pr-template.md](pre-pr-template.md)をコピーして使う。
- レビュー対象のDiff、コミット、設計書、検証結果を特定する。
- SQL本文、Secret、個人情報、実行結果の生データを記録へ貼り付けない。
- 指摘は重要度、ファイル・行、問題、影響、証拠、修正案で記録する。
- Blocking/High修正後は、影響するエージェントに再レビューさせ、関連テストと全検証を再実行する。
- Medium/Lowを受容する場合は、理由、対応Phase、`status.md`またはADRへの参照を記載する。Issueは必須にしない。

## Planモードのレビュー

Planモードの初稿をユーザーへ提示する前にも、影響範囲のエージェントレビューを実施します。レビュー記録は `plan/YYYY-MM-DD-<slug>.md` に保存し、[Planレビュー記録テンプレート](plan-review-template.md)を使用します。`PLAN_APPROVED` になるまで、Planを最終案として提示しません。

## Gate判定

`PR_ALLOWED` は、必須レビュアーの記録、Blocking/High 0件、修正後の再検証、Loop CoordinatorとRelease Managerの確認がすべて揃った場合だけ付与します。
