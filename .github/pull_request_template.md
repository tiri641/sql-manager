## 概要

<!-- 何を、なぜ変更したか。ユーザー影響と対象Phaseを記載してください。 -->

- 対象Phase: `Phase 1` / `Phase 2` / `Phase 3` / `Phase 4` / `Phase 5` / `Phase 6`
- PRタイトル: `[Phase N] <summary>` 形式
- 前PhaseのPR: <!-- URLまたは「Phase 1のため該当なし」 -->
- 次Phase開始条件との関係:

## 非目的

<!-- 今回変更しないこと。特にAWS変更、DB変更、SQL実行の有無を記載してください。 -->

## 設計・運用影響

- 設計書・構成図:
- セキュリティ:
- DB / Migration:
- SRE / 監視 / 復旧:
- コスト:

## TDDの証拠

- Red（意図した失敗）:
- Green（最小実装）:
- Refactor:

## 検証コマンドと結果

```text
<!-- 実行した正確なコマンド、成功/失敗、未実行の理由を記載 -->
```

## レビュー結果

- [ ] Tech Lead
- [ ] TDD / Test
- [ ] Security
- [ ] Infrastructure
- [ ] Database / PostgreSQL
- [ ] SRE
- [ ] Platform
- [ ] Quality
- [ ] Code Review
- [ ] Release Manager
- [ ] Privacy / Data Governance（データ影響がある場合）

## PR前エージェントレビューGate（必須）

- レビュー記録: `docs/reviews/YYYY-MM-DD-<slug>.md`
- レビュー実施日時:
- 対象エージェント:
- Blocking件数:
- High件数:
- Medium/Lowの判断:

- [ ] PR作成前に独立エージェントレビューを完了した
- [ ] レビュー記録を保存し、このPRから参照できる
- [ ] Blocking/Highを修正し、影響するエージェントに再レビューさせた
- [ ] 関連テストと全検証を修正後に再実行した
- [ ] Loop CoordinatorがGateを確認した
- [ ] Release ManagerがPR作成可否を確認した

> このGateが完了するまで、Draftを含むPRを作成しない。

## 安全性チェック

- [ ] SQL本文、Secret、個人情報をGit・ログ・PRへ含めていない
- [ ] 自己承認、権限越境、環境越境を防止している
- [ ] 状態不明を成功扱い・自動再実行していない
- [ ] AWSリソース変更、DB接続、SQL実行は明示的なスコープ内である
- [ ] 残存リスクと次のPhase開始条件を記載した
- [ ] このPRに複数Phaseの変更を混在させていない
- [ ] 前PhaseのPRが承認・マージ済みで、`status.md` の開始条件を満たしている（Phase 1は該当なし）
