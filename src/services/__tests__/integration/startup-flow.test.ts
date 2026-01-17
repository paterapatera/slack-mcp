import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { McpServer } from '../../mcp-server'
import { ConfigService } from '../../config-service'

const originalEnv = process.env

describe('起動フローの統合テスト', () => {
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

  describe('環境変数の読み込みと検証の統合テスト', () => {
    it('環境変数が正しく読み込まれ、検証される', async () => {
      process.env.SLACK_USER_TOKEN =
        'xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx'
      process.env.SLACK_TEAM_ID = 'T1234567890'
      process.env.SLACK_CHANNEL_IDS = 'C1234567890,C0987654321'

      await server.startServer()

      // サーバーが正常に起動したことを確認
      expect(server).toBeDefined()
      expect(server.server).toBeDefined()
    })

    it('SLACK_USER_TOKEN が未設定の場合、起動を中止する', async () => {
      delete process.env.SLACK_USER_TOKEN

      await expect(server.startServer()).rejects.toThrow()
    })

    it('SLACK_CHANNEL_IDS がカンマ区切りで正しく読み込まれる', async () => {
      process.env.SLACK_USER_TOKEN =
        'xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx'
      process.env.SLACK_CHANNEL_IDS = 'C1234567890,C0987654321'

      const config = ConfigService.loadConfig()
      expect(config.slackChannelIds).toEqual(['C1234567890', 'C0987654321'])
    })
  })

  describe('Slack API Client の初期化の統合テスト', () => {
    it('有効なトークンで Slack API Client が初期化される', async () => {
      process.env.SLACK_USER_TOKEN =
        'xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx'

      await server.startServer()

      // サーバーが正常に起動したことを確認
      expect(server).toBeDefined()
    })

    it('無効なトークン形式の場合、起動を中止する', async () => {
      process.env.SLACK_USER_TOKEN = 'invalid-token'

      await expect(server.startServer()).rejects.toThrow()
    })
  })

  describe('起動時のエラーハンドリングのテスト', () => {
    it('環境変数未設定時に適切なエラーメッセージを返す', async () => {
      delete process.env.SLACK_USER_TOKEN

      await expect(server.startServer()).rejects.toThrow(/SLACK_USER_TOKEN/)
    })

    it('Slack API Client 初期化失敗時に適切なエラーメッセージを返す', async () => {
      process.env.SLACK_USER_TOKEN = 'invalid-token'

      await expect(server.startServer()).rejects.toThrow(/Slack API/)
    })
  })
})
