import { describe, it, expect, beforeEach } from 'bun:test';
import { SearchService } from '../../search-service';
import { LoggingService } from '../../logging-service';

describe('getThreadReplies 統合テスト（モック）', () => {
  let loggingService: LoggingService;

  beforeEach(() => {
    loggingService = new LoggingService();
  });

  it('conversations.replies のページネーションをモックして統合動作を確認する', async () => {
    const calls: any[] = [];
    const fakeClient: any = {
      initializeClient: () => {},
      searchMessages: async () => ({
        isSuccess: true,
        query: '',
        messages: {
          totalResultCount: 0,
          matches: [],
          paging: { count: 0, totalResultCount: 0, pageNumber: 1, totalPageCount: 1 },
        },
      }),
      channelName: async () => 'channel',
      conversationsReplies: async (opts: any) => {
        calls.push(opts);
        if (!opts.cursor) {
          return {
            ok: true,
            messages: [{ ts: '100', text: 'p1' }],
            response_metadata: { next_cursor: 'c1' },
          };
        }
        if (opts.cursor === 'c1') {
          return { ok: true, messages: [{ ts: '200', text: 'p2' }] };
        }
        return { ok: true, messages: [] };
      },
    };

    const service = new SearchService(fakeClient, loggingService);

    const res = await service.getThreadReplies({ channelId: 'C1', threadTs: '100' });

    // 統合的に1ページのみ返す既定動作を確認
    expect(calls.length).toBe(1);
    expect(res.parent!.text).toBe('p1');
    expect(res.replies).toEqual([]);
    expect(res.nextCursor).toBe('c1');
    expect(res.hasMore).toBe(true);
  });

  it('RateLimit をモックしてエラー時に統合的に失敗することを確認する', async () => {
    const fakeClient: any = {
      initializeClient: () => {},
      searchMessages: async () => ({
        isSuccess: true,
        query: '',
        messages: {
          totalResultCount: 0,
          matches: [],
          paging: { count: 0, totalResultCount: 0, pageNumber: 1, totalPageCount: 1 },
        },
      }),
      channelName: async () => 'channel',
      conversationsReplies: async () => {
        throw new Error('ratelimit');
      },
    };

    const service = new SearchService(fakeClient, loggingService);

    await expect(service.getThreadReplies({ channelId: 'C1', threadTs: '100' })).rejects.toThrow();

    const stats = loggingService.searchRequestStats();
    expect(stats.failedRequests).toBeGreaterThanOrEqual(1);
    expect(stats.rateLimitEvents).toBeGreaterThanOrEqual(1);
  });
});
