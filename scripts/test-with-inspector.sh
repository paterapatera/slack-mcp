#!/bin/bash

# MCP Inspector を使用してサーバーをテストするスクリプト

set -e

echo "=== MCP Inspector テストスクリプト ==="
echo ""

# 環境変数の確認
if [ -z "$SLACK_USER_TOKEN" ]; then
  echo "エラー: SLACK_USER_TOKEN が設定されていません"
  echo ""
  echo "以下のコマンドで環境変数を設定してください:"
  echo "  export SLACK_USER_TOKEN=\"xoxb-your-token-here\""
  echo ""
  exit 1
fi

echo "✓ SLACK_USER_TOKEN が設定されています"
echo ""

# ビルドの確認
if [ ! -f "dist/index.js" ]; then
  echo "dist/index.js が見つかりません。ビルドを実行します..."
  bun run build
  echo ""
fi

echo "✓ ビルドファイルが存在します"
echo ""

# MCP Inspector の起動
echo "MCP Inspector を起動します..."
echo "ブラウザが自動的に開きます。"
echo ""
echo "環境変数:"
echo "  SLACK_USER_TOKEN: ${SLACK_USER_TOKEN:0:10}..."
if [ -n "$SLACK_TEAM_ID" ]; then
  echo "  SLACK_TEAM_ID: $SLACK_TEAM_ID"
fi
if [ -n "$SLACK_CHANNEL_IDS" ]; then
  echo "  SLACK_CHANNEL_IDS: $SLACK_CHANNEL_IDS"
fi
echo ""

npx @modelcontextprotocol/inspector bun dist/index.js
