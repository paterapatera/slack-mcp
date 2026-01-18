#!/usr/bin/env bun

import { McpServer } from './services/mcp-server.js';

/** MCP サーバー名 */
const SERVER_NAME = 'slack-mcp';
/** MCP サーバーのバージョン */
const SERVER_VERSION = '1.0.0';
/** プロセス終了コード: エラー */
const EXIT_CODE_ERROR = 1;

/**
 * MCP サーバーのエントリーポイント
 * npm link でリンクされた後に実行される
 */
async function startMcpServer() {
  try {
    const server = new McpServer({
      name: SERVER_NAME,
      version: SERVER_VERSION,
    });

    await server.startServer();

    // サーバーは stdio transport 経由で動作するため、
    // プロセスは継続して実行される
  } catch (error: unknown) {
    // catch ブロックで捕捉されるエラーは unknown 型
    // エラーの種類に応じて適切に処理する
    const errorMessage =
      error instanceof Error
        ? error.message
        : `エラー: 予期しないエラーが発生しました。\n${String(error)}`;
    console.error(errorMessage);
    process.exit(EXIT_CODE_ERROR);
  }
}

startMcpServer().catch((error: unknown) => {
  // catch ブロックで捕捉されるエラーは unknown 型
  // エラーメッセージを安全に取得して出力
  const errorMessage = error instanceof Error ? error.message : String(error ?? '不明なエラー');
  console.error('エラー: サーバーの起動に失敗しました。', errorMessage);
  process.exit(EXIT_CODE_ERROR);
});
