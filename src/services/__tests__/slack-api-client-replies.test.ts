import { describe, it, expect } from 'bun:test';
import { SlackAPIClient } from '../slack-api-client';
import { LoggingService } from '../logging-service';

describe('SlackAPIClient.conversationsReplies', () => {
  it('app が初期化されていない場合はエラーを投げる', async () => {
    const client = new SlackAPIClient(new LoggingService());
    await expect(client.conversationsReplies({ channel: 'C1', ts: '123' })).rejects.toThrow(
      /初期化されていません/
    );
  });

  it('下位 API に正しいパラメータで委譲し、レスポンスを返す', async () => {
    const client = new SlackAPIClient(new LoggingService());
    let calledWith: any = null;
    (client as any).app = {
      client: {
        conversations: {
          replies: async (opts: any) => {
            calledWith = opts;
            return {
              ok: true,
              messages: [{ ts: '1', text: 'hello' }],
              response_metadata: { next_cursor: 'c1' },
            };
          },
        },
      },
    };

    const res = await client.conversationsReplies({
      channel: 'C1',
      ts: '1',
      limit: 10,
      cursor: 'c0',
    });
    expect(calledWith).not.toBeNull();
    expect(calledWith.channel).toBe('C1');
    expect(calledWith.ts).toBe('1');
    expect(calledWith.limit).toBe(10);
    expect(calledWith.cursor).toBe('c0');
    expect(res.messages.length).toBe(1);
    expect(res.response_metadata?.next_cursor).toBe('c1');
  });

  it('レート制限時は retry-after を参照してリトライする（ヘッダー指定）', async () => {
    const client = new SlackAPIClient(new LoggingService());
    let count = 0;
    (client as any).app = {
      client: {
        conversations: {
          replies: async () => {
            count++;
            if (count === 1) {
              return {
                ok: false,
                error: 'ratelimited',
                statusCode: 429,
                headers: { 'retry-after': '0' },
              };
            }
            return { ok: true, messages: [{ ts: '1', text: 'after' }] };
          },
        },
      },
    };

    const res = await client.conversationsReplies({ channel: 'C1', ts: '1' });
    expect(res.messages[0].text).toBe('after');
    expect(count).toBeGreaterThan(1);
  });

  it('malformed retry-after header は無視され、指数バックオフが使用される', async () => {
    const client = new SlackAPIClient(new LoggingService());
    let count = 0;
    (client as any).app = {
      client: {
        conversations: {
          replies: async () => {
            count++;
            if (count === 1) {
              return {
                ok: false,
                error: 'ratelimited',
                statusCode: 429,
                headers: { 'retry-after': 'abc' },
              };
            }
            return { ok: true, messages: [{ ts: '1', text: 'after' }] };
          },
        },
      },
    };

    const res = await client.conversationsReplies({ channel: 'C1', ts: '1' });
    expect(res.messages[0].text).toBe('after');
    expect(count).toBeGreaterThan(1);
  });

  it('例外として 429 を投げる場合もリトライする', async () => {
    const client = new SlackAPIClient(new LoggingService());
    let count = 0;
    (client as any).app = {
      client: {
        conversations: {
          replies: async () => {
            count++;
            if (count === 1) {
              const err: any = new Error('ratelimited');
              err.statusCode = 429;
              throw err;
            }
            return { ok: true, messages: [{ ts: '2', text: 'ok' }] };
          },
        },
      },
    };

    const res = await client.conversationsReplies({ channel: 'C1', ts: '2' });
    expect(res.messages[0].text).toBe('ok');
    expect(count).toBeGreaterThan(1);
  });

  it('レート制限が継続する場合は最終的にエラーをスローする', async () => {
    const client = new SlackAPIClient(new LoggingService());
    (client as any).app = {
      client: {
        conversations: {
          replies: async () => ({
            ok: false,
            error: 'ratelimited',
            statusCode: 429,
            headers: { 'retry-after': '0' },
          }),
        },
      },
    };

    // テストの実行時間を短縮するため、一時的に MAX_RETRIES と BASE_DELAY_MS を短くする
    const origMax = (SlackAPIClient as any).MAX_RETRIES;
    const origBase = (SlackAPIClient as any).BASE_DELAY_MS;
    (SlackAPIClient as any).MAX_RETRIES = 1;
    (SlackAPIClient as any).BASE_DELAY_MS = 0;

    try {
      await expect(client.conversationsReplies({ channel: 'C1', ts: '1' })).rejects.toThrow(
        /リトライ回数の上限/
      );
    } finally {
      // 元に戻す
      (SlackAPIClient as any).MAX_RETRIES = origMax;
      (SlackAPIClient as any).BASE_DELAY_MS = origBase;
    }
  });
});
