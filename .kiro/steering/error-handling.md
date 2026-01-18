# Error Handling Steering

## 統一エラーハンドリング戦略

このプロジェクトは、すべてのエラーを一貫して処理する統一エラーハンドリング戦略を採用しています。`LoggingService` を中心としたエラー分類とログ記録により、デバッグと運用を容易にします。

## エラー分類

### カスタムエラー型

- **ConfigError**: 環境変数の不足や無効な設定値
  - `missingVars` プロパティで不足している変数を明示
  - 起動時に検出され、サーバー起動を中止

### エラーカテゴリ

1. **認証エラー**: リトライ不可、即座にエラーを throw
   - `invalid_auth`, `invalid_token`, `account_inactive`, `token_revoked`
   - `LoggingService.logAuthenticationError()` で記録

2. **接続エラー**: リトライ可能（指数バックオフ）
   - ネットワークタイムアウト、接続失敗
   - `LoggingService.logAPIError()` で記録

3. **レート制限エラー**: リトライ可能（指数バックオフ）
   - Slack API の `ratelimited` エラー、HTTP 429
   - `LoggingService.logRateLimitError()` で記録

4. **ビジネスロジックエラー**: リトライ不可
   - 無効なチャンネルID、空のクエリなど
   - `LoggingService.logError()` で記録

## エラーログ記録パターン

### LoggingService の役割

すべてのエラーは `LoggingService` を経由してログに記録されます：

```typescript
// 一般的なエラー
loggingService.logError(error, 'コンテキスト情報')

// 認証エラー
loggingService.logAuthenticationError(error, 'Slack API 認証')

// API エラー
loggingService.logAPIError(error, 'Slack API 接続')

// レート制限エラー
loggingService.logRateLimitError(error, 'Slack API 呼び出し', retryAttempt)
```

### ログ出力の原則

- **stderr に出力**: MCP サーバーは stdout に JSON-RPC メッセージのみを出力
- **機密情報を除外**: トークン、認証情報はログに含めない
- **コンテキスト情報を含める**: エラーが発生した場所と状況を明示
- **スタックトレース**: `Error` オブジェクトの場合はスタックトレースを記録

## リトライ戦略

### 指数バックオフ

接続エラーとレート制限エラーに対して、指数バックオフによるリトライを実装：

- **最大リトライ回数**: 3回（`maxRetries = 3`）
- **ベース遅延**: 1秒（`baseDelayMs = 1000`）
- **リトライ条件**: 接続エラー、レート制限エラーのみ
- **リトライ不可**: 認証エラー、ビジネスロジックエラー

### リトライパターン

```typescript
// 認証エラー: リトライせず即座に throw
if (isAuthError(error)) {
  throw authError
}

// 接続エラー: リトライ可能
if (isConnectionError(error) && attempt < maxRetries) {
  await waitWithExponentialBackoff(attempt)
  continue
}
```

## エラー伝播

### 起動時エラー

`McpServer.start()` で起動時エラーをキャッチ：

- `ConfigError`: そのまま throw（環境変数エラー）
- `Error`: そのまま throw（Slack API 初期化エラーなど）
- 予期しないエラー: `Error` にラップして throw

### リクエスト時エラー

MCP ツールハンドラー内でエラーをキャッチ：

- `LoggingService.logError()` でログ記録
- エラーを再スローして、MCP SDK が適切なエラーレスポンス（-32603 Internal error）を返す

- **Adapter のエラー伝播**: `SlackBoltAdapter` の呼び出しで発生したエラーは基本的にそのまま上位に伝播し、`LoggingService.logAPIError()` や `logError()` で記録される。Adapter は基本的にエラーを吸収しない設計で、呼び出し元が適切に対処・リトライ判断を行う。

- **メトリクス記録**: 検索リクエストの失敗は `MetricsService.recordFailure()`、成功は `recordSuccess()` を呼び出して集計する。メトリクスは監視や SLA 検証に利用するため、失敗時の記録漏れが無いようにハンドラーで確実に呼び出すことを推奨する。

## エラーメッセージの形式

### 日本語メッセージ

すべてのエラーメッセージは日本語で記述：

```typescript
;`エラー: Slack API の認証に失敗しました。\nトークンが有効で、必要なスコープが付与されていることを確認してください。\nエラー詳細: ${error.message}`
```

### メッセージ構造

1. **エラー種別**: 「エラー:」で始まる
2. **説明**: 何が問題かを説明
3. **対処方法**: ユーザーが取るべきアクション
4. **詳細情報**: 元のエラーメッセージ（該当する場合）

## 統計情報

`LoggingService` は検索リクエストの統計情報を管理：

- `totalRequests`: 総リクエスト数
- `successfulRequests`: 成功リクエスト数
- `failedRequests`: 失敗リクエスト数
- `successRate`: 成功率（%）

統計情報は `getSearchRequestStats()` で取得可能。
