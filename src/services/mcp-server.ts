import { McpServer as SDKMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Implementation } from "@modelcontextprotocol/sdk/types.js";
import { ConfigService, ConfigError } from "./config-service.js";
import { SlackAPIClient } from "./slack-api-client.js";
import { SearchService, SearchOptions, SearchResult } from "./search-service.js";
import { LoggingService } from "./logging-service.js";
import { z } from "zod";

/**
 * MCP サーバーのラッパークラス
 * MCP プロトコル仕様に準拠した実装を提供
 */
export class McpServer {
  private _sdkServer: SDKMcpServer;
  private _transport: StdioServerTransport | null = null;
  private _slackClient: SlackAPIClient;
  private _searchService: SearchService | null = null;
  private _config: ReturnType<typeof ConfigService.load> | null = null;
  private _loggingService: LoggingService;

  /**
   * 基盤となる SDK の Server インスタンス
   */
  get server() {
    return this._sdkServer.server;
  }

  /**
   * 現在接続されている Transport インスタンス
   */
  get transport(): StdioServerTransport | null {
    return this._transport;
  }

  /**
   * MCP サーバーを初期化する
   * @param serverInfo サーバー情報（名前、バージョンなど）
   */
  constructor(serverInfo: Implementation) {
    this._sdkServer = new SDKMcpServer(serverInfo);
    this._loggingService = new LoggingService();
    this._slackClient = new SlackAPIClient(this._loggingService);
  }

  /**
   * 起動時の初期化フローを実行する
   * - Config Service の load() と validate() を実行し、環境変数を検証
   * - Slack API Client の initialize(token) を実行し、Slack API への接続を確認
   * - search_messages ツールを登録
   * - 起動時エラーをキャッチし、統一エラーハンドリング戦略に基づき起動を中止
   * @throws {ConfigError} 環境変数が不足している場合
   * @throws {Error} Slack API クライアントの初期化に失敗した場合
   */
  async start(): Promise<void> {
    try {
      // 1. 環境変数の読み込みと検証
      const config = ConfigService.load();
      ConfigService.validate(config);
      this._config = config;

      // 2. Slack API Client の初期化
      this._slackClient.initialize(config.slackUserToken);

      // 3. Search Service の初期化
      this._searchService = new SearchService(
        this._slackClient,
        this._loggingService
      );

      // 4. search_messages ツールを登録
      this.registerSearchMessagesTool();

      // 5. stdio transport に接続
      this._transport = new StdioServerTransport();
      await this._sdkServer.connect(this._transport);
    } catch (error) {
      // 起動時エラーをキャッチし、起動を中止
      if (error instanceof ConfigError) {
        // 環境変数エラーの場合はそのまま throw
        throw error;
      } else if (error instanceof Error) {
        // Slack API 初期化エラーなどの場合はそのまま throw
        throw error;
      } else {
        // 予期しないエラー
        throw new Error(
          `エラー: サーバーの起動に失敗しました。\n${String(error)}`
        );
      }
    }
  }

  /**
   * search_messages ツールを登録する
   */
  private registerSearchMessagesTool(): void {
    if (!this._searchService || !this._config) {
      throw new Error("SearchService または Config が初期化されていません");
    }

    // ツールの入力スキーマを定義
    const inputSchema = z.object({
      query: z.string().describe("検索クエリ"),
      limit: z.number().optional().describe("検索結果の最大件数"),
    });

    // ツールを登録
    // ツールハンドラーは async 関数として実装されているため、
    // MCP SDK が自動的に複数のリクエストを並行して処理する
    this._sdkServer.registerTool(
      "search_messages",
      {
        description: "Slack ワークスペース内のメッセージを検索します",
        inputSchema: inputSchema,
      },
      async (args) => {
        try {
          // ツールハンドラー: MCP リクエストを受け取り、検索を実行
          // このハンドラーは async 関数であるため、複数のリクエストが並行して処理される
          const searchOptions: SearchOptions = {
            query: args.query as string,
            limit: args.limit as number | undefined,
            channelIds: this._config?.slackChannelIds,
            teamId: this._config?.slackTeamId,
          };

          // Search Service の searchMessages() を呼び出し
          // 非同期処理により、複数の検索リクエストを並行して処理できる
          const result = await this._searchService!.searchMessages(searchOptions);

          // 検索結果を MCP レスポンス形式に変換
          return {
            messages: result.messages,
            total: result.total,
            hasMore: result.hasMore,
          };
        } catch (error) {
          // 予期しないエラーをキャッチし、適切なエラーレスポンスに変換
          // MCP SDK が自動的にエラーレスポンスを生成するため、ここではログに記録
          this._loggingService.logError(
            error,
            "search_messages ツールの実行中にエラーが発生しました"
          );

          // エラーを再スローして、MCP SDK が適切なエラーレスポンスを返すようにする
          // MCP SDK は -32603 (Internal error) を返す
          throw error;
        }
      }
    );
  }

  /**
   * stdio transport に接続し、サーバーを開始する
   * @param transport StdioServerTransport インスタンス（省略時は新規作成）
   */
  async connect(transport?: StdioServerTransport): Promise<void> {
    if (transport) {
      this._transport = transport;
    } else {
      this._transport = new StdioServerTransport();
    }
    await this._sdkServer.connect(this._transport);
  }


  /**
   * サーバーを閉じる
   */
  async close(): Promise<void> {
    await this._sdkServer.close();
    this._transport = null;
  }
}
