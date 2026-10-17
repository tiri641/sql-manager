# Phase 2 警告是正 Plan レビュー記録

- 対象Phase: Phase 2
- Review date: 2026-10-17
- Status: `PLAN_APPROVED`
- Scope: CDK警告の是正、構成図PNGの再生成、ローカル検証、レビュー記録更新
- Non-goals: `cdk bootstrap`、`cdk deploy`、AWSリソース変更、実RDS接続、Secret取得、SQL実行、Push、PR作成

## 変更計画

1. Cognitoの非推奨`AdvancedSecurityMode`を削除し、`FeaturePlan.PLUS`と`StandardThreatProtectionMode.FULL_FUNCTION`へ移行する。
2. CloudFrontのACM証明書と一致する`UiDomainName`をCloudFormationパラメータとして追加する。実ドメインや証明書ARNはリポジトリへ保存しない。
3. KMS + CloudFront OACの初回デプロイ時ワイルドカード警告は、CDKの循環依存回避という理由をコード上で承認し、初回デプロイ後にDistribution IDへ絞る運用手順を残す。
4. VPC Endpoint用Security Groupの`cdk-nag`判定不能警告は、VPC CIDR由来のCloudFormation tokenによる判定限界であることを根拠付きで抑制する。
5. CloudFrontのGeo restriction/WAF警告は、静的UI・API分離とコスト制約を理由に初期構成では抑制し、社外公開前の必須再評価事項として記録する。
6. Python `diagrams` とGraphvizを一時実行環境へ導入し、AWS構成図PNGをソースから再生成する。導入できない場合は失敗理由と再生成手順を記録する。

## レビュー観点

- Tech Lead: CDK、設計書、図、statusの整合性
- Security: Threat Protection、CloudFront公開境界、KMS/S3、抑制理由
- Infrastructure: CloudFrontパラメータ、OAC循環依存、VPC Endpoint、コスト
- Platform: 再現可能な図生成とCIローカル検証
- Quality/TDD: CloudFormationテンプレートAssertions、全検証の再実行
- SRE/Release: 警告を隠すだけにせず、deploy前・公開前の運用ゲートを残す

## 完了Gate

- 非推奨Cognito APIを使用していない
- CloudFrontドメイン警告が解消されている
- KMS OACとcdk-nag抑制に根拠がある
- 構成図PNGが現行ソースから生成されている、または再現可能な失敗記録がある
- typecheck、lint、test、build、security scan、dev/test/prod synth、cdk-nag、図の構文検査が成功する
- 変更後Diffを対象ロールで再レビューし、Blocking/Highがない
