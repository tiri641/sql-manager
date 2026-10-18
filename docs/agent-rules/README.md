# Agent Rules Index

このディレクトリは、毎回自動読込される最上位ルールではなく、`AGENTS.md`から参照される詳細運用資料です。

## 正本の優先順位

1. `AGENTS.md`: AWS/DB/SQL、機密情報、fail-closed、Plan/PR Gate、status/ADRの不変条件
2. `docs/engineering-loop.md`: Scope、Inspect、Plan、TDD、Verify、Handoffの開発ループ
3. path配下のより具体的な`AGENTS.md`: root安全規則を弱めない補足
4. `.github/agents/`: 役割別レビューの責任とレビュー形式
5. `docs/security-design.md`、`docs/adr/`: セキュリティ設計と重要な設計判断
6. `docs/agent-rules/`: 読込範囲、コンテキストmanifest、ツール出力の運用

矛盾がある場合は上位を優先し、矛盾を検証失敗として扱います。

## 参照資料

- [コンテキスト・ツール出力ポリシー](context-policy.md)
- [正本対応表](source-of-truth.json)
- [正本対応表のschema](source-of-truth.schema.json)
- [レビューエージェント一覧](../../.github/agents/README.md)
- [設計・実装ループ](../engineering-loop.md)
- [セキュリティ設計](../security-design.md)

## 通常セッションの読込

通常開始時は`AGENTS.md`、`status.md`、`docs/engineering-loop.md`、`docs/adr/README.md`、このREADMEを読みます。SQL、認証認可、ログ、S3/KMSに関わるPlan・実装・レビューでは、`docs/security-design.md`と関連ADRも読みます。

詳細な過去レビュー全文や無関係なPhaseの設計書は、対象範囲に必要な場合だけ読みます。
