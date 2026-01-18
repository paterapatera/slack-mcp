# Technology Steering

## ランタイムとビルドツール

- **Bun**: ランタイムとパッケージマネージャー（v1.2.21 以降）
  - Node.js の代替として使用
  - ビルドコマンド: `bun build`
  - テスト実行: `bun test`
  - `bun link` によるローカル開発環境での利用を想定

## 言語と型システム

- **TypeScript**: 厳格な型チェック設定
  - `strict: true` を有効化
  - `noUncheckedIndexedAccess: true` で安全性を向上
  - `noImplicitOverride: true` でオーバーライドを明示
  - CommonJS モジュール形式（`module: "CommonJS"`）

## 主要依存関係

- **@modelcontextprotocol/sdk**: MCP プロトコル実装
  - `McpServer`, `StdioServerTransport` を使用
  - stdio ベースの通信
- **@slack/bolt**: Slack Web API クライアント
  - `App` クラスを使用（認証と API 呼び出し）
- **zod**: スキーマ検証
  - MCP ツールの入力スキーマ定義に使用

- **内部サービス**: このリポジトリ内で提供される補助的なサービス
  - `MetricsService`: 検索リクエストの統計（総リクエスト、成功/失敗、成功率）を集計・提供
  - `SlackBoltAdapter`: `SlackAPIClient` をラップして `ISlackClient` インターフェースを提供し、テストや複数クライアント実装の切替を容易にする

## 開発規約

### テスト戦略

- **TDD (Test-Driven Development)**: テスト駆動開発アプローチ
- **Bun テストフレームワーク**: `bun:test` を使用
- **テスト構造**: `__tests__/` ディレクトリに配置
  - ユニットテスト: 各サービスの `*.test.ts`
  - 統合テスト: `integration/` サブディレクトリ

### エラーハンドリング

- **統一エラーハンドリング戦略**: すべてのエラーを一貫して処理
- **カスタムエラー型**: `ConfigError` など、ドメイン固有のエラー型を定義
- **ログ記録**: `LoggingService` による統一的なログ出力
  - エラーは `console.error` に出力（stderr）
  - 機密情報（トークンなど）はログに含めない

### ビルドと配布

- **ビルド出力**: `dist/` ディレクトリに CommonJS 形式で出力
- **エントリーポイント**: `dist/index.js` が実行可能ファイル
- **Shebang**: `#!/usr/bin/env bun` で Bun を指定
- **ローカル開発**: `bun link` によるグローバルリンクを想定（npm 公開は非想定）

## 環境変数

- **必須**: `SLACK_USER_TOKEN` (xoxb- または xoxp- で始まる)
- **オプション**: `SLACK_TEAM_ID`, `SLACK_CHANNEL_IDS` (カンマ区切り)

## コード品質

- **型安全性**: TypeScript の厳格な設定により、実行時エラーを最小化
- **モジュール解決**: 開発ソースでは拡張子を省略してインポートします（例: `import { McpServer } from "./services/mcp-server"`）。ビルド時に適切な拡張子が付与され、`dist/` は実行可能な `*.js` ファイルを出力します。
- **非同期処理**: `async/await` パターンを使用
- **並行処理**: MCP SDK が自動的に複数のリクエストを並行処理
