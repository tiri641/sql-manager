# UI設計

## 1. 共通方針

- React + TypeScriptで実装する。画面表示はAPIの権限付きDTOだけを使い、S3のURLやSQL本文をlocalStorage、URL、分析ログへ保存しない。
- Cognitoのログイン状態がない場合はログイン画面へ戻す。JWTの有効期限切れはリフレッシュまたは再ログインとし、APIの403を画面だけで握りつぶさない。
- 状態に応じて操作ボタンを表示・無効化するが、APIでも必ず同じ条件を再検証する。
- SQLと実行ログは `<pre>` のテキストノードとして表示し、`dangerouslySetInnerHTML`を使わない。長大なSELECT結果は表示上限、ダウンロード、ページングで制御する。
- 画面には「本番」「状態不明」「ロールバックは完全復旧を保証しない」など、誤操作に直結する警告を常時表示する。

## 2. 画面定義

### 2.1 ログイン画面

| 項目 | 定義 |
| --- | --- |
| 表示 | Cognito Hosted UIまたはCognito UI、環境名、利用規約・機密データ注意 |
| 操作 | ログイン、ログアウト、再認証 |
| 権限 | 未認証のみ |
| API | Cognito認証。業務APIは呼ばない |
| エラー | 認証失敗、セッション期限切れ、利用停止を一般化して表示。内部詳細は出さない |

### 2.2 SQLパッチ一覧画面

| 項目 | 定義 |
| --- | --- |
| 表示 | Patch ID、タイトル、環境、Revision、状態、owner/approver表示名、最終更新、最新Execution概要 |
| 操作 | 新規作成、自分の申請詳細、担当承認待ちの切替、環境・状態・期間フィルタ |
| 権限 | ownerは自分の申請、approverは担当申請。その他は一覧に出さない |
| API | `GET /patches` |
| エラー | GSI遅延は更新ボタンで再取得。403/404は存在推測を避ける |

### 2.3 フォルダアップロード画面

| 項目 | 定義 |
| --- | --- |
| 表示 | 環境、タイトル、承認者候補、選択ファイル名・サイズ・ローカルSHA-256、制限値、PII注意 |
| 操作 | `dry-run.sql`/`execute.sql`/任意`rollback.sql`選択、アップロード開始、キャンセル |
| 権限 | 認証済み。ownerとして新規Patchを作成 |
| API | `POST /patches`、S3 PUT、`POST /upload-completion` |
| エラー | 欠落・余分・サイズ超過・URL期限切れ・checksum不一致・通信失敗。既存Revisionを上書きしない |
| 実装注意 | File System Access APIの相対パスを許可ファイル名へ正規化し、ブラウザ検証は補助に留める |

### 2.4 SQLパッチ詳細画面

| 項目 | 定義 |
| --- | --- |
| 表示 | Patch/Revision、環境、owner、指定承認者、各ファイルのVersionId・SHA-256・サイズ、ドライラン状態、承認状態、警告 |
| 操作 | SQL閲覧、dry-run、Revision作成、承認申請、Execution履歴、Rollback申請 |
| 権限 | owner/指定承認者。BreakGlassは理由入力必須 |
| API | `GET /patches/{id}`、ファイル署名URL、`POST /dry-runs`等 |
| エラー | 状態競合、integrity失敗、権限不足。実行ボタン押下後は二重押下を防止しサーバー状態を再取得 |

### 2.5 ドライラン実行・結果確認画面

| 項目 | 定義 |
| --- | --- |
| 表示 | 実行ID、開始/終了、経過時間、SQL検査警告、INSERT/UPDATE/DELETE件数、SELECT結果、エラー、ROLLBACK確認、ログサイズ・切り詰め有無 |
| 操作 | dry-run開始、結果再取得、ログ表示、Revision作成 |
| 権限 | ownerのみ開始。owner/assigned approverが結果閲覧 |
| API | `POST /dry-runs`、`GET /executions`、`GET /log-url` |
| エラー | `RUNNING`はポーリング、`UNKNOWN`/`ROLLBACK_UNCONFIRMED`は承認申請を無効化し手動確認案内 |

### 2.6 承認申請画面

| 項目 | 定義 |
| --- | --- |
| 表示 | execute/dry-run/rollbackのハッシュ、VersionId、ファイル差分サマリ、dry-run結果、環境、承認者、危険なSQL警告 |
| 操作 | 承認申請、キャンセル、Revision作成 |
| 権限 | owner。成功dry-run・最新Revision・未申請が条件 |
| API | `POST /approval-requests` |
| エラー | dry-run未成功、ファイル差替え、自己承認候補、状態競合は申請不可 |

### 2.7 承認待ち一覧・承認詳細画面

| 項目 | 定義 |
| --- | --- |
| 表示 | 担当環境、Patch/Revision、申請者、ファイルハッシュ、結果、影響・警告、申請日時、過去の却下理由 |
| 操作 | SQL閲覧、ログ閲覧、承認、却下（理由必須） |
| 権限 | 指定承認者で、ownerと異なるユーザーのみ |
| API | `GET /patches`、詳細/署名URL、`POST /approvals/{id}/decision` |
| エラー | 自己承認403、権限剥奪、Revision変更、既決定は操作不可。承認成功後は本実行開始中を表示 |

### 2.8 本実行結果画面

| 項目 | 定義 |
| --- | --- |
| 表示 | Execution ID、Build ID、環境、execute VersionId/SHA-256、実行者、承認者、結果、日時、時間、件数、エラー、Log S3取得状態 |
| 操作 | ログ表示、Rollback申請（rollback.sqlがあり、終端結果のとき） |
| 権限 | owner/assigned approver |
| API | `GET /executions`、`GET /log-url` |
| エラー | `UNKNOWN`は赤色警告とし自動再実行ボタンを出さない。手動確認Runbookへのリンク |

### 2.9 ロールバック申請・承認画面

| 項目 | 定義 |
| --- | --- |
| 表示 | 元の本実行、rollback VersionId/SHA-256、復元保証なしの警告、バックアップ/PITR案内 |
| 操作 | ownerの申請、approverの承認/却下、理由入力 |
| 権限 | 申請はowner、決定は指定承認者。自己承認禁止 |
| API | `POST /rollback-requests`、`POST /rollback-approvals/{id}/decision` |
| エラー | rollback.sqlなし、既に実行中、状態不明、別Revision、権限不一致は拒否 |

### 2.10 実行履歴・ログ閲覧画面

| 項目 | 定義 |
| --- | --- |
| 表示 | 実行種別、状態、ID、時刻、時間、Build ID、結果、ログサイズ、切り詰め、保存失敗、監査イベント概要 |
| 操作 | 種別・状態・期間フィルタ、ログ取得、テキスト検索（取得後のブラウザ内検索のみ） |
| 権限 | owner/assigned approver/監査権限。監査権限はSQL本文の閲覧可否を別設定 |
| API | `GET /executions`、`GET /log-url`、`GET /audit` |
| エラー | ログURL期限切れは再認可後に再発行。404相当は存在推測を避ける |

## 3. フロントエンドの状態管理

- サーバー状態はAPIレスポンスを正とし、実行中は短い間隔のポーリングで再取得する。リアルタイムWebSocketは初回リリースに含めない。
- Mutation成功後に画面だけを楽観更新せず、Patch詳細とExecutionを再取得する。
- ブラウザメモリに保持したSQL本文は画面遷移・ログアウトで破棄する。Persistent storageへ保存しない。
- 署名URLは`<a href>`へ固定的に保存せず、クリック時に発行・取得し、ダウンロードAuditを残す。

