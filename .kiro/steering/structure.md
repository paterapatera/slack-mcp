# Structure Steering

## プロジェクト構造

```
slack-mcp/
├── src/
│   ├── index.ts                 # エントリーポイント
│   └── services/                # サービス層
│       ├── mcp-server.ts        # MCP サーバー実装
│       ├── slack-api-client.ts  # Slack API クライアント
│       ├── search-service.ts    # 検索サービス
│       ├── config-service.ts    # 設定管理
│       ├── logging-service.ts   # ログ記録
│       ├── metrics-service.ts   # メトリクス集計
│       ├── slack-client-adapter.ts  # Slack クライアント抽象化/適応
│       └── __tests__/           # テストファイル
├── dist/                        # ビルド出力
└── scripts/                     # ユーティリティスクリプト
```

## アーキテクチャパターン

### サービス指向アーキテクチャ

各機能は独立したサービスクラスとして実装：

- **McpServer**: MCP プロトコルの実装とツール登録
- **SlackAPIClient**: Slack Web API との通信とレート制限処理
- **SearchService**: メッセージ検索のビジネスロジック
- **ConfigService**: 環境変数の読み込みと検証（静的メソッド）
- **LoggingService**: ログ記録と統計情報の管理

### 依存関係の注入

サービス間の依存関係はコンストラクタで注入：

```typescript
// 例: SearchService は SlackAPIClient と LoggingService に依存
constructor(
  private slackClient: SlackAPIClient,
  private loggingService?: LoggingService
)
```

## 命名規則

### ファイル名

- **ケバブケース**: `mcp-server.ts`, `slack-api-client.ts`
- **テストファイル**: `*.test.ts` サフィックス
- **統合テスト**: `integration/` サブディレクトリに配置

### クラス名

- **PascalCase**: `McpServer`, `SlackAPIClient`, `SearchService`
- **サービスサフィックス**: サービスクラスは `*Service` または `*Client` で終わる

### インターフェースと型

- **PascalCase**: `Config`, `SearchOptions`, `SearchResult`
- **エクスポート**: 型定義はファイルの先頭でエクスポート

## インポートパターン

### モジュール解決

- **拡張子の扱い**: 開発ソースでは拡張子を省略してインポートします（例: `import { McpServer } from './services/mcp-server'`）。ただし、エントリーポイントや実行時のバイナリ（`src/index.ts` やビルド後の `dist/` 実行ファイル）では Bun の実行要件のため `.js` を明示することがあります（例: `import { McpServer } from './services/mcp-server.js'`）。この例外はプロジェクト方針として許容されます。
- **相対パス**: 同じディレクトリ内は `./` を使用
- **外部パッケージ**: パッケージ名のみ（例: `@modelcontextprotocol/sdk`）

### インポート順序

1. 外部パッケージ（`@modelcontextprotocol/sdk`, `@slack/bolt`, `zod`）
2. 内部サービス（`./services/*`）
3. 型定義（必要に応じて）

## エントリーポイント

### `src/index.ts`

- **役割**: MCP サーバーの起動とエラーハンドリング
- **パターン**: `main()` 関数を定義し、起動時エラーをキャッチ
- **エラー処理**: 起動失敗時は `process.exit(1)` で終了

## テスト構造

### ディレクトリ配置

- **ユニットテスト**: `services/__tests__/*.test.ts`
- **統合テスト**: `services/__tests__/integration/*.test.ts`

### テスト命名

- **ファイル名**: 対象ファイル名に `.test.ts` を付与
  - `mcp-server.ts` → `mcp-server.test.ts`
- **テストケース**: `describe` と `it` を使用

## ビルド出力

- **出力先**: `dist/` ディレクトリ
- **エントリーポイント**: `dist/index.js`
- **ソースマップ**: TypeScript の `declarationMap` を有効化

## 設定ファイル

- **TypeScript**: `tsconfig.json` で厳格な型チェックを設定
- **パッケージ**: `package.json` で Bun を指定（`engines.bun`）
- **ビルドスクリプト**: `bun build` を使用
