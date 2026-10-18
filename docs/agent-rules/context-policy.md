# Context and Tool Output Policy

## セッション開始

最初に`AGENTS.md`、`status.md`、`docs/engineering-loop.md`、`docs/adr/README.md`、このディレクトリのREADMEを読みます。次に、現在の作業に必要なPlan、対象コード、対象テストだけを追加で読みます。

## 作業別の追加読込

| 作業 | 追加読込 |
| --- | --- |
| Plan | 現行Plan、関連ADR、影響する設計書。過去レビューは要約または該当箇所だけ |
| SQL/認証/ログ/S3/KMS | `docs/security-design.md`と関連する設計・ADR |
| 実装 | 対象Plan、対象ソース、対象テスト |
| レビュー | 最終Diff、対象設計、対象テスト、context manifest |
| 引き継ぎ | `status.md`の最新状態。詳細履歴はリンク先だけ |

## エージェントへの入力

レビュー依頼は、対象revision、working-tree digest、許可ファイル、行範囲、検証結果、機密値を含まない要約を指定します。親セッション全文を自動的に渡すことは推奨しません。これはリポジトリ側の推奨プロトコルであり、外部Codexハーネスの継承動作を強制するものではありません。

## ツール出力

- 巨大ファイルは`cat`せず、`rg`、`sed -n`、`head`、`tail`で必要範囲だけ読む。
- コマンドは終了コードと要約を優先し、stdout/stderrをそのまま繰り返し表示しない。
- ローカルコマンドの確認には`node scripts/run-concise.mjs -- <command> [args...]`を使い、既定の80行・12KB上限と機密パターンのマスクを適用する。上限を超えた出力は省略扱いにする。
- レビュー全文は`docs/reviews/`へ保存し、後続セッションでは該当箇所だけ読む。
- SQL本文、Secret、個人情報、接続情報、raw stderrを出力・保存しない。

Codex UI、CLI、MCPの内部stdout上限はリポジトリから直接制御できません。上記はエージェント運用とCI検証で軽減します。

## Context manifest

`context-manifest.schema.json`に従い、レビュー入力に含めるファイルと行範囲を明示します。digest対象は`verify-agent-context.mjs`の明示的な非機密path allowlistに限定し、未知path、パストラバーサル、symlink、SQL拡張子、Secret path、`.git`、`node_modules`はfail-closedで拒否します。生成後は`node scripts/verify-context-manifest.mjs <manifest>`で行範囲とdigestを再検証します。Git revisionが取得できない場合は`working-tree`と明示し、commitやclean状態を推測しません。
