# Slack MCP Server

Slack ワークスペース内のメッセージを検索する MCP (Model Context Protocol) サーバーです。AI エージェントが Slack のメッセージを効率的に検索・取得できるようにします。

## 概要

このプロジェクトは、MCP プロトコルに準拠したサーバーを実装し、Slack Web API を使用してワークスペース内のメッセージを検索する機能を提供します。Claude Desktop やその他の MCP クライアントから使用できます。

## 主な機能

- ✅ **MCP プロトコル準拠**: 標準的な MCP サーバー実装
- ✅ **Slack メッセージ検索**: ワークスペース内のメッセージを検索
- ✅ **チャンネルフィルタリング**: 特定のチャンネルに絞り込んだ検索
- ✅ **レート制限対応**: Slack API のレート制限を適切に処理
- ✅ **エラーハンドリング**: 統一されたエラーハンドリング戦略
- ✅ **ログ記録**: 検索リクエストの統計情報とログ記録

## 前提条件

- [Bun](https://bun.sh) v1.2.21 以降
- 有効な Slack User Token (`xoxb-` または `xoxp-` で始まる)
- Slack API の `search:read` スコープ

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/paterapatera/slack-mcp.git
cd slack-mcp
```

### 2. 依存関係のインストール

```bash
bun install
```

### 3. 環境変数の設定

必須の環境変数：

```bash
export SLACK_USER_TOKEN="xoxb-your-token-here"
```

オプションの環境変数：

```bash
export SLACK_TEAM_ID="T1234567890"  # チーム/ワークスペース ID
export SLACK_CHANNEL_IDS="C1234567890,C0987654321"  # 検索対象チャンネル（カンマ区切り）
```

### 4. ビルド

```bash
bun run build
```

ビルド後、`dist/index.js` が生成されます。

## 使用方法

### bun link でインストール

ローカル開発環境で使用する場合、`bun link` を使用します：

```bash
# プロジェクトディレクトリで実行
bun link

# グローバルにリンクされた後、どこからでも実行可能
slack-mcp
```

環境変数を指定する場合：

```bash
SLACK_USER_TOKEN="xoxb-your-token" slack-mcp
```

### MCP クライアントとして使用

このサーバーは MCP クライアント（例: Claude Desktop, MCP Inspector）から使用されます。

#### Claude Desktop での設定

`claude_desktop_config.json` に以下を追加：

**bun link を使用する場合**（推奨）：

```json
{
  "mcpServers": {
    "slack-mcp": {
      "command": "slack-mcp",
      "env": {
        "SLACK_USER_TOKEN": "xoxb-your-token-here",
        "SLACK_TEAM_ID": "T1234567890",
        "SLACK_CHANNEL_IDS": "C1234567890,C0987654321"
      }
    }
  }
}
```

`bun link` でグローバルにリンクされている場合、`slack-mcp` コマンドが使用可能になります。

**ローカルパスを使用する場合**：

```json
{
  "mcpServers": {
    "slack-mcp": {
      "command": "bun",
      "args": ["/path/to/slack-mcp/dist/index.js"],
      "env": {
        "SLACK_USER_TOKEN": "xoxb-your-token-here",
        "SLACK_TEAM_ID": "T1234567890",
        "SLACK_CHANNEL_IDS": "C1234567890,C0987654321"
      }
    }
  }
}
```

### 直接実行

```bash
bun dist/index.js
```

ただし、通常は MCP クライアント経由で使用します。

## テスト

### ユニットテスト

```bash
bun test
```

全80テストが実行され、以下のカバレッジが含まれます：

- Config Service
- Slack API Client
- Search Service
- MCP Server
- Logging Service
- 統合テスト

### MCP Inspector を使用した E2E テスト

MCP Inspector を使用してサーバーをテストする方法については、[MCP_INSPECTOR_GUIDE.md](./MCP_INSPECTOR_GUIDE.md) を参照してください。

簡単な手順：

```bash
# 1. 環境変数を設定
export SLACK_USER_TOKEN="xoxb-your-token-here"

# 2. ビルド
bun run build

# 3. MCP Inspector を起動
bun run inspector
```

または、テストスクリプトを使用：

```bash
./scripts/test-with-inspector.sh
```

詳細は [MCP_INSPECTOR_GUIDE.md](./MCP_INSPECTOR_GUIDE.md) を参照してください。

## アーキテクチャ

### 主要コンポーネント

- **McpServer**: MCP プロトコルの実装とツールの登録
- **SlackAPIClient**: Slack Web API との通信とレート制限処理
- **SearchService**: メッセージ検索のビジネスロジック
- **ConfigService**: 環境変数の読み込みと検証
- **LoggingService**: ログ記録と統計情報の管理

### プロジェクト構造

```
slack-mcp/
├── src/
│   ├── index.ts                 # エントリーポイント
│   └── services/
│       ├── mcp-server.ts        # MCP サーバー実装
│       ├── slack-api-client.ts  # Slack API クライアント
│       ├── search-service.ts     # 検索サービス
│       ├── config-service.ts    # 設定管理
│       ├── logging-service.ts   # ログ記録
│       └── __tests__/           # テストファイル
├── dist/                        # ビルド出力
├── scripts/                     # ユーティリティスクリプト
└── .kiro/                      # 仕様書と設計ドキュメント
```

## ツール

### `search_messages`

Slack ワークスペース内のメッセージを検索します。

**パラメータ**:

- `query` (string, 必須): 検索クエリ
- `limit` (number, オプション): 検索結果の最大件数

**戻り値**:

```json
{
  "messages": [
    {
      "text": "メッセージのテキスト",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "channelId": "C1234567890",
      "channelName": "general",
      "userId": "U1234567890",
      "userName": "username"
    }
  ],
  "total": 1,
  "hasMore": false
}
```

## 環境変数

| 変数名              | 必須 | 説明                                               |
| ------------------- | ---- | -------------------------------------------------- |
| `SLACK_USER_TOKEN`  | ✅   | Slack User Token (`xoxb-` または `xoxp-` で始まる) |
| `SLACK_TEAM_ID`     | ❌   | チーム/ワークスペース ID                           |
| `SLACK_CHANNEL_IDS` | ❌   | 検索対象チャンネル ID（カンマ区切り）              |

## トラブルシューティング

### サーバーが起動しない

- 環境変数 `SLACK_USER_TOKEN` が正しく設定されているか確認
- トークンが有効な形式（`xoxb-` または `xoxp-` で始まる）か確認
- `dist/index.js` が存在するか確認（`bun run build` を実行）

### 検索が失敗する

- Slack API の認証トークンが有効か確認
- トークンに必要なスコープ（`search:read`）が付与されているか確認
- ネットワーク接続を確認

### MCP Inspector でエラーが発生する

- ログが stdout に出力されていないか確認（すべて stderr に出力される必要があります）
- 詳細は [MCP_INSPECTOR_GUIDE.md](./MCP_INSPECTOR_GUIDE.md) のトラブルシューティングセクションを参照

## 開発

### 開発環境のセットアップ

```bash
# 依存関係のインストール
bun install

# 開発モードでテストを実行
bun test --watch

# ビルド
bun run build
```

### コードスタイル

- TypeScript を使用
- TDD (Test-Driven Development) アプローチ
- 統一エラーハンドリング戦略に準拠

## ライセンス

ISC

## 参考リンク

- [MCP Inspector ガイド](./MCP_INSPECTOR_GUIDE.md)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Slack API ドキュメント](https://api.slack.com/)
- [Bun ドキュメント](https://bun.sh/docs)

## 貢献

このプロジェクトは個人プロジェクトです。問題や改善提案がある場合は、Issue を作成してください。

---

**注意**: このプロジェクトは `bun link` を使用したローカル開発環境での利用を想定しています。npm への公開は想定していません。
