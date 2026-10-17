# PR #2 Phase 2 独立エージェントレビュー

- PR: [#2 `[Phase 2] AWS基盤CDK実装・検証`](https://github.com/tiri641/sql-manager/pull/2)
- 対象: `main` (`943ff5d`) -> `phase/2-infra-cdk`
- 初回レビュー時点: `912624e`
- レビュー日: 2026-10-17
- 初回判定: `CHANGES_REQUESTED`
- 実装者の結論を事前に伝えず、以下の独立エージェントへ同じ最終Diffを渡した。
  - Security / Infrastructure / Platform
  - Tech Lead / Code Reviewer / Database / SRE
  - TDD / Quality / Release Manager

## 初回指摘

### [High] CodeBuild標準ログ・成果物と機密Log S3の結合

- `infra/cdk/src/stacks/execution-stack.ts`
- CodeBuild標準S3ログと成果物保存先にLog S3を指定していた。
- CodeBuildロールにLog S3のPut/Delete等が生成され、標準出力に機密結果が混入した場合の漏えい・ログ改ざん余地があった。

### [High] CodeBuild実行ロールのデータプレーン権限過多

- `infra/cdk/src/stacks/execution-stack.ts`
- SQLバケット全体Read、DynamoDB単一テーブル全体への書込み、Secret/KMS/Log S3権限がPhase 2のFail-Closedプレースホルダーに付与されていた。
- 他PatchのSQL取得、Approval/Audit改ざん、ログ削除につながる可能性があった。

### [High] `AwsSolutions-IAM5`の一括抑制

- `infra/cdk/src/stacks/execution-stack.ts`
- `/.*/`による一括抑制で、将来の過剰権限をcdk-nagが検出できなかった。

### [Medium] Phase 2境界・テスト・運用整合性

- 外部test/prod RDSの接続方式は未確定。Phase 3開始前のGateとして残す。
- DNS CIDRがハードコードされていた。
- 実行ログの現行Versionと不完全Multipart UploadのLifecycleが不足していた。
- Budgetは通知なしの予算定義であり、運用文書の記載が実装範囲を超えていた。
- EventBridge/DispatcherがPhase 2でプロビジョニング済みに見える図だった。
- Secretスキャン対象が限定的だった。
- GitHub ActionsのAction参照は可変タグ。社内導入前のサプライチェーン対策として残す。

## 修正内容

- CodeBuildを`NO_SOURCE`、`NO_ARTIFACTS`、Fail-Closed BuildSpecへ変更。
- CloudWatch LogsとCodeBuild標準S3ログを無効化。
- Phase 2のCodeBuildロールからSQL/Log S3、DynamoDB、Secrets Manager、KMSのデータプレーン権限を削除。
- CodeBuildのVPC/service integrationに必要なIAMワイルドカードだけを明示的な`appliesTo`で抑制。
- cdk-nag抑制をCognito Essentials、DynamoDB PITR無効、VPC Flow Logs無効、SSE-S3の場合に限定。
- DNS許可を`EnvironmentConfig.vpcCidr`から生成し、TCP 53フォールバックを追加。
- Log S3の現行Version期限と全S3バケットの不完全Multipart Upload期限を追加。
- SecretスキャンをCDKの全`src`/`test`、アプリ、GitHub Actions、設定ファイルへ拡張。
- EventBridge/Dispatcherを図上で`Phase 3 planned / not provisioned`と明示。
- Budget通知・Cost Anomaly Detection・Cost Allocation Tagはdeploy前Gateで設定する旨に文書を修正。
- 判断を[ADR-0007](../adr/0007-phase2-codebuild-fail-closed-boundary.md)へ記録。

## 修正後の検証

- `npm test`: 成功
- `npm run typecheck`: 成功
- `npm run lint`: 成功
- `npm run build`: 成功
- `npm run security:scan`: 成功
- dev/test/prod `cdk synth`: 成功
- dev/test/prod `cdk synth --context runNag=true`: 成功。ERROR/WARNINGなし、根拠付きINFOのみ
- Mermaid静的検査: 成功
- `python3 -m ast docs/diagrams/aws-infrastructure.py`: 成功
- diagrams + GraphvizによるPNG再生成: 成功、`3137x4786 RGBA`
- CodeBuild生成テンプレートにSQL/Log S3、DynamoDB、Secrets Managerのデータプレーン権限がないことを確認
- `git diff --check`: 成功

## 再レビュー

修正後の同一影響範囲エージェントレビューを実施し、Blocking/Highが0件であることを確認してから、判定を`PR_ALLOWED`へ更新する。外部RDS接続方式、Budget通知先、Action SHA固定、devリソースの削除・保持方針はPhase 3/deploy前の残存リスクとして記録する。
