# API設計

## 1. 共通仕様

- Base URL: `https://<api-domain>/<stage>`。API Gateway HTTP APIまたはREST APIはWAF・使用量制限・必要な認証機能を比較してPhase 2で確定する。初期案はJWT Authorizerを使うHTTP APIを優先する。
- `Authorization: Bearer <Cognito JWT>` を必須とする。
- `X-Request-Id` はクライアント入力をそのまま信頼せず、API側で正規化したrequestIdを応答・監査へ記録する。
- 状態を変えるAPIは `Idempotency-Key` を必須または推奨とし、DynamoDBへリクエストハッシュと結果参照を短期保存する。
- SQL本文をJSON body、query string、APIログ、エラー応答へ含めない。
- エラーは `{ code, message, requestId, retryable }` の形式とし、内部例外・SQL本文・Secret・接続情報を返さない。

## 2. エンドポイント

| Method / Path | 用途 | 権限 | 主な検証・結果 |
| --- | --- | --- | --- |
| `POST /patches` | Patch/Revision初期化 | 認証済み | ownerSubはJWTから設定。environment、title、承認者候補を検証し、PUT URLを返す |
| `POST /patches/{patchId}/revisions` | SQL修正の新Revision作成 | owner | 旧承認・ドライランを無効化。新しい固定S3キーとPUT URLを返す |
| `POST /patches/{patchId}/upload-completion` | アップロード完了 | owner | S3 HeadObject、VersionId、SHA-256、サイズ、Content-Type、許可構成を再検証 |
| `GET /patches` | 一覧 | ownerまたは承認者 | GSI検索後に認可フィルタ。SQL本文は返さない |
| `GET /patches/{patchId}` | 詳細 | owner/assigned approver/BreakGlass | Fileのハッシュ・状態・承認者・Execution履歴の要約を返す |
| `GET /patches/{patchId}/files/{type}/download-url` | SQL閲覧URL | owner/assigned approver/BreakGlass | 直前に権限確認し、短期GET URLを発行。Auditを記録 |
| `POST /patches/{patchId}/dry-runs` | ドライラン申請 | owner | UPLOAD_VERIFIEDかつ未実行・同時実行なしを条件付き作成 |
| `GET /patches/{patchId}/executions` | 実行履歴 | owner/assigned approver | Executionメタデータのみ。ログ本文は別API |
| `GET /patches/{patchId}/executions/{executionId}/log-url` | 結果ログURL | owner/assigned approver/BreakGlass | 終端状態・認可・S3キーを確認して短期URL発行 |
| `POST /patches/{patchId}/approval-requests` | 本実行承認申請 | owner | dry-run成功、Revision一致、別担当承認者、未申請を条件付き確認 |
| `POST /patches/{patchId}/approvals/{approvalId}/decision` | 承認・却下 | assigned approver | approverSub一致、申請者と異なる、未決定、Revision一致を確認 |
| `POST /patches/{patchId}/rollback-requests` | ロールバック申請 | owner | 本実行完了、rollback.sql有り、未処理のRollbackなしを確認 |
| `POST /patches/{patchId}/rollback-approvals/{approvalId}/decision` | ロールバック承認・却下 | assigned approver | 本実行と同じ分離・条件付き更新 |
| `GET /audit` | 監査検索 | 管理・監査ロール | Patch、actor、期間、actionで検索。本文は返さない |
| `GET /health` | 稼働確認 | 内部監視 | DB・S3本文・Secretを読まず、依存状態の要約だけ返す |

`POST /patches` のbody例（SQL本文なし）:

```json
{
  "environment": "dev",
  "title": "顧客テストデータの補正",
  "approverSub": "cognito-sub-of-approver",
  "files": [
    {"type": "dry-run", "sizeBytes": 1234, "sha256": "client-calculated-hex"},
    {"type": "execute", "sizeBytes": 1300, "sha256": "client-calculated-hex"},
    {"type": "rollback", "sizeBytes": 700, "sha256": "client-calculated-hex"}
  ]
}
```

