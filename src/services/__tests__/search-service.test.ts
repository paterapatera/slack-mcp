import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { LoggingService } from '../logging-service';
import { SearchService } from '../search-service';
import { SlackAPIClient, SlackSearchOptions, SlackSearchResponse } from '../slack-api-client';

class StubSlackClient extends SlackAPIClient {
  public calls: SlackSearchOptions[] = [];
  public lookedUpChannelIds: string[] = [];

  constructor(private response: SlackSearchResponse) {
    super(new LoggingService());
  }

  override async searchMessages(options: SlackSearchOptions): Promise<SlackSearchResponse> {
    this.calls.push(options);
    return this.response;
  }

  override async channelName(channelId: string): Promise<string> {
    this.lookedUpChannelIds.push(channelId);
    return `channel-${channelId}`;
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
};

describe('SearchService', () => {
  let errorSpy: any;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleError = console.error;
    errorSpy = spyOn(console, 'error');
  });

  afterEach(() => {
    if (errorSpy && typeof errorSpy.restore === 'function') {
      errorSpy.restore();
    } else {
      console.error = originalConsoleError;
    }
  });

  it('空のクエリでエラーを返す', async () => {
    const slackClient = new StubSlackClient(emptyResponse);
    const service = new SearchService(slackClient);

    await expect(service.searchMessages({ query: '' })).rejects.toThrow(/検索クエリが空/);
    await expect(service.searchMessages({ query: '   ' })).rejects.toThrow(/検索クエリが空/);
  });

  it('channelIds 未指定の場合はベースクエリをそのまま Slack API に渡す', async () => {
    const slackClient = new StubSlackClient(emptyResponse);
    const service = new SearchService(slackClient);

    const result = await service.searchMessages({ query: 'hello world' });

    expect(slackClient.calls).toHaveLength(1);
    expect((slackClient.calls[0] as any).query).toBe('hello world');
    expect((slackClient.calls[0] as any).query.includes('in:')).toBe(false);
    expect(result.totalResultCount).toBe(0);
  });

  it('channelIds 指定時はチャンネル名を解決して in: 句を付与する', async () => {
    // Arrange
    const slackClient = new StubSlackClient(emptyResponse);
    const service = new SearchService(slackClient);

    // Act
    await service.searchMessages({ query: 'error budget', channelIds: ['C123', 'C999'] });

    // Assert
    expect(slackClient.lookedUpChannelIds).toEqual(['C123', 'C999']);
    const queries = slackClient.calls.map((c) => c.query);
    expect(queries).toContain('error budget in:channel-C123');
    expect(queries).toContain('error budget in:channel-C999');
  });

  it('teamId を検索オプションに含めて Slack API に伝搬する', async () => {
    const slackClient = new StubSlackClient(emptyResponse);
    const service = new SearchService(slackClient);

    await service.searchMessages({ query: 'hello', teamId: 'T111', channelIds: ['C1'] });

    expect((slackClient.calls[0] as any).teamId).toBe('T111');
  });

  it('permalink に thread_ts パラメータがない場合は threadTs は undefined になる', async () => {
    const responseWithThread: any = {
      isSuccess: true,
      query: 'q',
      messages: {
        totalResultCount: 1,
        matches: [
          {
            type: 'message',
            channel: { id: 'C1', name: 'general' },
            user: 'U1',
            username: 'user',
            text: 'reply in thread',
            ts: '1610000000.000100',
            thread_ts: '1609999999.000000',
            permalink: 'https://example',
            score: 0.5,
          },
        ],
        paging: {
          count: 1,
          totalResultCount: 1,
          pageNumber: 1,
          totalPageCount: 1,
        },
      },
    };

    const slackClient = new StubSlackClient(responseWithThread);
    const service = new SearchService(slackClient);

    const result = await service.searchMessages({ query: 'q' });
    expect(result.messages).toHaveLength(1);
    // permalink に thread_ts パラメータがないため、undefined になる
    expect(result.messages[0]!.threadTs).toBeUndefined();
  });

