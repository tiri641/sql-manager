# リリースチェックリスト

## 1. Release readiness

- [ ] 対象Phase、リリース範囲、非目的、変更一覧が確定している
- [ ] PRが対象Phaseの変更だけを含み、複数Phaseをまたいでいない
- [ ] Phase 2以降は、前PhaseのPRが承認・マージ済みで、`status.md` の開始条件を満たしている
- [ ] 必須機能FR-01〜FR-15と10画面の受入結果がある
- [ ] 関連ADRがAcceptedで、設計書・構成図・実装と一致している
- [ ] Migration、データ変更、ロールバック、バックアップ/PITR手順がレビュー済み
- [ ] 開発・検証・本番の設定、IAM、Secret、DB接続先を再確認した

## 2. TDD / verification

- [ ] Red/Green/Refactorの証拠がPRにある
- [ ] Unit、integration、E2E、負荷、権限、セキュリティ、障害注入を必要範囲で実行した
- [ ] Type check、Lint、Format、Build、CDK synth/diff/cdk-nagを実行した
- [ ] Mermaid、Python diagrams、README、ADRリンクを検証した
- [ ] 未実行の検証、環境依存のBlocker、既知の失敗を明記した

## 3. Security / privacy

- [ ] SQL本文、Secret、個人情報、実データがGit、PR、CI artifact、通常ログにない
- [ ] Cognito、owner/approver分離、自己承認拒否、環境越境拒否を確認した
- [ ] S3 Block Public Access、Versioning、暗号化、署名URL、KMS、IAMを確認した
- [ ] CodeBuild標準ログ、CloudWatch、エラー応答への機密情報漏えいがない
- [ ] BreakGlass、Audit、保持、削除、脆弱性報告経路が確認できる

## 4. Reliability / operations

- [ ] UNKNOWN、TIMEOUT、ROLLBACK_UNCONFIRMED、RESULT_PERSISTENCE_FAILEDを成功扱いしていない
- [ ] CodeBuild起動漏れ、重複起動、DB結果不明、ログ保存失敗のRunbookがある
- [ ] メトリクス、アラーム、相関ID、保持期間、コスト監視が設定されている
- [ ] RDS、S3、DynamoDBのバックアップと復元テストがある
- [ ] RTO/RPO、連絡網、オンコール、承認者不在時の運用が決まっている

## 5. Approval and rollback

- [ ] Tech Lead、TDD、Security、Infrastructure、Database、SRE、Platform、Quality、Code Reviewの必要な承認がある
- [ ] PR作成前に独立エージェントレビューを完了し、`docs/reviews/` に記録した
- [ ] Blocking/High指摘が0件で、修正後の再レビュー・再検証が完了している
- [ ] Loop CoordinatorとRelease ManagerがPR作成可否を確認した
- [ ] Blocking/High指摘がすべて解消されている
- [ ] 残存Medium/Lowの受容理由、`status.md`/ADR/PR本文の記録場所、対応Phaseが明記されている
- [ ] 本番承認者が申請者と異なる
- [ ] リリース後の監視時間、停止判断、ロールバックまたはPITRの責任者が決まっている

## 6. Handoff

- [ ] リリースバージョン、コミット、実行コマンド、検証結果を記録した
- [ ] Runbook、設計書、ADR、構成図、運用連絡先へのリンクがある
- [ ] Push、Merge、Deploy、SQL実行は許可された担当者が実行する
