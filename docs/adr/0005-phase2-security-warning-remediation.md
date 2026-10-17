# ADR-0005: Phase 2の認証・CloudFront警告是正方針

- Status: Accepted
- Date: 2026-10-17
- Owners: SQL Patch Manager
- Reviewers: Loop Coordinator / Tech Lead / Security / Infrastructure / Platform / Quality / SRE / Release Manager
- Supersedes: なし
- Amends: [ADR-0004](0004-phase2-cdk-environment-boundary.md)

## Context

Phase 2のCDK検証で、Cognitoの旧Advanced Security API、CloudFrontのドメイン未指定、KMS + CloudFront OACの初回ポリシー、VPC Endpoint Security Groupのcdk-nag判定不能が確認された。警告を無視したままPRへ進めると、非推奨APIの将来破壊、証明書とドメインの不一致、KMSポリシーの意図不明、検証結果のノイズにつながる。

## Decision

- Cognitoは`FeaturePlan.PLUS`と`StandardThreatProtectionMode.FULL_FUNCTION`を使用する。旧`AdvancedSecurityMode`は使用しない。
- `PLUS`はアクティブユーザー数に応じた料金とCloudFormationデプロイ時の機能要件があるため、Phase 3のdeploy前に料金上限と認証要件を再確認する。料金を受容できない場合はThreat Protectionを無効化する代替案を再レビューし、セキュリティ強度の変更を承認する。
- CloudFrontの`UiCertificateArn`と`UiDomainName`はCloudFormationパラメータとして受け取り、実ドメイン・証明書ARNをリポジトリ、context、ログへ保存しない。`UiDomainName`は証明書のSANと一致させる。
- KMS + OACのワイルドカードKey policyは、CDKが初回の循環依存を回避するために生成する既知の構成としてコード上で承認する。初回deploy後、CloudFront Distribution IDだけに条件を絞ることをdeploy完了条件とする。
- CloudFrontのGeo restrictionとWAFは初期コストと社内静的UI/API分離を理由に初期CDKへ無条件追加しない。社外公開または機密UIを許可する前に、Geo restriction、WAF、CloudFrontログ、レート制限を必須再評価する。
- VPC Endpoint Security Groupのcdk-nag判定不能は、CDKが生成するVPC CIDR tokenをルールが解決できない検証上の制約である。非インターネット経路、CodeBuildからのHTTPSのみという設計根拠をコード上の抑制理由として残す。

## Alternatives considered

| 案 | 判断 |
| --- | --- |
| 旧`AdvancedSecurityMode.ENFORCED`を継続 | 不採用。CDKの非推奨APIで将来のメジャー更新に耐えない |
| `FeaturePlan.ESSENTIALS`でThreat Protectionを設定 | 不採用。新規User PoolではThreat ProtectionにPLUSが必要 |
| CloudFrontに実ドメインをコードへ固定 | 不採用。環境差分・秘密情報・証明書管理をリポジトリへ持ち込む |
| KMS OAC警告を無条件に無視 | 不採用。初回例外と、deploy後のポリシー絞り込みを明示する |
| 初期からWAFを必須化 | 保留。外部公開前の必須Gateとし、個人開発の固定費を増やさない |

## Consequences

### Positive

- 非推奨APIとCloudFrontドメイン未指定警告を解消できる。
- OACの既知の初回ポリシー例外とdeploy後の是正条件が監査可能になる。
- cdk-nagの判定不能を設計根拠付きで区別できる。

### Negative / Risks

- Cognito PLUSの料金をdeploy前に確認しないと、個人開発のコスト上限を超える可能性がある。
- WAFを追加するまで、CloudFrontエッジに対するアプリケーション層防御は限定的である。
- Phase 2のsynthだけでは証明書のSAN一致や初回deploy後のKMSポリシーを実証できない。

## Validation

- `npm run cdk:nag`で非推奨・CloudFrontドメイン・KMS OAC・EC23の警告を確認し、理由付き抑制以外の警告がないこと。
- `npm test`でCognitoのPLUS/Threat ProtectionとCloudFront AliasのAssertionsを確認する。
- Phase 3 deploy前に料金、ACM証明書、ドメイン、WAF/Geo、KMSポリシーを再レビューする。

## Revisit / rollback conditions

- Cognitoの料金、認証要件、社内IdP統合が変わる場合は本ADRをAmendする。
- 社外公開、個人情報を扱うUI、攻撃面の増加がある場合はWAF/Geo restrictionを採用する新ADRを作成する。
- OAC初回deploy後にワイルドカードを絞れない場合はリリースを停止する。
