# Testing Steering

## テスト戦略

このプロジェクトは **TDD (Test-Driven Development)** アプローチを採用し、Bun テストフレームワークを使用してテストを実行します。

## テスト組織

### ディレクトリ構造

```
src/services/
├── __tests__/
│   ├── *.test.ts              # ユニットテスト
│   └── integration/
│       ├── *.test.ts          # 統合テスト
│       └── mcp-inspector-e2e.test.ts  # E2E テスト（手動）
```

### テストの分類

1. **ユニットテスト**: 各サービスの単体機能をテスト
   - `config-service.test.ts`
   - `slack-api-client.test.ts`
   - `search-service.test.ts`
   - `mcp-server.test.ts`
   - `logging-service.test.ts`
   - `metrics-service.test.ts` # 成功/失敗の記録と成功率計算の検証
   - `slack-client-adapter.test.ts` # アダプタが underlying client に正しく委譲することを検証

2. **統合テスト**: 複数のサービスを組み合わせた動作をテスト
   - `integration/startup-flow.test.ts`: 起動フロー
   - `integration/search-flow.test.ts`: 検索フロー
   - `integration/error-handling.test.ts`: エラーハンドリング
   - `integration/performance.test.ts`: パフォーマンス

3. **E2E テスト**: MCP Inspector を使用した手動テスト
   - `integration/mcp-inspector-e2e.test.ts`: 手順を文書化

## テスト命名規則

### ファイル名

- **パターン**: `{service-name}.test.ts`
- **例**: `mcp-server.ts` → `mcp-server.test.ts`

### テストスイートとケース

```typescript
describe('サービス名', () => {
  describe('機能グループ', () => {
    it('期待される動作を説明する', () => {
      // テストコード
    })
  })
})
```

## テストパターン

### 環境変数の管理

テストごとに環境変数をリセット：

```typescript
const originalEnv = process.env

beforeEach(() => {
  process.env = { ...originalEnv }
  // テスト用の環境変数を設定
})

afterEach(() => {
  process.env = originalEnv
})
```

### 非同期処理のテスト

`async/await` と `expect().rejects.toThrow()` を使用：

```typescript
it('エラー時に適切なエラーを throw する', async () => {
  await expect(service.method()).rejects.toThrow(/エラーメッセージ/)
})
```

### サービスの初期化

各テストで必要なサービスを初期化：

```typescript
beforeEach(() => {
  loggingService = new LoggingService()
  slackClient = new SlackAPIClient(loggingService)
  searchService = new SearchService(slackClient, loggingService)
})
```

## テスト実行

### コマンド

```bash
# すべてのテストを実行
bun test

# ウォッチモード（開発時）
bun test --watch
```

### テストカバレッジ

- 全80テストが実行される
- 主要サービスのカバレッジを含む
- 統合テストでエンドツーエンドの動作を確認

## E2E テスト（MCP Inspector）

### 手動テスト手順

MCP Inspector を使用した E2E テストは手動で実行：

1. 環境変数を設定
2. サーバーをビルド（`bun run build`）
3. MCP Inspector でサーバーを起動
4. UI でツールの登録を確認
5. 検索リクエストを実行
6. 検索結果とエラーハンドリングを確認

詳細は `mcp-inspector-e2e.test.ts` に文書化されています。

## テストの原則

### テスト対象

- **動作をテスト**: 実装の詳細ではなく、期待される動作をテスト
- **エッジケース**: エラー条件、境界値、異常系をカバー
- **統合フロー**: サービス間の連携を統合テストで確認

### モックとスタブ

- **外部 API**: Slack API の実際の呼び出しは統合テストで行う
- **環境変数**: テストごとに環境変数をリセットして制御
- **サービス依存**: 依存関係の注入により、テスト時にモック可能

### テストの独立性

- 各テストは独立して実行可能
- テスト間で状態を共有しない
- `beforeEach` と `afterEach` でクリーンアップ

## テストデータ

### テストトークン

テスト用のトークン形式：

```typescript
'xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx'
```

### テストチャンネルID

```typescript
'C1234567890'
'C0987654321'
```

実際の API 呼び出しは統合テストで行い、ユニットテストではインターフェースの整合性を確認します。
