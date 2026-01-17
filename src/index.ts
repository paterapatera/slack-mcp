#!/usr/bin/env bun

import { McpServer } from "./services/mcp-server.js";

/**
 * MCP サーバーのエントリーポイント
 * npm link でリンクされた後に実行される
 */
async function main() {
  try {
    // MCP サーバーを初期化
    const server = new McpServer({
      name: "slack-mcp",
      version: "1.0.0",
    });

    // サーバーを起動
    await server.start();

    // サーバーは stdio transport 経由で動作するため、
    // プロセスは継続して実行される
  } catch (error) {
    // 起動時エラーをキャッチし、適切なエラーメッセージを出力
    if (error instanceof Error) {
      console.error(error.message);
      process.exit(1);
    } else {
      console.error(`エラー: 予期しないエラーが発生しました。\n${String(error)}`);
      process.exit(1);
    }
  }
}

// エントリーポイントを実行
main().catch((error) => {
  console.error("エラー: サーバーの起動に失敗しました。", error);
  process.exit(1);
});
