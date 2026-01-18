import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { SearchService } from '../search-service';
import { LoggingService } from '../logging-service';
import type { ISlackClient } from '../slack-client-adapter';

describe('SearchService.getThreadReplies', () => {
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

  it('channelId が空の場合はエラーを返す', async () => {
    const stubClient: ISlackClient = {
      initializeClient: () => {},
      searchMessages: async () => {
        return {
          isSuccess: true,
          query: '',
          messages: {
            totalResultCount: 0,
            matches: [],
            paging: { count: 0, totalResultCount: 0, pageNumber: 1, totalPageCount: 1 },
          },
        };
      },
      channelName: async () => 'channel',
      // @ts-ignore - will be implemented by concrete client
      conversationsReplies: async () => ({ ok: true, messages: [] }),
    };

    const service = new SearchService(stubClient, new LoggingService());

    await expect(service.getThreadReplies({ channelId: '', threadTs: '123' })).rejects.toThrow(
      /channelId/
    );
  });

  it('threadTs が空の場合はエラーを返す', async () => {
    const stubClient: ISlackClient = {
      initializeClient: () => {},
      searchMessages: async () => {
        return {
          isSuccess: true,
          query: '',
          messages: {
            totalResultCount: 0,
            matches: [],
            paging: { count: 0, totalResultCount: 0, pageNumber: 1, totalPageCount: 1 },
          },
        };
      },
      channelName: async () => 'channel',
      // @ts-ignore
      conversationsReplies: async () => ({ ok: true, messages: [] }),
    };

    const service = new SearchService(stubClient, new LoggingService());

    await expect(service.getThreadReplies({ channelId: 'C1', threadTs: '' })).rejects.toThrow(
      /threadTs/
    );
  });

  it('Slack API に conversations.replies を呼び出す（親メッセージは parent に分離される）', async () => {
    let calledWith: any = null;

    const stubClient: any = {
      initializeClient: () => {},
      searchMessages: async () => {
        return {
          isSuccess: true,
          query: '',
          messages: {
            totalResultCount: 0,
            matches: [],
            paging: { count: 0, totalResultCount: 0, pageNumber: 1, totalPageCount: 1 },
          },
        };
      },
      channelName: async () => 'channel',
      conversationsReplies: async (opts: any) => {
        calledWith = opts;
        return {
          ok: true,
          messages: [
            { ts: '123', text: 'parent' },
            { ts: '124', text: 'reply' },
          ],
        };
      },
    };

    const service = new SearchService(stubClient, new LoggingService());

    const res = await service.getThreadReplies({ channelId: 'C1', threadTs: '123' });

    expect(calledWith).not.toBeNull();
    expect(calledWith.channel).toBe('C1');
    expect(calledWith.ts).toBe('123');
    // 親は parent に分離され、messages には返信のみが入る
    expect(res.parent).toBeDefined();
    expect(res.parent!.text).toBe('parent');
    expect(res.replies.length).toBe(1);
    expect(res.replies[0]!.text).toBe('reply');
  });

  it('conversations.replies のページネーションをサポートする（既定は 1 ページのみ返す）', async () => {
    const calls: any[] = [];
    const stubClient: any = {
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

    const service = new SearchService(stubClient, new LoggingService());

    const res = await service.getThreadReplies({ channelId: 'C1', threadTs: '100' });

    expect(calls.length).toBe(1);
    // 既定で 1 ページのみ返すため、リプライは空、nextCursor と hasMore が返る
    expect(res.parent!.text).toBe('p1');
    expect(res.replies.map((m: any) => m.text)).toEqual([]);
    expect(res.nextCursor).toBe('c1');
    expect(res.hasMore).toBe(true);
  });

  it('メッセージを Message 型にマッピングし、編集/削除フラグを付与する（親は parent に分離）', async () => {
    const stubClient: any = {
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
      conversationsReplies: async () => ({
        ok: true,
        messages: [
          { ts: '1609459200.000000', text: 'original', user: 'U1', username: 'alice' },
          {
            ts: '1609459300.000000',
            text: 'edited',
            user: 'U2',
            username: 'bob',
            edited: { user: 'U2', ts: '1609459350.000000' },
          },
          { ts: '1609459400.000000', subtype: 'message_deleted', text: '', user: 'U3' },
        ],
      }),
    };

    const service = new SearchService(stubClient, new LoggingService());

    const res = await service.getThreadReplies({
      channelId: 'C1',
      threadTs: '1609459200.000000',
      order: 'oldest',
    });

    // parent が分離され、messages には返信のみが入る
    expect(res.parent).toBeDefined();
    expect(res.parent!.timestamp).toMatch(/2021-01-01T00:00:00/);

    expect(res.replies.length).toBe(2);
    const [m1, m2] = res.replies;
    expect(m1!.isEdited).toBe(true);
    expect(m1!.editedTimestamp).toMatch(/2021-01-01T00:02:30/);
    expect(m2!.isDeleted).toBe(true);
  });

  it('order パラメータで並び替えを制御する（親は分離される）', async () => {
    const stubClient: any = {
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
      conversationsReplies: async () => ({
        ok: true,
        messages: [
          { ts: '100', text: 'parent' },
          { ts: '150', text: 'a' },
          { ts: '200', text: 'b' },
        ],
      }),
    };

    const service = new SearchService(stubClient, new LoggingService());

    const resNewest = await service.getThreadReplies({
      channelId: 'C1',
      threadTs: '100',
      order: 'newest',
    });
    expect(resNewest.replies.map((m: any) => m.ts)).toEqual(['200', '150']);

    const resOldest = await service.getThreadReplies({
      channelId: 'C1',
      threadTs: '100',
      order: 'oldest',
    });
    expect(resOldest.replies.map((m: any) => m.ts)).toEqual(['150', '200']);
  });

  it('リプライ用の型と検索結果用の型が異なることを検証する（score が含まれない）', async () => {
    const stubClient: any = {
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
      conversationsReplies: async () => ({ ok: true, messages: [{ ts: '2', text: 'reply' }] }),
    };

    const service = new SearchService(stubClient, new LoggingService());

    const res = await service.getThreadReplies({ channelId: 'C1', threadTs: '1' });

    // 検索結果のメッセージにあるはずの score フィールドがリプライには含まれていない
    expect((res.replies[0] as any).score).toBeUndefined();
  });

  it('成功時にメトリクス（成功・レイテンシ）とページネーションを記録する', async () => {
    const stubClient: any = {
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
      conversationsReplies: async () => ({
        ok: true,
        messages: [{ ts: '100', text: 'p1' }],
        response_metadata: { next_cursor: 'c1' },
      }),
    };

    const loggingService = new LoggingService();
    const service = new SearchService(stubClient, loggingService);

    await service.getThreadReplies({ channelId: 'C1', threadTs: '100' });

    const stats = loggingService.searchRequestStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.successfulRequests).toBe(1);
    expect(stats.paginationEvents).toBe(1);
    expect(stats.averageLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('レート制限エラー時はログとメトリクスを記録してエラーを返す', async () => {
    const stubClient: any = {
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
        throw new Error('レート制限エラー');
      },
    };

    const loggingService = new LoggingService();
    const service = new SearchService(stubClient, loggingService);

    await expect(service.getThreadReplies({ channelId: 'C1', threadTs: '100' })).rejects.toThrow();

    const stats = loggingService.searchRequestStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.failedRequests).toBe(1);
    expect(stats.rateLimitEvents).toBe(1);
  });

  // --- Error cases: NotFound / Authentication / Authorization ---
  it('channel_not_found エラーが発生した場合はエラーを返しログに記録する', async () => {
    const stubClient: any = {
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
        throw new Error('channel_not_found');
      },
    };

    const loggingService = new LoggingService();
    const service = new SearchService(stubClient, loggingService);

    await expect(service.getThreadReplies({ channelId: 'C1', threadTs: '200' })).rejects.toThrow(
      /channel_not_found/
    );

    // エラーがログに含まれていることを確認（spy を使用）
    await expect(service.getThreadReplies({ channelId: 'C1', threadTs: '200' })).rejects.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls.join(' ')).toContain('channel_not_found');
  });

  it('認証エラーが発生した場合は AUTH_ERROR をログに記録する', async () => {
    const stubClient: any = {
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
        throw new Error('invalid_auth');
      },
    };

    const loggingService = new LoggingService();
    const service = new SearchService(stubClient, loggingService);

    await expect(service.getThreadReplies({ channelId: 'C1', threadTs: '300' })).rejects.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls.join(' ')).toContain('[AUTH_ERROR]');
    expect(errorSpy.mock.calls.join(' ')).toContain('invalid_auth');
  });

  it('権限エラー（not_in_channel）発生時はエラーを返しログに記録する', async () => {
    const stubClient: any = {
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
        throw new Error('not_in_channel');
      },
    };

    const loggingService = new LoggingService();
    const service = new SearchService(stubClient, loggingService);

    await expect(service.getThreadReplies({ channelId: 'C1', threadTs: '400' })).rejects.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls.join(' ')).toContain('not_in_channel');
  });
});
