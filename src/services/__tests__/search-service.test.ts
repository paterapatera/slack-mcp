import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { LoggingService } from '../logging-service'
import { SearchService } from '../search-service'
import { SlackAPIClient, SlackSearchOptions, SlackSearchResponse } from '../slack-api-client'

class StubSlackClient extends SlackAPIClient {
  public calls: SlackSearchOptions[] = []
  public lookedUpChannelIds: string[] = []

  constructor(private response: SlackSearchResponse) {
    super(new LoggingService())
  }

  async searchMessages(options: SlackSearchOptions): Promise<SlackSearchResponse> {
    this.calls.push(options)
    return this.response
  }

  async channelName(channelId: string): Promise<string> {
    this.lookedUpChannelIds.push(channelId)
    return `channel-${channelId}`
  }
}

const emptyResponse: SlackSearchResponse = {
  isSuccess: true,
  query: '',
  messages: {
    totalResultCount: 0,
    matches: [],
    paging: {
      count: 0,
      totalResultCount: 0,
      pageNumber: 1,
      totalPageCount: 1,
    },
  },
}

describe('SearchService', () => {
  let errorSpy: any
  let originalConsoleError: typeof console.error

  beforeEach(() => {
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

  it('空のクエリでエラーを返す', async () => {
    const slackClient = new StubSlackClient(emptyResponse)
    const service = new SearchService(slackClient)

    await expect(service.searchMessages({ query: '' })).rejects.toThrow(/検索クエリが空/)
    await expect(service.searchMessages({ query: '   ' })).rejects.toThrow(/検索クエリが空/)
  })

  it('channelIds 未指定の場合はベースクエリをそのまま Slack API に渡す', async () => {
    const slackClient = new StubSlackClient(emptyResponse)
    const service = new SearchService(slackClient)

    const result = await service.searchMessages({ query: 'hello world' })

    expect(slackClient.calls).toHaveLength(1)
    expect(slackClient.calls[0].query).toBe('hello world')
    expect(slackClient.calls[0].query.includes('in:')).toBe(false)
    expect(result.totalResultCount).toBe(0)
  })

  it('channelIds 指定時はチャンネル名を解決して in: 句を付与する', async () => {
    const slackClient = new StubSlackClient(emptyResponse)
    const service = new SearchService(slackClient)

    await service.searchMessages({ query: 'error budget', channelIds: ['C123', 'C999'] })

    expect(slackClient.lookedUpChannelIds).toEqual(['C123', 'C999'])
    const queries = slackClient.calls.map((c) => c.query)
    expect(queries).toContain('error budget in:channel-C123')
    expect(queries).toContain('error budget in:channel-C999')
  })

  it('teamId を検索オプションに含めて Slack API に伝搬する', async () => {
    const slackClient = new StubSlackClient(emptyResponse)
    const service = new SearchService(slackClient)

    await service.searchMessages({ query: 'hello', teamId: 'T111', channelIds: ['C1'] })

    expect(slackClient.calls[0].teamId).toBe('T111')
  })

  it('無効なチャンネルIDでは例外を投げ、ログを残す', async () => {
    const slackClient = new StubSlackClient(emptyResponse)
    const service = new SearchService(slackClient)

    await expect(service.searchMessages({ query: 'oops', channelIds: [''] })).rejects.toThrow(
      /無効なチャンネルID/
    )
    expect(
      errorSpy.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('無効なチャンネルIDが検出')
      )
    ).toBe(true)
  })

  it('チャンネル名の取得が一部失敗した場合は成功分のみで検索を実行する', async () => {
    class PartialFailClient extends StubSlackClient {
      constructor(response: SlackSearchResponse) {
        super(response)
      }

      async channelName(channelId: string): Promise<string> {
        if (channelId === 'C123') {
          throw new Error('channel not found')
        }
        return `channel-${channelId}`
      }
    }

    const slackClient = new PartialFailClient(emptyResponse)
    const service = new SearchService(slackClient)

    const result = await service.searchMessages({ query: 'partial', channelIds: ['C123', 'C999'] })

    // C123 の失敗はログに残るが、C999 に対してのみ searchMessages が呼ばれる
    expect(slackClient.calls.map((c) => c.query)).toContain('partial in:channel-C999')
    expect(slackClient.calls).toHaveLength(1)
    // エラーログが出力されていること
    expect(
      errorSpy.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('チャンネル名の取得に失敗しました')
      )
    ).toBe(true)
  })
})
