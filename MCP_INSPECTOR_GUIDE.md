# MCP Inspector を使用したテストガイド

このガイドでは、MCP Inspector を使用して Slack MCP サーバーをテストする方法を説明します。

## クイックスタート

1. **環境変数を設定**:
   ```bash
   export SLACK_USER_TOKEN="xoxb-your-token-here"
   ```

2. **ビルド**:
   ```bash
   bun run build
   ```

3. **MCP Inspector を起動**:
   ```bash
   bun run inspector
   ```

4. **ブラウザで開かれた UI でテスト**:
   - `search_messages` ツールを選択
   - クエリを入力（例: `"test query"`）
   - 「Call Tool」をクリック

詳細は以下のセクションを参照してください。

## 前提条件

- Node.js または Bun がインストールされていること
- 有効な Slack User Token (`xoxb-` または `xoxp-` で始まる) を持っていること

## セットアップ

### 1. 環境変数の設定

テスト用の Slack User Token を環境変数に設定します：

```bash
export SLACK_USER_TOKEN="xoxb-your-token-here"
```

オプションで、チーム ID やチャンネル ID も設定できます：

```bash
export SLACK_TEAM_ID="T1234567890"  # オプション
export SLACK_CHANNEL_IDS="C1234567890,C0987654321"  # オプション（カンマ区切り）
```

### 2. サーバーのビルド

プロジェクトをビルドします：

```bash
bun run build
```

これにより `dist/index.js` が生成されます。

## MCP Inspector の起動

### 方法 1: npm スクリプトを使用（推奨）

最も簡単な方法は、npm スクリプトを使用することです：

```bash
bun run inspector
```

このコマンドは自動的に MCP Inspector を起動し、ブラウザで UI が開きます。

### 方法 2: テストスクリプトを使用

環境変数の確認とビルドチェックを含むテストスクリプトを使用できます：

```bash
./scripts/test-with-inspector.sh
```

このスクリプトは以下を実行します：
- 環境変数の確認
- ビルドファイルの確認（必要に応じてビルド）
- MCP Inspector の起動

### 方法 3: 直接コマンドを実行

直接コマンドを実行することもできます：

```bash
npx @modelcontextprotocol/inspector bun dist/index.js
```

**注意**: このプロジェクトは Bun を使用しているため、`node` ではなく `bun` を使用します。

### 環境変数を指定して起動

環境変数をコマンドラインで指定することもできます：

```bash
npx @modelcontextprotocol/inspector \
  --env SLACK_USER_TOKEN="xoxb-your-token" \
  --env SLACK_TEAM_ID="T1234567890" \
  --env SLACK_CHANNEL_IDS="C1234567890,C0987654321" \
  bun dist/index.js
```

### ポートのカスタマイズ

デフォルトでは、UI はポート `6274`、プロキシサーバーはポート `6277` で起動します。
これらを変更する場合は、環境変数で指定できます：

```bash
CLIENT_PORT=3000 SERVER_PORT=3001 npx @modelcontextprotocol/inspector bun dist/index.js
```

## MCP Inspector UI でのテスト

MCP Inspector を起動すると、ブラウザが自動的に開きます（通常は `http://localhost:6274`）。

### 1. サーバー接続の確認

- **Server Connection** パネルで、サーバーが正常に起動していることを確認します
- サーバーの capabilities（ツール、リソースなど）が表示されることを確認します

### 2. ツールの確認

- **Tools** タブを開きます
- `search_messages` ツールが登録されていることを確認します
- ツールの説明とパラメータ（`query`, `limit`）が正しく表示されることを確認します

### 3. 検索リクエストの実行

**Tools** タブで `search_messages` ツールを選択し、以下のパラメータを入力します：

- **query**: 検索クエリ（例: `"test query"`）
- **limit**: 検索結果の最大件数（オプション、例: `10`）

「Call Tool」ボタンをクリックして実行します。

### 4. 検索結果の確認

検索結果が以下の形式で返却されることを確認します：

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

### 5. エラーハンドリングの確認

以下のエラーケースをテストします：

- **無効なリクエスト**: 空のクエリを送信し、適切なエラーレスポンスが返ることを確認
- **認証エラー**: 無効なトークンを使用し、適切なエラーメッセージが表示されることを確認
- **ログの確認**: **Notifications / Logs** パネルで、エラーが適切にログに記録されることを確認

## CLI モードでのテスト

自動化されたテストや CI での使用には、CLI モードを使用できます：

### ツールの一覧を取得

```bash
npx @modelcontextprotocol/inspector --cli bun dist/index.js --method tools/list
```

### ツールを呼び出す

```bash
npx @modelcontextprotocol/inspector --cli \
  --env SLACK_USER_TOKEN="xoxb-your-token" \
  bun dist/index.js \
  --method tools/call \
  --tool-name search_messages \
  --tool-arg query="test query" \
  --tool-arg limit=10
```

## トラブルシューティング

### サーバーが起動しない

- 環境変数 `SLACK_USER_TOKEN` が正しく設定されているか確認
- トークンが有効な形式（`xoxb-` または `xoxp-` で始まる）か確認
- `dist/index.js` が存在するか確認（`bun run build` を実行）

### ツールが表示されない

- サーバーのログを確認（**Notifications / Logs** パネル）
- サーバーが正常に初期化されているか確認
- ブラウザのコンソールでエラーがないか確認

### 検索が失敗する

- Slack API の認証トークンが有効か確認
- トークンに必要なスコープ（`search:read`）が付与されているか確認
- ネットワーク接続を確認

## 参考リンク

- [MCP Inspector 公式ドキュメント](https://modelcontextprotocol.io/docs/tools/inspector)
- [MCP Inspector GitHub](https://github.com/modelcontextprotocol/inspector)
- [Slack API ドキュメント](https://api.slack.com/)
