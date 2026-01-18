import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { LoggingService } from '../logging-service'

describe('LoggingService', () => {
  let loggingService: LoggingService
  let errorSpy: any
  let originalConsoleError: typeof console.error

  beforeEach(() => {
    loggingService = new LoggingService()
    originalConsoleError = console.error
    errorSpy = spyOn(console, 'error')
  })

  afterEach(() => {
    if (errorSpy && typeof errorSpy.restore === 'function') {
      errorSpy.restore()
    } else {
      console.error = originalConsoleError
    }
  })

  it('エラーをログに記録する', () => {
    const error = new Error('テストエラー')
    loggingService.logError(error, 'テストコンテキスト')

    expect(errorSpy).toHaveBeenCalledWith('[ERROR] テストコンテキスト')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('エラーメッセージ: テストエラー'))
    expect(
      errorSpy.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].startsWith('スタックトレース:')
      )
    ).toBe(true)
  })

  it('認証エラーをログに記録する', () => {
    const error = new Error('認証エラー: invalid_token')
    loggingService.logAuthenticationError(error, 'Slack API 認証')

    expect(errorSpy).toHaveBeenCalledWith('[AUTH_ERROR] Slack API 認証')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('invalid_token'))
    expect(
      errorSpy.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('SLACK_USER_TOKEN')
      )
    ).toBe(true)
  })

  it('API エラーをログに記録する', () => {
    const error = new Error('API エラー: request_failed')
    loggingService.logAPIError(error, 'Slack API 呼び出し')

    expect(errorSpy).toHaveBeenCalledWith('[API_ERROR] Slack API 呼び出し')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('request_failed'))
  })

  it('レート制限エラーをログに記録する', () => {
    const error = new Error('レート制限エラー: ratelimited')
    loggingService.logRateLimitError(error, 'Slack API 呼び出し', 1)

    expect(errorSpy).toHaveBeenCalledWith('[RATE_LIMIT_ERROR] Slack API 呼び出し')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ratelimited'))
    expect(errorSpy).toHaveBeenCalledWith('リトライ試行回数: 1')
  })

  it('検索リクエストの成功を記録する', () => {
    loggingService.logSearchRequestSuccess('test query', 10)

    expect(errorSpy).toHaveBeenCalledWith('[SEARCH_SUCCESS] クエリ: "test query", 結果数: 10')
  })

  it('検索リクエストの失敗を記録する', () => {
    const error = new Error('検索エラー')
    loggingService.logSearchRequestFailure('test query', error)

    expect(errorSpy).toHaveBeenCalledWith('[SEARCH_FAILURE] クエリ: "test query"')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('検索エラー'))
  })

  it('検索リクエストの成功/失敗率を追跡する', () => {
    loggingService.logSearchRequestSuccess('test query', 10)
    loggingService.logSearchRequestFailure('test query', new Error('エラー'))

    const stats = loggingService.searchRequestStats()
    expect(stats.totalRequests).toBe(2)
    expect(stats.successfulRequests).toBe(1)
    expect(stats.failedRequests).toBe(1)
  })
})
