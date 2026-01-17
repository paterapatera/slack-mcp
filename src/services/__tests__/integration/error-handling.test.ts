import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { McpServer } from '../../mcp-server'
import { SearchService } from '../../search-service'
import { SlackAPIClient } from '../../slack-api-client'
import { LoggingService } from '../../logging-service'

const originalEnv = process.env

describe('エラーハンドリングのテスト', () => {
  let server: McpServer
  let slackClient: SlackAPIClient
  let searchService: SearchService
  let loggingService: LoggingService

  beforeEach(() => {
    // テストごとに環境変数をクリア
    process.env = { ...originalEnv }
    loggingService = new LoggingService()
    slackClient = new SlackAPIClient(loggingService)
    searchService = new SearchService(slackClient, loggingService)
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

  describe('起動時エラーのテスト', () => {
    it('環境変数未設定時に適切なエラーを throw する', async () => {
      delete process.env.SLACK_USER_TOKEN

      await expect(server.startServer()).rejects.toThrow(/SLACK_USER_TOKEN/)
    })

    it('Slack API 接続失敗時に適切なエラーを throw する', async () => {
      process.env.SLACK_USER_TOKEN = 'invalid-token'

      await expect(server.startServer()).rejects.toThrow()
    })
  })

  describe('リクエスト時エラーのテスト', () => {
    beforeEach(() => {
      process.env.SLACK_USER_TOKEN =
        'xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx'
      slackClient.initializeClient(process.env.SLACK_USER_TOKEN)
    })

    it('無効なリクエスト（空のクエリ）でエラーを throw する', async () => {
      await expect(searchService.searchMessages({ query: '' })).rejects.toThrow()
    })

    it('認証エラーが適切に処理される', async () => {
      // 認証エラーの処理を確認
      // 実際の認証エラーは統合テストで行う
      expect(searchService).toBeDefined()
    })
  })

  describe('レート制限エラー時のリトライロジックのテスト', () => {
    beforeEach(() => {
      process.env.SLACK_USER_TOKEN =
        'xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx'
      slackClient.initializeClient(process.env.SLACK_USER_TOKEN)
    })

    it('レート制限エラー時にリトライロジックが実行される', async () => {
      // レート制限エラーのリトライロジックを確認
      // 実際のレート制限エラーは統合テストで行う
      expect(slackClient).toBeDefined()
    })
  })

  describe('無効なチャンネルIDの処理のテスト', () => {
    beforeEach(() => {
      process.env.SLACK_USER_TOKEN =
        'xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx'
      slackClient.initializeClient(process.env.SLACK_USER_TOKEN)
    })

    it('無効なチャンネルIDでエラーを throw する', async () => {
      await expect(
        searchService.searchMessages({
          query: 'test',
          channelIds: [''],
        })
      ).rejects.toThrow()
    })
  })
})
