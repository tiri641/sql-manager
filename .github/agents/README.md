# Review Agents

このディレクトリには、SQL Patch Managerの設計・実装・PRをレビューする役割別エージェント定義があります。

標準招集セットは次のとおりです。

1. `loop-coordinator.agent.md`
2. `tech-lead.agent.md`
3. `tdd-test-engineer.agent.md`
4. `security-engineer.agent.md`
5. `infrastructure-engineer.agent.md`
6. `database-postgresql-engineer.agent.md`
7. `sre-engineer.agent.md`
8. `platform-engineer.agent.md`
9. `quality-engineer.agent.md`
10. `code-reviewer.agent.md`
11. `release-manager.agent.md`
12. `privacy-data-governance.agent.md`

Planモードでは、最初に作成したPlanをドラフトとして扱います。Loop Coordinator / Tech Lead、Security、Qualityを必須レビューにし、影響に応じてTDD、Infrastructure、Database、SRE、Platform、Privacyを追加します。指摘を修正して再レビューし、`docs/reviews/plan/` の記録が `PLAN_APPROVED` になるまでユーザーへ最終Planを提示しません。記録には [Planレビュー記録テンプレート](../../docs/reviews/plan-review-template.md)を使用します。

PR作成前に、変更に影響するエージェントへ最終Diffをレビューさせ、`docs/reviews/YYYY-MM-DD-<slug>.md` に記録します。Blocking/Highを修正した後、関連エージェントの再レビューと関連テスト・全検証を実行します。レビュー記録がない、またはBlocking/Highが残っている状態では、Draftを含めPRを作成しません。
