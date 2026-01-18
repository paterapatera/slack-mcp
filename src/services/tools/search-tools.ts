import { McpServer as SDKMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SearchService, SearchOptions } from '../search-service.js';
import type { Config } from '../config-service.js';
import { LoggingService } from '../logging-service.js';

export function registerSearchTools(
  sdkServer: SDKMcpServer,
  searchService: SearchService,
  config: Config,
  loggingService: LoggingService
): void {
  const searchInputSchema = z.object({
    query: z.string().describe('検索クエリ'),
    maxResultCount: z.number().optional().describe('検索結果の最大件数'),
  });

  sdkServer.registerTool(
    'search_messages',
    {
      description: 'Slack ワークスペース内のメッセージを検索します',
      inputSchema: searchInputSchema,
    },
    async (args) => {
      try {
        const typedArgs = args as { query: string; maxResultCount?: number };
        const searchOptions: SearchOptions = {
          query: typedArgs.query,
          maxResultCount: typedArgs.maxResultCount,
          channelIds: config?.slackChannelIds,
          teamId: config?.slackTeamId,
        };

        const searchResult = await searchService.searchMessages(searchOptions);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  messages: searchResult.messages,
                  total: searchResult.totalResultCount,
                  hasMore: searchResult.hasMoreResults,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: unknown) {
        loggingService.logError(error, 'search_messages ツールの実行中にエラーが発生しました');
        throw error;
      }
    }
  );

  const getThreadSchema = z.object({
    channelId: z.string().describe('チャンネルID'),
    threadTs: z.string().describe('スレッド親の ts'),
    limit: z.number().optional().describe('取得件数の上限'),
    cursor: z.string().optional().describe('ページネーショントークン'),
    order: z.enum(['oldest', 'newest']).optional().describe('並び順'),
  });

  sdkServer.registerTool(
    'get_thread_replies',
    {
      description: 'スレッドの返信を取得します',
      inputSchema: getThreadSchema,
    },
    async (args) => {
      const typedArgs = args as {
        channelId: string;
        threadTs: string;
        limit?: number;
        cursor?: string;
        order?: 'oldest' | 'newest';
      };
      const result = await searchService.getThreadReplies({
        channelId: typedArgs.channelId,
        threadTs: typedArgs.threadTs,
        limit: typedArgs.limit,
        cursor: typedArgs.cursor,
        order: typedArgs.order,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