クライアントのsha256はアップロード予定値として使うだけで、信頼の根拠はS3の検証済みチェックサムと完了APIの再検証である。URLはファイルごとに固定キー・短いTTL・署名付きContent-Length/Checksumで発行する。

## 3. 状態別API制御

| 状態 | 許可操作 | 拒否する操作 |
| --- | --- | --- |
| `UPLOADING` | アップロード完了、キャンセル | dry-run、承認、実行 |
| `UPLOAD_VERIFIED` / `DRY_RUN_REQUIRED` | dry-run | 承認、execute、rollback |
| `DRY_RUN_RUNNING` | 実行履歴・状態確認 | 追加dry-run、承認、修正 |
| `DRY_RUN_SUCCEEDED` | 承認申請、Revision作成 | 本実行の直接呼出し |
| `DRY_RUN_FAILED`/`UNKNOWN`/`ROLLBACK_UNCONFIRMED` | 新Revision作成、履歴閲覧 | 承認申請、本実行 |
| `APPROVAL_PENDING` | 承認者の承認/却下、閲覧 | 申請者の承認、ファイル差替え |
| `APPROVED`/`EXECUTION_QUEUED`/`EXECUTION_RUNNING` | 履歴・状態確認 | 同一操作の再申請、Revision差替え |
| `EXECUTION_SUCCEEDED` | rollback.sqlがあればRollback申請 | executeの再実行API（新しい明示申請へ） |
| `EXECUTION_UNKNOWN` | 手動確認・復旧手順 | 自動再実行 |
| `ROLLBACK_REQUESTED` / `ROLLBACK_APPROVAL_PENDING` | 承認者の承認/却下、閲覧 | 本実行の再実行、別RevisionのRollback |
| `ROLLBACK_APPROVED` / `ROLLBACK_QUEUED` / `ROLLBACK_RUNNING` | 履歴・状態確認 | 同一Rollbackの再申請・自動再実行 |
| `ROLLBACK_SUCCEEDED` / `ROLLBACK_FAILED` / `ROLLBACK_UNKNOWN` | 履歴閲覧、手動復旧案内 | 証拠なしの再実行 |

## 4. HTTP応答と代表エラー

| HTTP | code | 意味 |
| --- | --- | --- |
| 400 | `INVALID_FILE_SET` | ファイル名・個数・拡張子・サイズ不正 |
| 401 | `UNAUTHENTICATED` | JWT不正・期限切れ |
| 403 | `FORBIDDEN` / `SELF_APPROVAL_FORBIDDEN` | 担当外、権限不足、自己承認 |
| 404 | `NOT_FOUND` | 存在を推測されにくい共通応答 |
| 409 | `STATE_CONFLICT` / `DUPLICATE_OPERATION` | 状態遷移競合・同時実行 |
| 409 | `INTEGRITY_FAILED` | VersionId・SHA-256・サイズ不一致 |
| 422 | `DRY_RUN_GATE_FAILED` | 承認条件を満たさない |
| 429 | `RATE_LIMITED` | API・署名URL発行・実行要求の過剰 |
| 500/503 | `INTERNAL_RETRYABLE` | 利用者へ内部詳細を出さない。状態変更済みかはrequestIdで調査 |

## 5. APIイベント

EventBridgeへ送るイベントは本文を含まない。

```json
{
  "source": "sql-patch-manager",
  "detail-type": "SqlPatchExecutionRequested",
  "detail": {
    "eventId": "evt_01...",
    "executionId": "exec_01...",
    "patchId": "patch_01...",
    "revisionNo": 2,
    "environment": "dev",
    "operation": "DRY_RUN",
    "expectedFileSha256": "server-recorded-sha256",
    "createdAt": "2026-10-17T00:00:00Z"
  }
}
```

Outboxを正とし、初期案ではEventBridge Scheduler/RuleがDispatcherを定期起動する。将来EventBridgeイベントを併用する場合も、配送失敗は再配送可能にし、同じイベントが複数回届いてもDispatcherの条件付きリースとExecutionガードでSQLを二重実行しない。
