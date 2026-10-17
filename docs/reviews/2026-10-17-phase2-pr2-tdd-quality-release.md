# PR #2 Phase 2 最終Diffレビュー

- Review status: `CHANGES_REQUESTED`
- Review date: 2026-10-17
- PR: [#2 `[Phase 2] AWS基盤CDK実装・検証`](https://github.com/tiri641/sql-manager/pull/2)
- Base / target: `main` (`943ff5d`) -> `phase/2-infra-cdk` (`912624e`)
- Review roles: TDD Test Engineer / Quality Engineer / Release Manager
- Scope: 最終Diff、テスト網羅性、CI、IaC synth、cdk-nag、図・文書整合性、完了条件、検証証拠
- External side effects: AWS操作、DB接続、SQL実行、Push、Mergeなし

## Review evidence

- [x] `main..phase/2-infra-cdk` の最終Diffと生成済みCloudFormationテンプレートを確認
- [x] Phase 2の実装計画、運用設計、アーキテクチャ、ADR、`status.md`を確認
- [x] `npm test`: 成功（backend 1件、CDK 2ファイル・各テスト成功）
- [x] `npm run typecheck`: 成功
- [x] `npm run lint`: 成功。ただし実体はTypeScript typecheck
- [x] `npm run build`: 成功
- [x] `npm run security:scan`: 成功
- [x] dev/test/prodの`cdk synth --context runNag=true`: 成功。出力は根拠付き抑制のINFOのみ
- [x] `git diff --check`: 成功
- [ ] GitHub APIからのPR本文・最新CI表示の取得。実行環境のネットワーク制限で取得できず、ローカルupstreamの最終Diffを正本としてレビュー

## Findings

### [High] `infra/cdk/src/stacks/execution-stack.ts:123-128`

Issue: CodeBuild実行ロールへSQLバケット全体の` s3:GetObject` / `s3:GetObjectVersion`を付与している。

Impact: 同一環境の他PatchのSQL本文までCodeBuild実行ロールから読み取れる。将来のrunner不備やCodeBuild侵害時に、申請者・担当外の機密SQLが横断取得される。

Evidence: `storage.sqlBucket.arnForObjects("*")`をリソースに使用している。生成テンプレートでもSQLバケットARNに`/*`が付いたRead権限になる。一方、`docs/security-design.md`は実行対象のキー・VersionIdに限定する設計を記載している。

Recommendation: Phase 2のFail-Closed placeholderではSQL本文Read権限を付与しない、またはPhase 3で実行単位のprefix・動的な権限境界を設計してから付与する。SQLバケット全体Readを検出するCDK Assertionを追加する。

### [High] `infra/cdk/src/stacks/execution-stack.ts:79-86`

Issue: CodeBuildのS3標準ログ設定により、生成テンプレート上のCodeBuild実行ロールへログバケット全体の` s3:DeleteObject*`等が付与されている。

Impact: SQL実行結果を保存するLog S3の既存オブジェクトをCodeBuild実行ロールが削除・変更でき、ログの不変性・監査性・再実行時の非上書き要件と矛盾する。標準ログを将来誤って有効利用した場合、機密出力が別経路へ流れるリスクも残る。

Evidence: `logging.s3`を有効化している。生成された`test-Execution.template.json`ではLog bucketに対して` s3:DeleteObject*`、`PutObject`、タグ操作等が`/*`へ許可されている。`docs/security-design.md`は新規キーのみPutし、既存キーの上書き・Deleteを拒否する設計である。

Recommendation: 機密結果Log S3とCodeBuild標準ログを分離し、標準ログを無効化するか非機密の一時バケットへ隔離する。結果ログ用ロールには指定prefixへの新規Putだけを許可し、Delete権限がないことをAssertionで固定する。

### [High] `infra/cdk/src/stacks/execution-stack.ts:100-117`

Issue: CodeBuild実行ロールとProjectに対して、`AwsSolutions-IAM5`を`regex: /.*/`で一括抑制している。

Impact: cdk-nagが検出するIAMワイルドカードを将来追加分も含めて抑制するため、今回確認されたSQL全体Read・Log全体Deleteのような過剰権限をCIのcdk-nag結果から発見できない。`cdk-nag`成功が最小権限の証拠にならない。

Evidence: `npm ... synth --context runNag=true`は成功したが、生成テンプレートには上記の広範なS3権限が残っている。抑制対象が特定のAWS生成権限ではなく`/.*/`である。

Recommendation: 必要なAWSサービス統合権限だけを具体的な`appliesTo`へ限定し、データバケットのRead/Write/Delete権限は抑制対象から外す。IAMポリシーの許可Action・Resourceを直接検査するテストを追加する。

### [Medium] `infra/cdk/test/infrastructure.test.ts:59-192`

Issue: テストはdev中心で、testのみ一部境界を確認しており、prod、Security Groupの実ルール、RDS backup、Secret権限、Fail-Closed BuildSpec、SQL/LogのIAM境界を十分に検査していない。テスト名「CodeBuild is the only database ingress」も、実際にはDatabaseStackのRDS属性しか確認していない。

Impact: prod固有設定やSecurity Group・IAMの回帰が、CIのsynth成功だけでは検出されない。Phase 2実装計画のテスト項目を満たしたという証拠が不足する。

Evidence: `createStacks("test")`を使う環境別Assertionは1テストだけで、prodのRDS非作成・Secret参照・環境別権限をAssertionしていない。NetworkStackの5432 ingress、CodeBuild BuildSpecの`exit 1`、RDS backupRetention、Log bucket Delete不可のAssertionもない。

Recommendation: dev/test/prodをパラメータ化した境界テストを追加し、SGのsourceをCodeBuild SGだけに限定すること、各環境のRDS所有境界、Secret ARN、BuildSpec fail-closed、S3/IAM Action・Resourceを直接検査する。

### [Medium] `docs/diagrams/aws-infrastructure.py:48-64`

Issue: AWSインフラ構成図にEventBridgeとDispatcher Lambdaが実在するControl Planeとして描かれているが、Phase 2 CDKはEventBridgeリソースとDispatcher Lambdaを作成せず、`dispatcherRole`だけを定義している。

Impact: 図を読んだ第三者が、非同期実行経路がPhase 2で実装済み、またはEventBridgeがキューとして存在すると誤認する。Phase 3の未実装範囲と現在のIaCの差分が不明確になる。

Evidence: `infra/cdk/src/stacks/execution-stack.ts`にはDispatcherRoleはあるが、EventBridge Rule/Scheduler、SQS、Dispatcher Lambdaはない。`docs/implementation-plan.md:94-114`はDispatcher/ReconcilerをPhase 3対象としている。

Recommendation: Phase 2の実装図と将来論理図を分けるか、該当ノードを「Phase 3 planned / not provisioned」と明示する。EventBridgeの役割（キューではなく起動・再調整）も図と本文で統一する。

### [Medium] `docs/implementation-plan.md:65` / `docs/operations.md:89`

Issue: Phase 2の実装対象・運用設計にCloudWatchメトリクス、Cost Anomaly Detection、環境別Cost Allocation TagをPhase 2で設定すると記載されているが、DiffのCDK実装はLog GroupとAWS Budgetsのみで、これらを作成していない。

Impact: Phase 2完了条件と実際の運用制御の範囲が一致せず、コスト超過・監視不足を見落とす。PRの完了条件を第三者が再現できない。

Evidence: `BudgetStack`は`AWS::Budgets::Budget`のみを作成し、Cost Anomaly Detection、通知先、Cost Allocation Tag、CloudWatch Alarm/Metricは定義していない。

Recommendation: Phase 2で未実装なら「設計・将来設定」へ変更し対応PhaseとGateを明記する。Phase 2完了条件に含めるなら対応するCDKとAssertionsを追加する。

### [Medium] `infra/cdk/src/stacks/network-stack.ts:113-117`

Issue: DNS用egressのCIDRが`EnvironmentConfig.vpcCidr`ではなく`10.60.0.0/16`に固定されている。

Impact: VPC CIDRを環境別に変更すると、CodeBuildからDNSへの通信許可がVPC設定と不一致になり、Secret取得などの名前解決が失敗する可能性がある。現在のデフォルトだけを合成するテストでは検出できない。

Evidence: VPC自体は`props.config.vpcCidr`を利用しているが、DNS egressは固定文字列である。

Recommendation: DNS egressの値を設定から生成し、デフォルト以外のCIDRを使うテストを追加する。

### [Medium] `status.md:63-81` / `docs/release-checklist.md:15-18`

Issue: PR完了に必要なTDD Red/Green/Refactor、Format、cdk diff、図・リンクCIの検証証拠が、ローカルのPhase 2引き継ぎ情報とレビュー記録にない。

Impact: テストがGreenになったことは確認できるが、テストを先に失敗させた証拠、フォーマット、差分検証、図・リンクの継続的CI保証をRelease Managerが確認できない。未実行を成功扱いにはできない。

Evidence: `status.md`にはtypecheck、lint、test、build、synth、cdk-nag、secret scan等はあるが、Red/Green/Refactor、Format、`cdk diff`の結果はない。CIはテスト・synth・nag・secret scanを実行するが、Mermaid/Python図・READMEリンク検査は実行していない。

Recommendation: PR本文またはレビュー記録へ実行コマンドと結果を追記し、Phase 2で対象外とする検証は理由と対応Phaseを明記する。図・リンク検証をCIへ追加するか、手動Gateとして必須化する。

### [Low] `package.json:11-17` / `infra/cdk/package.json:7-13`

Issue: `lint`スクリプトが実際には`tsc --noEmit`であり、コードスタイル・フォーマットLintを実行していない。

Impact: CIの「Lint成功」という表示が、型検査以外の品質検査も通ったという誤解を生む。

Recommendation: 実際のLint/Formatを導入するか、スクリプト名とPRの検証証拠を`typecheck`相当へ改める。

## Role decisions

### TDD Test Engineer

対象のコンパイル・ユニット・CDK AssertionはGreenだが、IAM、prod境界、SG、Fail-Closed BuildSpec、ログ不変性の回帰テストが不足している。TDD証拠のRed/Green/Refactor記録も不足している。

### Quality Engineer

CIの主要コマンドは成功したが、実装とテスト・図・運用文書の間に上記の不一致がある。特に図上のEventBridge/DispatcherをPhase 2実装済みと誤認させない明示が必要である。

### Release Manager

High指摘が3件あり、Phase 2完了条件と検証証拠にも未解決Mediumがあるため、現時点でマージ承認不可。Phase 2はAWS deploy可能状態ではなく、`cdk bootstrap`、`cdk deploy`、AWS API、DB接続、SQL実行は引き続き未実施である。

## Decision

- Blocking: 0
- High: 3
- Medium: 5
- Low: 1
- PR Gate: `CHANGES_REQUESTED`
- Merge: 実施しない

High修正後は、影響するテストを追加し、全テスト、typecheck、lint、build、security scan、dev/test/prod synth、cdk-nag、図・文書検証を再実行してから再レビューする。
