import { SlackAPIClient, SlackSearchOptions } from "./slack-api-client";
import { LoggingService } from "./logging-service.js";

export interface SearchOptions {
  query: string;
  channelIds?: string[];
  limit?: number;
  teamId?: string;
}

export interface Message {
  text: string;
  timestamp: string;
  channelId: string;
  channelName?: string;
  userId: string;
  userName?: string;
  threadTs?: string;
}

export interface SearchResult {
  messages: Message[];
  total: number;
  hasMore: boolean;
}

export class SearchService {
  constructor(
    private slackClient: SlackAPIClient,
    private loggingService?: LoggingService
  ) {
    this.loggingService = loggingService ?? new LoggingService();
  }

  /**
   * Slack タイムスタンプを ISO 8601 形式に変換する
   * @param ts Slack タイムスタンプ（例: "1508284197.000015"）
   * @returns ISO 8601 形式のタイムスタンプ（例: "2017-10-18T10:29:57.000Z"）
   */
  private convertTimestampToISO8601(ts: string): string {
    if (!ts || ts.trim() === "") {
      return "";
    }

    // Slack タイムスタンプは Unix タイムスタンプ（秒単位、小数点以下含む）
    const timestamp = parseFloat(ts);
    if (isNaN(timestamp)) {
      return ts; // 変換できない場合は元の値を返す
    }

    // ミリ秒に変換して Date オブジェクトを作成
    const date = new Date(timestamp * 1000);
    return date.toISOString();
  }

  /**
   * チャンネルIDをクエリに追加する
   */
  private buildQueryWithChannels(baseQuery: string, channelIds?: string[]): string {
    if (!channelIds || channelIds.length === 0) {
      return baseQuery;
    }

    // 有効なチャンネルIDのみをフィルタリング
    const validChannelIds = channelIds.filter((id) => id && id.trim() !== "");

    if (validChannelIds.length === 0) {
      return baseQuery;
    }

    // 複数のチャンネルIDがある場合、各チャンネルで検索するため
    // ここでは単一チャンネルの場合のみ実装（複数チャンネルは後で実装）
    if (validChannelIds.length === 1) {
      return `${baseQuery} in:${validChannelIds[0]}`;
    }

    // 複数のチャンネルIDがある場合、OR で結合
    // Slack API では in:channel1 OR in:channel2 の形式が使用可能
    const channelFilters = validChannelIds.map((id) => `in:${id}`).join(" OR ");
    return `${baseQuery} (${channelFilters})`;
  }

  /**
   * メッセージを検索する
   * @param options 検索オプション
   * @returns 検索結果
   * @throws {Error} 検索クエリが空の場合
   */
  async searchMessages(options: SearchOptions): Promise<SearchResult> {
    // 検索クエリの検証
    if (!options.query || options.query.trim() === "") {
      throw new Error(
        "エラー: 検索クエリが空です。\n検索クエリを指定してください。"
      );
    }

    // チャンネルIDによる検索範囲の制限
    const baseQuery = options.query.trim();
    const queryWithChannels = this.buildQueryWithChannels(
      baseQuery,
      options.channelIds
    );

    // 無効なチャンネルIDを検出（空文字列や空白のみ）
    if (options.channelIds) {
      const invalidChannelIds = options.channelIds.filter(
        (id) => !id || id.trim() === ""
      );
      if (invalidChannelIds.length > 0) {
        const error = new Error(
          `エラー: 無効なチャンネルIDが指定されました。\n有効なチャンネルIDを指定してください。\n無効なチャンネルID: ${invalidChannelIds.join(", ")}`
        );
        this.loggingService!.logError(
          error,
          `無効なチャンネルIDが検出されました: ${invalidChannelIds.join(", ")}`
        );
        throw error;
      }
    }

    // Slack API Client の検索オプションに変換
    const slackOptions: SlackSearchOptions = {
      query: queryWithChannels,
      count: options.limit,
      teamId: options.teamId,
    };

    try {
      // Slack API Client を呼び出して検索を実行
      const response = await this.slackClient.searchMessages(slackOptions);

      // エラーレスポンスの場合
      if (!response.ok && response.error) {
        // チャンネルIDが無効な場合のエラーハンドリング
        if (
          response.error.includes("channel_not_found") ||
          response.error.includes("invalid_channel")
        ) {
          const error = new Error(
            `エラー: 指定されたチャンネルIDが無効です。\n有効なチャンネルIDを指定してください。\nエラー詳細: ${response.error}`
          );
          this.loggingService!.logError(
            error,
            `無効なチャンネルIDが検出されました。エラー: ${response.error}`
          );
          throw error;
        }
        const error = new Error(
          `エラー: Slack API の検索に失敗しました。\n${response.error}`
        );
        this.loggingService!.logError(error, "Slack API の検索に失敗しました");
        throw error;
      }

      // 検索結果を内部形式に変換
      const messages: Message[] = response.messages.matches.map((match) => ({
        text: match.text,
        timestamp: this.convertTimestampToISO8601(match.ts),
        channelId: match.channel.id,
        channelName: match.channel.name,
        userId: match.user,
        userName: match.username,
      }));

      const result = {
        messages,
        total: response.messages.total,
        hasMore:
          response.messages.paging !== undefined &&
          response.messages.paging.page < response.messages.paging.pages,
      };

      // 検索リクエストの成功をログに記録
      this.loggingService!.logSearchRequestSuccess(
        options.query,
        result.messages.length
      );

      return result;
    } catch (error) {
      // 検索リクエストの失敗をログに記録
      this.loggingService!.logSearchRequestFailure(options.query, error);
      throw error;
    }
  }
}
