# ADR-0002: OutboxとCodeBuild側実行ガードで二重実行を防ぐ

- Status: Accepted
- Date: 2026-10-17
- Owners: SQL Patch Manager
- Reviewers: Tech Lead / Security / Database / SRE / Platform

## Context

DynamoDBの状態更新、EventBridge配送、CodeBuildのStartBuildは単一トランザクションではない。イベント重複、Lambdaのクラッシュ、StartBuild応答不明が起きると、単一の「実行開始APIを1回呼ぶ」だけでは、起動漏れとSQL二重実行を区別できない。

## Decision

実行申請時にExecution、Patch状態、Audit、OutboxをDynamoDBのTransactWriteItemsで記録する。DispatcherはOutboxを条件付きリースしてCodeBuildを起動し、StartBuildのidempotency tokenを使う。さらにCodeBuildがSQL開始前に、Execution IDとattempt IDをDynamoDBの実行ガードへ条件付き登録する。ガード取得に失敗したBuildはDBへ接続せず終了する。

状態が不明な場合は、自動再実行せず、CodeBuild、Log S3、DB実行台帳、RDS監査を照合して手動確認する。

## Consequences

- 起動漏れ、イベント重複、外部API応答不明、SQL二重実行を別々に扱える。
- CodeBuild実行ロールに実行ガードの最小DynamoDB権限が必要。
- Reconciler、リース期限、手動Runbook、DB側の実行相関IDを維持する必要がある。
- ガードのTTLやリース期限切れで実行中処理を再利用しないよう、状態と時刻を慎重に設計する。

## Validation

重複イベント、Dispatcherクラッシュ、StartBuild応答不明、CodeBuild二重起動、DB結果不明、ログ保存失敗をテストする。

