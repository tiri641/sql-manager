# 設計・PRレビュー・チェックリスト

## 設計レビュー

### Scope / Tech Lead

- [ ] 必須要件が設計書・API・UI・データモデルへ対応づけられている
- [ ] 非目的、制約、Open Questions、代替案が明記されている
- [ ] 状態遷移と許可操作・拒否操作に矛盾がない
- [ ] 図、本文、実装計画のコンポーネント名が一致している
- [ ] 起動漏れ・重複起動・結果不明・ログ保存失敗を別状態として扱っている

### Security

- [ ] Cognito JWT検証と `sub` ベース認可がAPI側で実施される
- [ ] owner/approver分離、自己承認拒否、環境権限が条件付きで検証される
- [ ] SQL本文・Secret・PIIがDynamoDB、通常ログ、GitHub、PRへ漏れない
- [ ] S3 Block Public Access、Versioning、暗号化、TLS、短期URL、KMS方針がある
- [ ] BreakGlassとAWS特権アクセスを通常権限と混同していない
- [ ] 実行ロール、APIロール、デプロイロールが分離されている

### Infrastructure / Platform

- [ ] CodeBuildからRDSへの経路、Private Subnet、Security Group、TLSが明確
- [ ] NAT Gateway、S3/DynamoDB Gateway Endpoint、Secrets Manager Interface Endpointの採否理由がある
- [ ] 環境別CodeBuild、IAM、Secret、SG、DB接続先が分離されている
- [ ] CDK contextや設定へSecret値・個人情報を入れない
- [ ] CIでcdk synth、cdk-nag、構成図整合性、秘密スキャンを実行できる計画がある
- [ ] コスト上限、ログ容量、CodeBuild時間、Endpoint課金を監視できる

### Database / SQL

- [ ] dry-runのtransaction境界とSQL内COMMIT等の拒否が明確
- [ ] DDL、`CREATE INDEX CONCURRENTLY`、sequence、trigger、extension、FDW、外部副作用を評価している
- [ ] statement timeout、lock timeout、接続切断、ROLLBACK確認がある
- [ ] dry-runとexecuteの別ファイル差分リスクを承認者へ提示する
- [ ] DB結果不明時に自動再実行しない
- [ ] DBユーザーがmaster/superuserではなく環境別最小権限である

### SRE / Quality

- [ ] UNKNOWN、TIMEOUT、ROLLBACK_UNCONFIRMED、RESULT_PERSISTENCE_FAILEDが定義されている
- [ ] 監視、アラーム、Audit、保持、削除、Backup、PITR、復旧Runbookがある
- [ ] ログのサイズ上限、切り詰め、HTML非解釈、エスケープがある
- [ ] UIのボタン制御とAPIの認可が二重にある
- [ ] 正常系だけでなく失敗・競合・再試行・権限越境を受入基準に含む

## PRレビュー

- [ ] PRの目的、非目的、設計判断、変更一覧が明確
- [ ] Red/Green/Refactorのテスト証拠がある
- [ ] 対象テスト、全テスト、型、Lint、Build、IaC検証のコマンドと結果がある
- [ ] 無関係な変更、生成物、Secret、SQL本文、実データが混入していない
- [ ] セキュリティ、DB、SRE、Platformのレビュー結果がある
- [ ] Blocking/Highは修正済み、未対応事項はIssueとPhaseに紐づいている
- [ ] Migration、ロールバック、運用影響、コスト影響が記載されている
- [ ] Merge、Push、Deployを自動的に実行する記述がない

