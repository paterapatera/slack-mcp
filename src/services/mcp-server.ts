import { McpServer as SDKMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Implementation } from '@modelcontextprotocol/sdk/types.js'
import { ConfigService, ConfigError, IConfigService, Config } from './config-service.js'
import { SlackAPIClient } from './slack-api-client.js'
import { SearchService, SearchOptions, SearchResult } from './search-service.js'
import { LoggingService } from './logging-service.js'
import { z } from 'zod'

/**
 * MCP サーバーのラッパークラス
 * MCP プロトコル仕様に準拠した実装を提供
 */
export class McpServer {
  /** 基盤となる SDK の Server インスタンス */
  private sdkServer: SDKMcpServer
  /** 現在接続されている Transport インスタンス */
  private transportInstance: StdioServerTransport | null
  /** Slack API クライアント */
  private slackClient: SlackAPIClient
  /** 検索サービス */
  private searchService: SearchService | null
  /** 設定情報 */
  private config: Config | null
  /** 設定サービス（注入可能） */
  private configService: IConfigService
  /** ログ記録サービス */
  private loggingService: LoggingService

  /**
   * 基盤となる SDK の Server インスタンス
   */
  get server() {
    return this.sdkServer.server
  }

  /**
   * 現在接続されている Transport インスタンス
   */
  get transport(): StdioServerTransport | null {
    return this.transportInstance
  }

  /**
   * MCP サーバーを初期化する
   * @param serverInfo サーバー情報（名前、バージョンなど）
   */
  constructor(serverInfo: Implementation, configService?: IConfigService) {
    this.sdkServer = new SDKMcpServer(serverInfo)
    this.loggingService = new LoggingService()
    this.slackClient = new SlackAPIClient(this.loggingService)
    this.transportInstance = null
    this.searchService = null
    this.config = null
    this.configService = configService ?? new ConfigService()
  }

  /**
   * 起動時の初期化フローを実行する
   * - Config Service の loadConfig() と validateConfig() を実行し、環境変数を検証
   * - Slack API Client の initializeClient(token) を実行し、Slack API への接続を確認
   * - search_messages ツールを登録
   * - 起動時エラーをキャッチし、統一エラーハンドリング戦略に基づき起動を中止
   * @throws {ConfigError} 環境変数が不足している場合
   * @throws {Error} Slack API クライアントの初期化に失敗した場合
   */
  async startServer(): Promise<void> {
    try {
      const slackConfig = this.loadAndValidateConfig()
      this.initializeServices(slackConfig)
      this.registerTools()
      await this.connectTransport()
    } catch (error: unknown) {
      if (error instanceof ConfigError) {
        throw error
      }
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`エラー: サーバーの起動に失敗しました。\n${String(error)}`)
    }
  }

  /**
   * 設定を読み込み検証する
   */
  private loadAndValidateConfig(): Config {
    const slackConfig = this.configService.loadConfig()
    this.configService.validateConfig(slackConfig)
    return slackConfig
  }

  /**
   * サービスを初期化する
   */
  private initializeServices(config: Config): void {
    this.config = config
    this.slackClient.initializeClient(config.slackUserToken)
    this.searchService = new SearchService(this.slackClient, this.loggingService)
  }

  /**
   * ツールを登録する
   */
  private registerTools(): void {
    if (!this.config || !this.searchService) {
      throw new Error('サービスが初期化されていません')
    }
    this.createSearchMessagesTool(this.searchService, this.config, this.loggingService)
  }

  /**
   * Transport に接続する
   */
  private async connectTransport(): Promise<void> {
    this.transportInstance = new StdioServerTransport()
    await this.sdkServer.connect(this.transportInstance)
  }

  /**
   * stdio transport に接続し、サーバーを開始する
   * @param transport StdioServerTransport インスタンス（省略時は新規作成）
   */
  async connectToTransport(transport?: StdioServerTransport): Promise<void> {
    this.transportInstance = transport ?? new StdioServerTransport()
    await this.sdkServer.connect(this.transportInstance)
  }

  /**
   * サーバーを閉じる
   */
  async closeServer(): Promise<void> {
    await this.sdkServer.close()
    this.transportInstance = null
  }

  /** search_messages ツール名 */
  private static readonly TOOL_NAME_SEARCH_MESSAGES = 'search_messages'

  /**
   * search_messages ツールを登録する
   * @param searchService 検索サービスインスタンス
   * @param config 設定情報
   * @param loggingService ログ記録サービスインスタンス
   */
  private createSearchMessagesTool(
    searchService: SearchService,
    config: Config,
    loggingService: LoggingService
  ): void {
    const inputSchema = this.createSearchToolSchema()

    // ツールハンドラーは async 関数として実装されているため、
    // MCP SDK が自動的に複数のリクエストを並行して処理する
    this.sdkServer.registerTool(
      McpServer.TOOL_NAME_SEARCH_MESSAGES,
      {
        description: 'Slack ワークスペース内のメッセージを検索します',
        inputSchema: inputSchema,
      },
      async (args) => {
        const result = await this.executeSearchToolHandler(
          args,
          searchService,
          config,
          loggingService
        )
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }
    )
  }

  /**
   * search_messages ツールのスキーマを作成する
   */
  private createSearchToolSchema() {
    return z.object({
      query: z.string().describe('検索クエリ'),
      maxResultCount: z.number().optional().describe('検索結果の最大件数'),
    })
  }

  /**
   * search_messages ツールのハンドラーを実行する
   */
  private async executeSearchToolHandler(
    args: unknown,
    searchService: SearchService,
    config: Config,
    loggingService: LoggingService
  ): Promise<{ messages: any[]; total: number; hasMore: boolean }> {
    try {
      const searchOptions = this.buildSearchOptions(args, config)
      const searchResult = await searchService.searchMessages(searchOptions)

      return this.formatSearchResponse(searchResult)
    } catch (error: unknown) {
      // catch ブロックで捕捉されるエラーは unknown 型
      // MCP SDK が自動的にエラーレスポンスを生成するため、ここではログに記録
      loggingService.logError(error, 'search_messages ツールの実行中にエラーが発生しました')

      // MCP SDK は -32603 (Internal error) を返す
      throw error
    }
  }

  /**
   * ツール入力引数から検索オプションを生成する
   */
  private buildSearchOptions(
    args: unknown,
    config: ReturnType<typeof ConfigService.loadConfig>
  ): SearchOptions {
    // Zod スキーマで検証済みだが、TypeScript の型推論が
    // 完全に一致しないため、型アサーションを使用
    // args.query は z.string() で検証済みなので string として扱える
    // args.maxResultCount は z.number().optional() で検証済みなので
    // number | undefined として扱える
    const typedArgs = args as { query: string; maxResultCount?: number }

    return {
      query: typedArgs.query,
      maxResultCount: typedArgs.maxResultCount,
      // config はメソッドパラメータから取得
      // slackChannelIds と slackTeamId はオプショナルプロパティのため、
      // オプショナルチェーン演算子を使用して undefined の可能性を考慮
      // 非nullアサーション演算子は使用しない（undefined が有効な値であるため）
      channelIds: config?.slackChannelIds,
      teamId: config?.slackTeamId,
    }
  }

  /**
   * 検索結果をMCPレスポンス形式にフォーマットする
   */
  private formatSearchResponse(searchResult: SearchResult): {
    messages: any[]
    total: number
    hasMore: boolean
  } {
    return {
      messages: searchResult.messages,
      total: searchResult.totalResultCount,
      hasMore: searchResult.hasMoreResults,
    }
  }
}
