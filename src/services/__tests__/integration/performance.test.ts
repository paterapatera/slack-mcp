import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { McpServer } from '../../mcp-server';

const originalEnv = process.env;

describe('パフォーマンステスト', () => {
  let server: McpServer;

  beforeEach(() => {
    // テストごとに環境変数をクリア
    process.env = { ...originalEnv };
    server = new McpServer({
      name: 'slack-mcp',
      version: '1.0.0',
    });
  });

  afterEach(async () => {
    if (server) {
      await server.closeServer();
    }
    // 環境変数を元に戻す
    process.env = originalEnv;
  });

  describe('起動パフォーマンス', () => {
    beforeEach(() => {
      process.env.SLACK_USER_TOKEN =
        'xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx';
    });

    it('サーバー起動が 2 秒未満で完了する', async () => {
      // Arrange
      const start = performance.now();

      // Act
      await server.startServer();

      // Assert
      const elapsedMs = performance.now() - start;
      expect(elapsedMs).toBeLessThan(2000);
    });

    it('100 件の返信を返すシナリオで p99 が 3 秒以内であることを検証する', async () => {
      // Arrange: 100 件の返信を返す fake client を用意
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
          const messages = Array.from({ length: 101 }, (_, i) => ({ ts: `${i}`, text: `m${i}` }));
          return { ok: true, messages };
        },
      };

      const loggingService = new (await import('../../logging-service')).LoggingService();
      const { SearchService } = await import('../../search-service');
      const service = new SearchService(fakeClient, loggingService);

      // Act: 複数サンプルを収集して p99 を算出
      const samples: number[] = [];
      const SAMPLE_COUNT = 100;
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const start = performance.now();
        const res = await service.getThreadReplies({ channelId: 'C1', threadTs: '0' });
        samples.push(performance.now() - start);
        // 簡易検証で必要な個数は確保
        expect(res.replies.length).toBeGreaterThanOrEqual(100);
      }

      // Assert: p99 が閾値未満であること
      samples.sort((a, b) => a - b);
      const p99Index = Math.max(0, Math.ceil(0.99 * samples.length) - 1);
      const p99 = samples[p99Index];
      expect(p99).toBeLessThan(3000);
    });
  });
});
