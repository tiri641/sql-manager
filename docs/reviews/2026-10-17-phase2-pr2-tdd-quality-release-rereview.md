# PR #2 Phase 2 修正後最終Diff再レビュー

- Review status: `CHANGES_REQUESTED`
- Review date: 2026-10-17
- PR: [#2 `[Phase 2] AWS基盤CDK実装・検証`](https://github.com/tiri641/sql-manager/pull/2)
- PR HEAD: `912624e`
- Review roles: TDD Test Engineer / Quality Engineer / Release Manager
- Scope: 追加テスト、CI、IaC synth、cdk-nag、図・文書整合性、検証証拠、マージ判定
- External side effects: AWS操作、DB接続、SQL実行、Push、Mergeなし

## Review scope clarification

PR HEAD (`912624e`) とWorkspaceの修正後作業ツリーを分けて確認した。初回レビューの修正はWorkspaceには存在するが、`git status`上で未コミットであり、PR HEADには含まれていない。したがって、修正後ローカルDiffの品質判定と、現在のPRのマージ判定は分ける。

## Verification evidence

- `npm test`: 成功（backend 1テストファイル、CDK 2テストファイル）
- `npm run typecheck`: 成功
- `npm run lint`: 成功。ただし実体はTypeScript typecheck
- `npm run build`: 成功
- `npm run security:scan`: 成功
- `cdk synth --context environment=dev|test|prod`: 成功
- 各環境の`cdk synth --context runNag=true`: 成功。ERROR/WARNINGなし、根拠付きINFOのみ
- `git diff --check`: 成功
- Mermaid 3図の静的検査: 成功
- `python3`によるAWS構成図のAST検査: 成功
- `aws-infrastructure.png`: PNG、3137x4786、RGBAを確認
- GitHub APIのPR最新状態取得: ネットワーク制限で未取得
- Mermaid CLI完全描画: `mmdc`未導入のため未実行。READMEに再生成手順と制約を記載済み

## Findings

### [Blocking] `status.md:34-44`

Issue: 初回レビューの修正が未コミットで、PR #2のHEAD (`912624e`)に含まれていない。

Impact: PR上ではCodeBuildの機密S3・DynamoDB権限問題が未修正のまま残り、修正後コードに対するCI結果も存在しない。現状態でマージすると、修正前のテンプレートが取り込まれる。

Evidence: `git status`で`execution-stack.ts`、テスト、設計書、ADR等が変更・未追跡。`HEAD`と`origin/phase/2-infra-cdk`は`912624e`で一致し、修正は作業ツリーDiffにのみ存在する。`status.md`も次の作業を更新コミットのPushとしている。

Recommendation: 修正を意味単位でコミットし、ユーザー承認後にPushする。GitHub Actionsの再実行と、PR HEADに対する同じ3観点の再レビューが完了するまでマージしない。

### [High] `infra/cdk/src/stacks/execution-stack.ts:35-86` (PR HEAD `912624e`)

Issue: PRに含まれるCodeBuild実行ロールがSQL S3、Log S3、Secrets Manager、DynamoDB、KMSのデータプレーン権限を持ち、標準S3ログと成果物をLog S3へ保存する。

Impact: 他PatchのSQL取得、承認・監査状態の改変、機密ログの上書き・削除、標準出力の意図しない保存につながる。

Evidence: PR HEADの`addStoragePermissions`、`databaseSecret.grantRead`、`addExecutionTablePermissions`、`artifacts.s3`、`logging.s3`。修正後ローカルではこれらを削除し、`NO_SOURCE`/`NO_ARTIFACTS`と標準ログ無効へ変更済みだが、PRには未反映。

Recommendation: 修正後ローカルDiffをPRへ反映し、生成テンプレートでデータプレーン権限がないことをAssertionで固定する。

### [High] `infra/cdk/src/stacks/execution-stack.ts:100-117` (PR HEAD `912624e`)

Issue: PRの`AwsSolutions-IAM5`抑制が`/.*/`で一括適用され、過剰なIAMワイルドカードをcdk-nagが検出できない。

Impact: 将来のデータプレーン権限追加や権限範囲の拡大が、cdk-nag成功の陰に隠れる。

Evidence: PR HEADのCodeBuildロール・Projectに対する`appliesTo: [{ regex: "/.*/" }]`。修正後ローカルではAWSサービス統合に必要な具体的な対象へ限定しているが、未反映。

Recommendation: 修正後の限定的な抑制をPRへ反映し、必要なワイルドカードのAction/ResourceだけをAssertionで検証する。

### [Medium] `infra/cdk/test/infrastructure.test.ts:141-172` (修正後ローカルDiff)

Issue: Fail-Closed、ログ無効、データプレーン権限なしのAssertionは追加されたが、主にdevを対象とし、prod境界と全S3/DynamoDB/Logs権限の不在を網羅的には固定していない。

Impact: prod固有設定や未検査の権限Actionが将来追加されても、テストがGreenのままになる可能性がある。

Evidence: 現行テストは`createDevStacks()`中心で、権限拒否は限定したActionの正規表現に依存している。ローカル`npm test`は成功した。

Recommendation: dev/test/prodをパラメータ化し、許可Action/ResourceのAllow-listまたは全` s3:`/`dynamodb:`/`secretsmanager:`/`kms:`/`logs:`不在を直接検証する。

### [Medium] `infra/cdk/src/stacks/storage-stack.ts:117-123` / `infra/cdk/test/infrastructure.test.ts:79-107` (修正後ローカルDiff)

Issue: Log S3の現行Version期限と不完全Multipart Upload期限は実装されたが、そのLifecycle設定をテストが直接検証していない。

Impact: 機密ログ保持期間や不完全アップロード削除が将来退行しても、synth成功だけでは検出できない。

Evidence: `npm test`は成功したが、storage AssertionはVersioning、公開拒否、暗号化、OAC中心で、`ExpirationInDays`と`AbortIncompleteMultipartUpload`を確認していない。

Recommendation: SQL/Log用途ごとにLifecycleルール、現行/非現行Version、Multipart期限をCloudFormation Assertionへ追加する。

### [Medium] `infra/cdk/cdk.out/dev-Execution.template.json:123-125` / `infra/cdk/test/infrastructure.test.ts:165-171` (修正後ローカルDiff)

Issue: CodeBuildのCloudWatch Logs設定は`DISABLED`だが、生成テンプレートにはCodeBuild実行ロールの`logs:CreateLogGroup`、`logs:CreateLogStream`、`logs:PutLogEvents`が残る。テストはログ設定だけを確認し、生成権限を確認していない。

Impact: 現在のログ経路は無効でも、設定変更時に標準ログが有効化されると機密出力の経路が復活し得る。Phase 2の最小権限境界が明確でない。

Evidence: 修正後ローカルのsynth済みテンプレートにログ権限があり、`LogsConfig.CloudWatchLogs.Status`のみをAssertionしている。

Recommendation: CodeBuildサービス統合が必要とする最小のログ権限か確認し、不要なら削除する。残す場合は対象Log Groupを限定し、`logs:*`の意図と「標準ログ無効」の関係をADR・Assertionへ明記する。

### [Medium] `docs/diagrams/sql-execution-flow.mmd:8-10,24-31` (修正後ローカルDiff)

Issue: SQL実行フロー図はDispatcher、CodeBuild、承認後自動実行を実装済みのフローとして描いているが、Phase 3 planned / not provisionedの注記がない。

Impact: system-architectureとaws-infrastructureでは未プロビジョニングと明示している一方、SQL実行フローだけを読む第三者はPhase 2で非同期実行が存在すると誤認する。

Evidence: Phase 2 CDKにはEventBridge、Dispatcher Lambda、Outbox処理、CodeBuild起動実装がなく、同図の9行目・28行目は現在のIaC範囲を超える。

Recommendation: 図のタイトルまたは主要ノードに「Phase 3 target / Phase 2 not provisioned」を追加し、現行Phaseと将来論理フローを区別する。

### [Medium] `.github/workflows/ci.yml:11-54` / `docs/release-checklist.md:13-19` (修正後ローカルDiff)

Issue: CIはtest、typecheck、build、secret scan、3環境synth/cdk-nagを実行するが、Mermaid/Python図、README/ADRリンク、図とIaCの整合性を自動検証しない。Red/Green/RefactorとFormat、cdk diffの証拠も未記録である。

Impact: コード変更はCIを通過しても、構成図・リンク・TDD証拠・IaC差分の退行を検出できず、Release Managerが完了条件を再現できない。

Evidence: 修正後ローカルの主要検証は成功したが、Mermaid CLIは未実行、GitHub APIは取得不能で、既存レビュー記録にもRed/Green/Refactorの失敗・成功履歴がない。

Recommendation: 図・リンク検証をCIへ追加するか手動Gateとしてコマンドと結果を記録する。TDDのRed/Green/Refactor、未実行の`cdk diff`、Mermaid CLI制約をPR証跡へ明記する。

## Role decisions

### TDD Test Engineer

修正後ローカルDiffでは、CodeBuildをFail-Closedにする回帰Assertionが追加され、対象テストはGreen。Blocking/Highはなし。ただしprod境界、全権限Action、Lifecycle、生成ログ権限のテストが不足している。

### Quality Engineer

主要コード検証は成功。PNGとMermaid静的検査は確認でき、Phase 3 plannedの注記はsystem/aws図へ反映済み。ただしSQL実行フロー図、CI自動検証、TDD証拠に残存差分がある。Blocking/Highはなし。

### Release Manager

PR HEADは修正前で、修正後コードのCI結果・GitHub上の再レビュー・PR証跡がない。したがってPR #2はマージ不可。ローカル修正後Diffだけを評価した場合はBlocking/High 0件だが、Medium残存と未反映状態を解消してから再判定する。

## Decision

- 修正後ローカルDiff: Blocking 0 / High 0 / Medium 5
- PR #2 (`912624e`): Blocking 1 / High 2 / Medium 5
- PR Gate: `CHANGES_REQUESTED`
- Merge: 実施しない
- Push、AWS変更、DB接続、SQL実行: 実施しない