  it('親メッセージに reply_count がある場合も permalink に thread_ts パラメータがない場合は undefined になる', async () => {
    const responseParentWithReplies: any = {
      isSuccess: true,
      query: 'q',
      messages: {
        totalResultCount: 1,
        matches: [
          {
            type: 'message',
            channel: { id: 'C1', name: 'general' },
            user: 'U1',
            username: 'user',
            text: 'parent with replies',
            ts: '1609999999.000000',
            reply_count: 3,
            permalink: 'https://example',
            score: 1.0,
          },
        ],
        paging: {
          count: 1,
          totalResultCount: 1,
          pageNumber: 1,
          totalPageCount: 1,
        },
      },
    };

    const slackClient = new StubSlackClient(responseParentWithReplies);
    const service = new SearchService(slackClient);

    const result = await service.searchMessages({ query: 'q' });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.threadTs).toBeUndefined();
  });

  it('thread_ts が無く reply_count も無い場合、permalink に thread_ts パラメータがない場合は undefined になる', async () => {
    const responseNoThreadInfo: any = {
      isSuccess: true,
      query: 'q',
      messages: {
        totalResultCount: 1,
        matches: [
          {
            type: 'message',
            channel: { id: 'C1', name: 'general' },
            user: 'U1',
            username: 'user',
            text: 'no thread info',
            ts: '1611111111.111111',
            permalink: 'https://example',
            score: 2.0,
          },
        ],
        paging: {
          count: 1,
          totalResultCount: 1,
          pageNumber: 1,
          totalPageCount: 1,
        },
      },
    };

    const slackClient = new StubSlackClient(responseNoThreadInfo);
    const service = new SearchService(slackClient);

    const result = await service.searchMessages({ query: 'q' });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.threadTs).toBeUndefined();
  });

  it('無効なチャンネルIDでは例外を投げ、ログを残す', async () => {
    const slackClient = new StubSlackClient(emptyResponse);
    const service = new SearchService(slackClient);

    await expect(service.searchMessages({ query: 'oops', channelIds: [''] })).rejects.toThrow(
      /無効なチャンネルID/
    );
    expect(
      errorSpy.mock.calls.some(
        (call: any) => typeof call[0] === 'string' && call[0].includes('無効なチャンネルIDが検出')
      )
    ).toBe(true);
  });

  it('チャンネル名の取得が一部失敗した場合は成功分のみで検索を実行する', async () => {
    class PartialFailClient extends StubSlackClient {
      constructor(response: SlackSearchResponse) {
        super(response);
      }

      override async channelName(channelId: string): Promise<string> {
        if (channelId === 'C123') {
          throw new Error('channel not found');
        }
        return `channel-${channelId}`;
      }
    }

    const slackClient = new PartialFailClient(emptyResponse);
    const service = new SearchService(slackClient);

    const result = await service.searchMessages({ query: 'partial', channelIds: ['C123', 'C999'] });

    // C123 の失敗はログに残るが、C999 に対してのみ searchMessages が呼ばれる
    expect(slackClient.calls.map((c) => c.query)).toContain('partial in:channel-C999');
    expect(slackClient.calls).toHaveLength(1);
    // エラーログが出力されていること
    expect(
      errorSpy.mock.calls.some(
        (call: any) =>
          typeof call[0] === 'string' && call[0].includes('チャンネル名の取得に失敗しました')
      )
    ).toBe(true);
  });

  it('Slack が matches を含まない不正なレスポンスを返すとエラーを投げ、ログを残す', async () => {
    const badResponse: any = {
      isSuccess: true,
      query: 'q',
      messages: {
        // matches が存在しない / 不正
        totalResultCount: 1,
      },
    };

    const slackClient = new StubSlackClient(badResponse);
    const service = new SearchService(slackClient);

    await expect(service.searchMessages({ query: 'q' })).rejects.toThrow(/レスポンス形式/);

    // 検証失敗時のログが残っていること
    expect(
      errorSpy.mock.calls.some(
        (call: any) =>
          typeof call[0] === 'string' && call[0].includes('searchResponse validation failed')
      )
    ).toBe(true);
  });

  it('isSuccess が true でない場合、error がなければ汎用の検証エラーを返す', async () => {
    const badResponse: any = {
      // 成功フラグが false か undefined
      isSuccess: false,
      query: 'q',
      // error が存在しないケース
    };

    const slackClient = new StubSlackClient(badResponse);
    const service = new SearchService(slackClient);

    await expect(service.searchMessages({ query: 'q' })).rejects.toThrow(/レスポンス形式/);

    expect(
      errorSpy.mock.calls.some(
        (call: any) =>
          typeof call[0] === 'string' && call[0].includes('searchResponse validation failed')
      )
    ).toBe(true);
  });
});
