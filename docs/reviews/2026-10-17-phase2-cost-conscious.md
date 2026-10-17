# Phase 2 低コスト環境プロファイル レビュー

## Metadata

- 対象Phase: Phase 2
- 対象: 個人開発向けCDK設定、テスト、設計書、ADR、構成図、status
- レビュー日時: 2026-10-17
- 外部副作用: AWS deploy、AWS API操作、DB接続、SQL実行、Push、PR作成はなし
- 判定: `PR_ALLOWED`

## Review scope

- dev/test/prod相当の固定費削減と環境境界
- 1 AZ、NAT/IGWなし、VPC Endpoint、RDS所有境界
- SSE-S3、Cognito Essentials、PITR/Flow Logs無効化の安全条件
- CodeBuildのサイズ、同時実行、再試行、ログ経路
- CDK Assertions、synth、cdk-nag、図と設計書の整合性

## Role review

### Loop Coordinator / Tech Lead

- 判定: Pass
- 根拠: 本番想定の承認分離、状態遷移、環境別実行ガードを変更せず、コスト設定だけを`EnvironmentConfig`へ切り出している。
- 条件: 個人開発用既定値を社内導入の本番基準へ流用しないこと。

### Security Engineer

- 判定: Pass with conditions
- 根拠: S3非公開、Versioning、署名URL、API認可、MFA、JWT検証、自己承認禁止、環境別IAMは維持されている。
- Medium: SSE-S3、Cognito Essentials、PITR/Flow Logsなしはダミーデータ限定。実データ前にSSE-KMS、Threat Protection、PITR、Flow Logsを有効化し再レビューする。

### Infrastructure Engineer

- 判定: Pass
- 根拠: 全環境1 AZ、NAT/IGWなし、S3/DynamoDB Gateway Endpoint、Secrets Manager Interface Endpoint 1 AZで、devのみ低コストRDSを作成する設定になっている。test/prodはRDSを作成せず外部Secret参照境界のみである。
- Medium: 外部test/prod DBへのネットワーク接続はPhase 2で構築・検証しない。接続方式をPhase 3 deploy前に確定する。

### Database / PostgreSQL Engineer

- 判定: Pass
- 根拠: devのダミーRDSは非公開、Single-AZ、最小インスタンスとし、test/prodの実DBを作成しない。SQL実行・DB接続はPhase 2の対象外である。

### SRE

- 判定: Pass with conditions
- Medium: PITR/Flow Logsを無効化するため、復旧・監査能力は学習環境相当である。RDS停止/削除、Budget監視、社内導入前の復旧テストを運用条件とする。

### Platform Engineer

- 判定: Pass
- 根拠: 既存のworkspace scripts、CDK synth、CI、lockfileを変更せず、環境差分を設定として再現可能にしている。

### Quality Engineer / TDD Test Engineer

- 判定: Pass
- 根拠: 1 AZ、暗号化方式、Cognito tier、PITR、Budget、RDS所有境界をテストで固定し、全環境synthとcdk-nagを実行した。

### Code Reviewer / Release Manager

- 判定: Pass after re-review
- 根拠: upstreamのPhase 1 `main`とWorkspaceの最終Diffを取得し、Phase 2の変更範囲、機密値混入、検証証跡を確認した。CIの全環境検証と、外部RDSをVPC内リソースに誤認させない図の修正も確認した。

## Findings

### [Medium] infra/cdk/src/stacks/database-stack.ts:73

Issue: 外部test/prod DB接続経路は未確定。

Impact: 現時点でtest/prodへデプロイしても、DB実行経路は完成しない。ただし意図的なPhase境界であり、誤って本番DBへ接続するリスクを抑える。

Evidence: `DatabaseStack`は`Secret.fromSecretNameV2`のみを使用し、AWS API/DB接続は未実行。

Recommendation: Phase 3 deploy前に、別アカウントAssumeRole、VPC Peering/TGW、PrivateLink、または同一VPCのいずれかを選定し、接続テストを別承認する。

### [Medium] infra/cdk/src/config.ts:35

Issue: 個人開発用の可用性・監査機能を意図的に削減。

Impact: 社内導入・実データ利用の可用性、復旧、監査、脅威検知基準を満たさない。

Evidence: [ADR-0006](../adr/0006-cost-conscious-learning-profile.md)に適用範囲と再承認条件を記録済み。

Recommendation: 実データ・社外公開・本番DB接続のいずれかの前に、本番強化設定へ切り替え、再度Security/SRE/Infrastructureレビューを行う。

## Verification evidence

- `npm test`: 成功
- `npm run typecheck`: 成功
- `npm run lint`: 成功
- `npm run build`: 成功
- `npm run security:scan`: 成功
- `npx cdk synth --context environment=<dev|test|prod>`: 3環境で成功
- `npx cdk synth --context environment=<dev|test|prod> --context runNag=true`: 3環境で成功、警告なし
- Python AST検査、Mermaid静的検査、構成図PNG再生成・目視確認: 成功
- `git diff --check`: Gitメタデータ欠落のため未実行。成功とは扱わない
- `git diff --cached --check`: 成功
- `cdk deploy`、`cdk bootstrap`、AWS API、RDS、SQL: 未実行

## Final diff re-review

- 再レビュー日時: 2026-10-17
- 対象ブランチ: `phase/2-infra-cdk`
- 比較元: upstream `main` (`943ff5d`)
- 修正済み指摘:
  - [Medium] `.github/workflows/ci.yml:15`: devだけだったCDK synth/cdk-nagをdev/test/prodマトリクスへ変更。
  - [Medium] `docs/diagrams/aws-infrastructure.py:94`: 外部管理のtest/prod RDSをVPC内リソースに見せないよう、VPC外の別管理リソースと接続方式未確定として修正。
- Blocking: 0
- High: 0
- Medium: 2（外部DB接続方式、本番強化未適用。Phase 3/deploy前Gateへ記録済み）
- Code Reviewer: Pass
- Release Manager: Pass
- Loop Coordinator: 確認済み

## Gate decision

- Blocking: 0
- High: 0
- Medium: 2（Phase 3/deploy前Gateへ引き継ぎ）
- 最終判定: `PR_ALLOWED`
