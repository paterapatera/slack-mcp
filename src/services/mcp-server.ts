import { McpServer as SDKMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { ConfigService, ConfigError, IConfigService, Config } from './config-service.js';
import { SlackAPIClient } from './slack-api-client.js';
import type { ISlackClient } from './slack-client-adapter.js';
import { registerSearchTools } from './tools/search-tools.js';
import { SearchService, SearchOptions, SearchResult } from './search-service.js';
import { LoggingService } from './logging-service.js';
import { z } from 'zod';

/**
 * MCP サーバーのラッパークラス
 * MCP プロトコル仕様に準拠した実装を提供
 */
export class McpServer {
  /** 基盤となる SDK の Server インスタンス */
  private sdkServer: SDKMcpServer;
  /** 現在接続されている Transport インスタンス */
  private transportInstance: StdioServerTransport | null;
  /** Slack API クライアント (抽象) */
  private slackClient: ISlackClient;
  /** 検索サービス */
  private searchService: SearchService | null;
  /** 設定情報 */
  private config: Config | null;
  /** 設定サービス（注入可能） */
  private configService: IConfigService;
  /** ログ記録サービス */
  private loggingService: LoggingService;

  /**
   * 基盤となる SDK の Server インスタンス
   */
  get server() {
    return this.sdkServer.server;
  }

  /**
   * 現在接続されている Transport インスタンス
   */
  get transport(): StdioServerTransport | null {
    return this.transportInstance;
  }

  /**
   * MCP サーバーを初期化する
   * @param serverInfo サーバー情報（名前、バージョンなど）
   */
  constructor(
    serverInfo: Implementation,
    configService?: IConfigService,
    slackClient?: ISlackClient
  ) {
    this.sdkServer = new SDKMcpServer(serverInfo);
    this.loggingService = new LoggingService();
    this.slackClient = slackClient ?? new SlackAPIClient(this.loggingService);
    this.transportInstance = null;
    this.searchService = null;
    this.config = null;
    this.configService = configService ?? new ConfigService();
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
      const slackConfig = this.loadAndValidateConfig();
      this.initializeServices(slackConfig);
      this.registerTools();
      await this.connectTransport();
    } catch (error: unknown) {
      if (error instanceof ConfigError) {
        throw error;
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`エラー: サーバーの起動に失敗しました。\n${String(error)}`);
    }
  }

  /**
   * 設定を読み込み検証する
   */
  private loadAndValidateConfig(): Config {
    const slackConfig = this.configService.loadConfig();
    this.configService.validateConfig(slackConfig);
    return slackConfig;
  }

  /**
   * サービスを初期化する
   */
  private initializeServices(config: Config): void {
    this.config = config;
    this.slackClient.initializeClient(config.slackUserToken);
    this.searchService = new SearchService(this.slackClient, this.loggingService);
  }

  /**
   * ツールを登録する
   */
  private registerTools(): void {
    if (!this.config || !this.searchService) {
      throw new Error('サービスが初期化されていません');
    }
    registerSearchTools(this.sdkServer, this.searchService, this.config, this.loggingService);
  }

  /**
   * Transport に接続する
   */
  private async connectTransport(): Promise<void> {
    this.transportInstance = new StdioServerTransport();
    await this.sdkServer.connect(this.transportInstance);
  }

  /**
   * stdio transport に接続し、サーバーを開始する
   * @param transport StdioServerTransport インスタンス（省略時は新規作成）
   */
  async connectToTransport(transport?: StdioServerTransport): Promise<void> {
    this.transportInstance = transport ?? new StdioServerTransport();
    await this.sdkServer.connect(this.transportInstance);
  }

  /**
   * サーバーを閉じる
   */
  async closeServer(): Promise<void> {
    await this.sdkServer.close();
    this.transportInstance = null;
  }
}
