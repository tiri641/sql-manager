# ADR-0008: EventBridgeのScheduler責務と非同期配送境界

- Status: Accepted
- Date: 2026-10-17
- Owners: SQL Patch Manager
- Reviewers: Loop Coordinator / Tech Lead / Infrastructure / Database / SRE / Platform / Quality
- Amends: [ADR-0002](0002-outbox-and-execution-guard.md)

## Context

Phase 2ではEventBridge、Dispatcher、SQSのいずれも実装していない。一方、既存の論理設計に「EventBridge publish」「Scheduler / retry rule」「Outbox配送」が混在し、EventBridgeが耐久キューまたはSQL実行の自動リトライとして誤認される余地があった。

## Decision

- DynamoDB Outboxを配送の正とし、`PENDING`、リース、`DISPATCH_UNKNOWN`を状態機械で管理する。
- EventBridgeはPhase 3で採用する場合も、Dispatcher/Reconcilerの定期確認・起動漏れ検知を担うSchedulerとして扱う。EventBridge自体を耐久キューやSQL実行の再試行機構とは扱わない。
- `UNKNOWN`、`DISPATCH_UNKNOWN`、タイムアウトのSQL実行を自動再実行しない。再実行には状態確認、新しい申請、承認、新しいExecution IDを要求する。
- 実行コマンドの耐久配送にSQS Standard + DLQを採用するか、Dispatcherが直接CodeBuildを起動するかはPhase 3のPlan Review Gateで決定する。Phase 2ではどちらもリソースを作成しない。

## Consequences

- 図・RunbookではEventBridgeを「定期確認・起動漏れ検知」と表記し、キュー・自動SQL再実行と表記しない。
- Phase 3では、Outboxの状態整合性、キューの重複配信、DLQ、Dispatcherの冪等性、状態不明時の手動確認を一体で設計する必要がある。
- SQSを採用しない場合でも、Outboxと条件付き更新による重複防止を省略できない。

## Revisit / rollback conditions

- Phase 3のPlan Review Gateで、実行回数、復旧時間、コスト、運用者負荷を比較して配送方式を決定する。
- EventBridgeを直接CodeBuild起動や自動リトライに使う判断へ変更する場合は、新しいADRでAmendする。
