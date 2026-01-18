import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { McpServer } from '../../mcp-server'

const originalEnv = process.env

describe('パフォーマンステスト', () => {
  let server: McpServer

  beforeEach(() => {
    // テストごとに環境変数をクリア
    process.env = { ...originalEnv }
    server = new McpServer({
      name: 'slack-mcp',
      version: '1.0.0',
    })
  })

  afterEach(async () => {
    if (server) {
      await server.closeServer()
    }
    // 環境変数を元に戻す
    process.env = originalEnv
  })

  describe('起動パフォーマンス', () => {
    beforeEach(() => {
      process.env.SLACK_USER_TOKEN =
        'xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx'
    })

    it('サーバー起動が 2 秒未満で完了する', async () => {
      const start = performance.now()

      await server.startServer()

      const elapsedMs = performance.now() - start
      expect(elapsedMs).toBeLessThan(2000)
    })
  })
})
