/**
 * MCP Inspector を使用した E2E テスト
 *
 * このテストファイルは、MCP Inspector を使用した E2E テストの手順を文書化します。
 * MCP Inspector は手動で実行するツールのため、自動テストではなく、手動テストの手順を記載します。
 *
 * ## テスト手順
 *
 * 1. 環境変数を設定:
 *    ```bash
 *    export SLACK_USER_TOKEN="xoxb-your-token"
 *    export SLACK_TEAM_ID="T1234567890"  # オプション
 *    export SLACK_CHANNEL_IDS="C1234567890,C0987654321"  # オプション
 *    ```
 *
 * 2. サーバーをビルド:
 *    ```bash
 *    bun run build
 *    ```
 *
 * 3. MCP Inspector でサーバーを起動:
 *    ```bash
 *    npx @modelcontextprotocol/inspector bun run dist/index.js
 *    ```
 *
 * 4. MCP Inspector の UI で以下を確認:
 *    - サーバーが正常に起動する
 *    - search_messages ツールが登録されている
 *    - ツールの説明とパラメータが正しく表示される
 *
 * 5. 検索リクエストを実行:
 *    - query: "test query"
 *    - limit: 10 (オプション)
 *
 * 6. 検索結果を確認:
 *    - メッセージが正しく返却される
 *    - メッセージの形式が正しい（text, timestamp, channelId, userId など）
 *
 * 7. エラーハンドリングを確認:
 *    - 無効なリクエストで適切なエラーレスポンスが返る
 *    - 認証エラー時に適切なエラーメッセージが表示される
 */

// 自動化不可のため、このファイルは手動手順のみを文書化する
