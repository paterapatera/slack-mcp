import type { SlackSearchOptions, SlackSearchResponse, SlackMessage } from './slack-api-client.js'
import { SlackAPIClient } from './slack-api-client.js'
import { LoggingService } from './logging-service.js'

/**
 * ISlackClient
 * Slack クライアントの抽象インターフェース
 */
export interface ISlackClient {
  initializeClient(token: string): void
  searchMessages(options: SlackSearchOptions): Promise<SlackSearchResponse>
  channelName(channelId: string): Promise<string>
}

/**
 * SlackBoltAdapter
 * 既存の `SlackAPIClient` をラップして `ISlackClient` を実装するアダプタ
 */
export class SlackBoltAdapter implements ISlackClient {
  private client: SlackAPIClient

  constructor(loggingService?: LoggingService, client?: SlackAPIClient) {
    this.client = client ?? new SlackAPIClient(loggingService)
  }

  initializeClient(token: string): void {
    return this.client.initializeClient(token)
  }

  async searchMessages(options: SlackSearchOptions): Promise<SlackSearchResponse> {
    return await this.client.searchMessages(options)
  }

  async channelName(channelId: string): Promise<string> {
    return await this.client.channelName(channelId)
  }
}
