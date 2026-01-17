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
  score?: number;
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
   * チャンネルIDからチャンネル名を取得する
   * @param channelIds チャンネルIDの配列
   * @returns チャンネル名の配列
   */
  private async getChannelNames(channelIds: string[]): Promise<string[]> {
    const channelNames = await Promise.all(
      channelIds.map(async (channelId) => {
        try {
          const channelName = await this.slackClient.getChannelName(channelId);
          return channelName;
        } catch (error) {
          // チャンネル名の取得に失敗した場合、エラーを throw
          this.loggingService!.logError(
            error,
            `チャンネル名の取得に失敗しました: ${channelId}`
          );
          throw new Error(
            `エラー: チャンネルID "${channelId}" のチャンネル名を取得できませんでした。\nチャンネルIDが正しいか、アクセス権限があるか確認してください。`
          );
        }
      })
    );
    return channelNames;
  }

  /**
   * 単一チャンネル用のクエリを構築する
   * Slack API の search.messages では in: の後にチャンネル名が必要
   */
  private buildQueryWithChannel(baseQuery: string, channelName: string): string {
    return `${baseQuery} in:${channelName}`;
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

    const baseQuery = options.query.trim();

    // チャンネルIDが指定されていない場合、全チャンネルで検索
    if (!options.channelIds || options.channelIds.length === 0) {
      return await this.searchInChannels(baseQuery, [], options);
    }

    // 有効なチャンネルIDのみをフィルタリング
    const validChannelIds = options.channelIds.filter(
      (id) => id && id.trim() !== ""
    );

    if (validChannelIds.length === 0) {
      return await this.searchInChannels(baseQuery, [], options);
    }

    // チャンネルIDからチャンネル名を取得
    const channelNames = await this.getChannelNames(validChannelIds);

    // 各チャンネルで個別に検索して結果をマージ
    // Slack API の search.messages は OR 演算子をサポートしていないため、
    // 各チャンネルに対して個別に検索を実行する必要がある
    return await this.searchInChannels(baseQuery, channelNames, options);
  }

  /**
   * 指定されたチャンネルで検索を実行し、結果をマージする
   * @param baseQuery ベースクエリ
   * @param channelNames チャンネル名の配列（空の場合は全チャンネルで検索）
   * @param options 検索オプション
   * @returns マージされた検索結果
   */
  private async searchInChannels(
    baseQuery: string,
    channelNames: string[],
    options: SearchOptions
  ): Promise<SearchResult> {
    // チャンネルが指定されていない場合、全チャンネルで検索
    if (channelNames.length === 0) {
      const slackOptions: SlackSearchOptions = {
        query: baseQuery,
        count: options.limit,
        teamId: options.teamId,
      };

      try {
        const response = await this.slackClient.searchMessages(slackOptions);
        return this.processSearchResponse(response, options.query);
      } catch (error) {
        this.loggingService!.logSearchRequestFailure(options.query, error);
        throw error;
      }
    }

    // 単一チャンネルの場合
    if (channelNames.length === 1) {
      const query = this.buildQueryWithChannel(baseQuery, channelNames[0]);
      const slackOptions: SlackSearchOptions = {
        query,
        count: options.limit,
        teamId: options.teamId,
      };

      try {
        const response = await this.slackClient.searchMessages(slackOptions);
        return this.processSearchResponse(response, options.query);
      } catch (error) {
        this.loggingService!.logSearchRequestFailure(options.query, error);
        throw error;
      }
    }

    // 複数チャンネルの場合、各チャンネルで個別に検索して結果をマージ
    // Slack API は OR 演算子をサポートしていないため、個別に検索する必要がある
    const searchPromises = channelNames.map(async (channelName) => {
      const query = this.buildQueryWithChannel(baseQuery, channelName);
      const slackOptions: SlackSearchOptions = {
        query,
        count: options.limit, // 各チャンネルでの検索結果数制限
        teamId: options.teamId,
      };

      try {
        const response = await this.slackClient.searchMessages(slackOptions);
        return response;
      } catch (error) {
        // 個別のチャンネルでの検索失敗はログに記録するが、他のチャンネルの結果は返す
        this.loggingService!.logError(
          error,
          `チャンネル "${channelName}" での検索に失敗しました`
        );
        return null;
      }
    });

    const responses = await Promise.all(searchPromises);

    // 結果をマージ
    const allMessages: Message[] = [];
    let total = 0;
    let hasMore = false;

    for (const response of responses) {
      if (response && response.ok) {
        const messages = response.messages.matches.map((match) => ({
          text: match.text,
          timestamp: this.convertTimestampToISO8601(match.ts),
          channelId: match.channel.id,
          channelName: match.channel.name,
          userId: match.user,
          userName: match.username,
          score: match.score,
        }));
        allMessages.push(...messages);
        total += response.messages.total;
        if (
          response.messages.paging &&
          response.messages.paging.page < response.messages.paging.pages
        ) {
          hasMore = true;
        }
      }
    }

    // score でソート（高い順）
    // score が undefined の場合は 0 として扱う
    allMessages.sort((a, b) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      return scoreB - scoreA; // 高い順
    });

    // limit が指定されている場合、結果を制限
    const limitedMessages = options.limit
      ? allMessages.slice(0, options.limit)
      : allMessages;

    const result = {
      messages: limitedMessages,
      total,
      hasMore: hasMore || (options.limit ? allMessages.length > options.limit : false),
    };

    // 検索リクエストの成功をログに記録
    this.loggingService!.logSearchRequestSuccess(
      options.query,
      result.messages.length
    );

    return result;
  }

  /**
   * Slack API レスポンスを内部形式に変換する
   * @param response Slack API レスポンス
   * @param originalQuery 元の検索クエリ
   * @returns 検索結果
   */
  private processSearchResponse(
    response: any,
    originalQuery: string
  ): SearchResult {
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
      score: match.score,
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
      originalQuery,
      result.messages.length
    );

    return result;
  }
}
