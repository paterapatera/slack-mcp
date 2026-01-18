import { SlackSearchOptions, SlackSearchResponse, SlackMessage } from './slack-api-client';
import { ISlackClient } from './slack-client-adapter.js';
import { LoggingService } from './logging-service.js';

// conversations.replies の最小限のレスポンス型定義
export type ConversationsRepliesResponse = {
  ok?: boolean;
  messages?: any[];
  response_metadata?: { next_cursor?: string } | undefined;
};

/**
 * 検索オプション
 * メッセージ検索に使用するオプションを定義
 */
export interface SearchOptions {
  /** 検索クエリ */
  query: string;
  /** チャンネルIDの配列（オプション） */
  channelIds?: string[];
  /** 検索結果の最大件数（オプション） */
  maxResultCount?: number;
  /** チームID（オプション） */
  teamId?: string;
}

/**
 * メッセージ
 * 検索結果として返されるメッセージ情報を定義
 */
export interface Message {
  /** メッセージテキスト */
  text: string;
  /** タイムスタンプ（ISO 8601形式） */
  timestamp: string;
  /** チャンネルID */
  channelId: string;
  /** チャンネル名（オプション） */
  channelName?: string;
  /** ユーザーID */
  userId: string;
  /** ユーザー名（オプション） */
  userName?: string;
  /** スレッドタイムスタンプ（オプション） */
  threadTs?: string;
  /** 検索関連度スコア（オプション） */
  score?: number;
}

/**
 * スレッド内メッセージ（リプライ）の型
 */
export interface ThreadMessage {
  text: string;
  /** ISO 8601 */
  timestamp: string;
  /** Slack の原本 ts */
  ts: string;
  channelId: string;
  channelName?: string;
  userId?: string;
  userName?: string;
  threadTs?: string;
  isEdited?: boolean;
  isDeleted?: boolean;
  editedTimestamp?: string;
}

/**
 * 検索結果
 * メッセージ検索の結果を定義
 */
export interface SearchResult {
  /** 検索結果のメッセージ配列 */
  messages: Message[];
  /** 検索結果の総件数 */
  totalResultCount: number;
  /** さらに結果があるかどうか */
  hasMoreResults: boolean;
}

/**
 * 検索サービス
 * Slack メッセージの検索機能を提供
 */
export class SearchService {
  /** 秒からミリ秒への変換係数
   * JavaScript の Date コンストラクタはミリ秒単位を期待するため、
   * Unix タイムスタンプ（秒単位）をミリ秒に変換する際に使用
   */
  private static readonly MILLISECONDS_PER_SECOND = 1000;
  /** メッセージのデフォルトスコア値
   * ソート時にスコアが undefined の場合に使用
   */
  private static readonly DEFAULT_MESSAGE_SCORE = 0;
  /** Slack API エラーコード: チャンネルが見つからない（channel_not_found） */
  private static readonly ERROR_CODE_CHANNEL_NOT_FOUND = 'channel_not_found';
  /** Slack API エラーコード: 無効なチャンネル（invalid_channel） */
  private static readonly ERROR_CODE_INVALID_CHANNEL = 'invalid_channel';

  constructor(
    /** Slack API クライアント */
    private slackClient: ISlackClient,
    /** ログ記録サービス（オプション） */
    private loggingService: LoggingService = new LoggingService()
  ) {}

  /**
   * Slack タイムスタンプを ISO 8601 形式に変換する
   * @param slackTimestamp Slack タイムスタンプ（例: "1508284197.000015"）
   * @returns ISO 8601 形式のタイムスタンプ（例: "2017-10-18T10:29:57.000Z"）
   */
  private static timestampToISO8601(slackTimestamp: string): string {
    // タイムスタンプのパース試行
    const timestampInSeconds = this.tryParseSlackTimestamp(slackTimestamp);
    if (timestampInSeconds === null) {
      return '';
    }

    // JavaScript の Date コンストラクタはミリ秒単位を期待するため、
    // 秒単位のタイムスタンプをミリ秒に変換
    return new Date(timestampInSeconds * SearchService.MILLISECONDS_PER_SECOND).toISOString();
  }

  /**
   * Slack タイムスタンプをパースして秒単位の数値に変換する
   * @param slackTimestamp Slack タイムスタンプ（文字列）
   * @returns パース成功時は秒単位の数値、失敗時はnull
   */
  private static tryParseSlackTimestamp(slackTimestamp: string): number | null {
    // 空の文字列は null を返す
    if (!slackTimestamp || slackTimestamp.trim() === '') {
      return null;
    }

    // Slack タイムスタンプは Unix タイムスタンプ（秒単位、小数点以下含む）
    const timestampInSeconds = parseFloat(slackTimestamp);

    // パース失敗の場合（NaN の場合）、null を返す
    if (isNaN(timestampInSeconds)) {
      return null;
    }

    return timestampInSeconds;
  }

  /**
   * チャンネルIDからチャンネル名を取得する
   * @param channelIds チャンネルIDの配列
   * @returns チャンネル名の配列
   * @throws {Error} チャンネル名の取得に失敗した場合（チャンネルIDが無効、アクセス権限がないなど）
   */
  private async channelNames(channelIds: string[]): Promise<string[]> {
    // 個別の取得失敗を許容して成功分のみを返す（部分失敗許容）
    // Promise.allSettled を使用して各取得の結果を集計する
    const results = await Promise.allSettled(
      channelIds.map(async (channelId) => {
        return this.slackClient.channelName(channelId);
      })
    );

    const successfulNames: string[] = [];
    const failedChannelIds: string[] = [];

    results.forEach((r, index) => {
      if (r.status === 'fulfilled') {
        successfulNames.push(r.value);
      } else {
        const failedId = channelIds[index];
        if (failedId) {
          failedChannelIds.push(failedId);
        }
        // ログに詳細を残す（観測性確保）
        this.loggingService.logError(r.reason, `チャンネル名の取得に失敗しました: ${failedId}`);
      }
    });

    // 全て失敗した場合は空配列を返して全チャンネル検索へフォールバック
    if (successfulNames.length === 0) {
      return [];
    }

    return successfulNames;
  }

  /**
   * 単一チャンネル用のクエリを構築する
   * Slack API の search.messages では in: の後にチャンネル名が必要
   */
  private static slackSearchQueryWithChannel(baseQuery: string, channelName: string): string {
    return `${baseQuery} in:${channelName}`;
  }

  /**
   * メッセージを検索する
   * @param options 検索オプション
   * @returns 検索結果
   * @throws {Error} 検索クエリが空の場合
   *
   * @example
   * // 全チャンネルで検索
   * const result = await searchService.searchMessages({
   *   query: "test query"
   * });
   *
   * @example
   * // 特定のチャンネルで検索（最大10件）
   * const result = await searchService.searchMessages({
   *   query: "test query",
   *   channelIds: ["C1234567890", "C0987654321"],
   *   maxResultCount: 10,
   *   teamId: "T1234567890"
   * });
   */
  async searchMessages(options: SearchOptions): Promise<SearchResult> {
    if (!options.query || options.query.trim() === '') {
      throw new Error('エラー: 検索クエリが空です。\n検索クエリを指定してください。');
    }
    if (options.channelIds) {
      const invalidChannelIds = options.channelIds.filter((id) => !id || id.trim() === '');
      if (invalidChannelIds.length > 0) {
        const error = new Error(
          `エラー: 無効なチャンネルIDが指定されました。\n有効なチャンネルIDを指定してください。\n無効なチャンネルID: ${invalidChannelIds.join(', ')}`
        );
        // コンストラクタで loggingService が未指定の場合でも
        // 新しい LoggingService インスタンスが設定されるため、非nullアサーション演算子を使用
        this.loggingService.logError(
          error,
          `無効なチャンネルIDが検出されました: ${invalidChannelIds.join(', ')}`
        );
        throw error;
      }
    }

    const baseQuery = options.query.trim();

    // チャンネルIDが指定されていない場合、全チャンネルで検索
    if (!options.channelIds || options.channelIds.length === 0) {
      return await this.searchInChannels(baseQuery, [], options);
    }

    const validChannelIds = options.channelIds.filter((id) => id && id.trim() !== '');

    if (validChannelIds.length === 0) {
      return await this.searchInChannels(baseQuery, [], options);
    }

    const channelNames = await this.channelNames(validChannelIds);

    // 各チャンネルで個別に検索して結果をマージ
    // Slack API の search.messages は OR 演算子をサポートしていないため、
    // 各チャンネルに対して個別に検索を実行する必要がある
    return await this.searchInChannels(baseQuery, channelNames, options);
  }

  /**
   * スレッドの返信を取得する
   * @param param0 channelId と threadTs を必須とする
   * @returns { messages: any[] }
   */
  // 単一ページ分の conversations.replies の戻り値（必要最小限の型）

  async getThreadReplies({
    channelId,
    threadTs,
    limit,
    cursor,
    order,
  }: {
    channelId: string;
    threadTs: string;
    limit?: number;
    cursor?: string;
    order?: 'oldest' | 'newest';
  }): Promise<{
    parent?: ThreadMessage;
    replies: ThreadMessage[];
    nextCursor?: string | null;
    hasMore?: boolean;
  }> {
    // 入力の検証は専用メソッドに委譲
    this.validateThreadRequest(channelId, threadTs);

    const start = Date.now();

    try {
      // 1ページのみ取得（大規模スレッドの自動集約は行わない）
      const slackRes: ConversationsRepliesResponse = await this.fetchRepliesPage(
        channelId,
        threadTs,
        limit,
        cursor
      );

      const slackMessages = Array.isArray(slackRes?.messages) ? slackRes.messages : [];

      // Slack のメッセージを内部 Message 型にマッピング
      const mappedMessages = this.mapSlackMessages(slackMessages, channelId, threadTs);

      const nextCursor = slackRes?.response_metadata?.next_cursor ?? null;
      const hasMore = !!nextCursor;

      const end = Date.now();
      const latencyMs = end - start;

      // メトリクス・ログの記録は専用メソッドに委譲（ロギング失敗で主処理を壊さない）
      this.recordThreadMetrics(
        channelId,
        threadTs,
        mappedMessages.filter((m) => m.ts !== threadTs).length,
        nextCursor,
        latencyMs
      );

      // 親メッセージを分離する（存在する場合）
      const parent = mappedMessages.find((m) => m.ts === threadTs);
      let replies = mappedMessages.filter((m) => m.ts !== threadTs);

      // 並び替え（既定は oldest）
      replies = replies.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

      if (order === 'newest') {
        replies.reverse();
      }

      return { parent, replies, nextCursor, hasMore };
    } catch (error: unknown) {
      // エラーごとのログ記録はこれまでの挙動を維持
      const errMsg = error instanceof Error ? error.message : String(error);
      try {
        if (
          errMsg.includes('レート制限') ||
          errMsg.includes('ratelimit') ||
          errMsg.includes('429')
        ) {
          this.loggingService.logRateLimitError(error, 'getThreadReplies', 0);
        }

        if (
          errMsg.includes('invalid_auth') ||
          errMsg.includes('not_authed') ||
          errMsg.includes('token_revoked')
        ) {
          this.loggingService.logAuthenticationError(error, 'getThreadReplies');
        }

        if (errMsg.includes('not_in_channel')) {
          this.loggingService.logAPIError(error, 'getThreadReplies');
        }

        this.loggingService.logThreadRequestFailure(channelId, threadTs, error);
      } catch (logErr) {
        this.loggingService.logError(logErr, 'スレッド返信の失敗ログ記録に失敗しました');
      }

      this.loggingService.logError(
        error,
        `スレッド返信の取得に失敗しました: ${channelId} / ${threadTs}`
      );
      throw error;
    }
  }

  // リクエスト検証を分離して読みやすくする
  private validateThreadRequest(channelId: string, threadTs: string): void {
    if (!channelId || channelId.trim() === '') {
      const err = new Error('エラー: channelId が指定されていません');
      this.loggingService.logError(err, 'getThreadReplies のリクエスト検証に失敗しました');
      throw err;
    }

    if (!threadTs || threadTs.trim() === '') {
      const err = new Error('エラー: threadTs が指定されていません');
      this.loggingService.logError(err, 'getThreadReplies のリクエスト検証に失敗しました');
      throw err;
    }
  }

  // Slack API を呼び出す部分を分離（将来ページネーション等の拡張を容易にする）
  private async fetchRepliesPage(
    channelId: string,
    threadTs: string,
    limit?: number,
    cursor?: string
  ): Promise<ConversationsRepliesResponse> {
    return await this.slackClient.conversationsReplies({
      channel: channelId,
      ts: threadTs,
      limit,
      cursor,
    });
  }

  // Slack の生メッセージを内部型 ThreadMessage に変換
  private mapSlackMessages(messages: any[], channelId: string, threadTs: string): ThreadMessage[] {
    return messages.map((msg: any) => ({
      text: msg.text,
      timestamp: SearchService.timestampToISO8601(msg.ts),
      ts: msg.ts,
      channelId,
      channelName: undefined,
      userId: msg.user,
      userName: msg.username,
      threadTs: threadTs,
      isEdited: msg.edited !== undefined,
      editedTimestamp: msg.edited ? SearchService.timestampToISO8601(msg.edited.ts) : undefined,
      isDeleted: msg.subtype === 'message_deleted',
    }));
  }

  // メトリクス・ログの記録を分離（ロギング失敗は主処理を止めない）
  private recordThreadMetrics(
    channelId: string,
    threadTs: string,
    repliesCount: number,
    nextCursor: string | null,
    latencyMs: number
  ): void {
    try {
      this.loggingService.logThreadRequestSuccess(
        channelId,
        threadTs,
        repliesCount,
        undefined,
        latencyMs
      );
      if (nextCursor) {
        this.loggingService.logThreadPagination(channelId, threadTs, nextCursor);
      }
    } catch (logErr) {
      this.loggingService.logError(logErr, 'スレッド返信のメトリクス/ログ記録に失敗しました');
    }
  }

  /**
   * 指定されたチャンネルで検索を実行し、結果をマージする
   * channelNames が空配列の場合は全チャンネルで検索を実行する
   * @param baseQuery ベースクエリ
   * @param channelNames チャンネル名の配列（空配列の場合は全チャンネルで検索）
   * @param options 検索オプション
   * @param slackClient 検索に使用する SlackAPIClient インスタンス（オプション）
   * @returns マージされた検索結果
   */
  private async searchInChannels(
    baseQuery: string,
    channelNames: string[],
    options: SearchOptions
  ): Promise<SearchResult> {
    if (channelNames.length === 0) {
      return await this.searchSingleChannel(baseQuery, options, this.slackClient);
    }

    const responses = await this.searchMultipleChannels(baseQuery, channelNames, options);
    return this.mergeAndBuildResult(responses, baseQuery, options);
  }

  /**
   * 複数チャンネルで検索を実行する
   */
  private async searchMultipleChannels(
    baseQuery: string,
    channelNames: string[],
    options: SearchOptions
  ): Promise<(SlackSearchResponse | null)[]> {
    const searchPromises = channelNames.map(async (channelName) => {
      const slackOptions: SlackSearchOptions = {
        query: SearchService.slackSearchQueryWithChannel(baseQuery, channelName),
        maxResultCount: options.maxResultCount,
        teamId: options.teamId,
      };

      try {
        return await this.slackClient.searchMessages(slackOptions);
      } catch (error: unknown) {
        this.loggingService.logError(error, `チャンネル "${channelName}" での検索に失敗しました`);
        return null;
      }
    });

    return await Promise.all(searchPromises);
  }

  /**
   * 単一チャンネルで検索を実行する
   */
  private async searchSingleChannel(
    baseQuery: string,
    options: SearchOptions,
    client: ISlackClient
  ): Promise<SearchResult> {
    const slackOptions: SlackSearchOptions = {
      query: baseQuery,
      maxResultCount: options.maxResultCount,
      teamId: options.teamId,
    };

    try {
      const searchResponse = await client.searchMessages(slackOptions);
      return this.searchResponseToResult(searchResponse, options.query);
    } catch (error: unknown) {
      this.loggingService.logSearchRequestFailure(options.query, error);
      throw error;
    }
  }

  /**
   * 複数チャンネルの検索レスポンスをマージして検索結果を構築する
   */
  private mergeAndBuildResult(
    responses: (SlackSearchResponse | null)[],
    originalQuery: string,
    options: SearchOptions
  ): SearchResult {
    const validResponses = responses.filter((response) =>
      SearchService.isValidSearchResponse(response)
    );

    const sortedMessages = this.sortMessagesByScore(validResponses);
    const totalResultCount = this.calculateTotalResultCount(validResponses);
    const hasMoreResults = this.calculateHasMoreResults(
      validResponses,
      sortedMessages.length,
      options.maxResultCount
    );

    const searchResult = {
      messages: options.maxResultCount
        ? sortedMessages.slice(0, options.maxResultCount)
        : sortedMessages,
      totalResultCount,
      hasMoreResults,
    };

    this.loggingService.logSearchRequestSuccess(originalQuery, searchResult.messages.length);

    return searchResult;
  }

  /**
   * メッセージをスコアでソートする
   * @param responses 有効な検索レスポンスの配列
   * @returns ソート済みのメッセージ配列
   */
  private sortMessagesByScore(responses: SlackSearchResponse[]): Message[] {
    const allMessages = responses
      .flatMap((response) => this.convertSlackMatchesToMessages(response.messages.matches))
      .sort((a, b) => {
        const scoreA = a.score ?? SearchService.DEFAULT_MESSAGE_SCORE;
        const scoreB = b.score ?? SearchService.DEFAULT_MESSAGE_SCORE;
        return scoreB - scoreA;
      });

    return allMessages;
  }

  /**
   * 検索結果の総件数を計算する
   * @param responses 有効な検索レスポンスの配列
   * @returns 総件数
   */
  private calculateTotalResultCount(responses: SlackSearchResponse[]): number {
    return responses.reduce((sum, response) => sum + response.messages.totalResultCount, 0);
  }

  /**
   * さらに結果があるかどうかを判定する
   * ページング情報または最大結果数から判定
   * @param responses 有効な検索レスポンスの配列
   * @param allMessagesLength 全メッセージ数
   * @param maxResultCount 最大結果数（オプション）
   * @returns さらに結果がある場合 true
   */
  private calculateHasMoreResults(
    responses: SlackSearchResponse[],
    allMessagesLength: number,
    maxResultCount?: number
  ): boolean {
    const hasMoreResultsFromPaging = responses.some((response) =>
      this.hasMorePages(response.messages.paging)
    );

    if (hasMoreResultsFromPaging) {
      return true;
    }

    if (maxResultCount === undefined) {
      return false;
    }

    return allMessagesLength > maxResultCount;
  }

  /**
   * Slack API レスポンスを内部形式に変換する
   * @param searchResponse Slack API レスポンス
   * @param originalQuery 元の検索クエリ
   * @returns 検索結果
   *
   * @example
   * // 成功レスポンスの変換
   * const result = searchResponseToResult({
   *   isSuccess: true,
   *   messages: {
   *     totalResultCount: 5,
   *     matches: [...]
   *   }
   * }, "test query");
   *
   * @example
   * // エラーレスポンスの処理
   * // エラーの場合は例外を throw する
   */
  private searchResponseToResult(
    // Slack API のレスポンス型は SlackSearchResponse で表現可能
    // 実際のレスポンス構造は実行時に追加検証を行う
    searchResponse: SlackSearchResponse,
    originalQuery: string
  ): SearchResult {
    // レスポンスの基本的な整合性を検証する
    if (!searchResponse || searchResponse.isSuccess !== true) {
      // 明示的な error がある場合は従来ロジックで処理
      if (searchResponse && typeof searchResponse.error === 'string') {
        this.handleSearchResponseError(searchResponse.error);
      }

      this.loggingService.logError(
        new Error('無効な Slack レスポンス（isSuccess が true ではない）'),
        `searchResponse validation failed: ${originalQuery}`
      );
      throw new Error('エラー: Slack API のレスポンス形式が不正です。');
    }

    // メッセージ構造が期待通りであることを検証
    if (!Array.isArray(searchResponse?.messages?.matches)) {
      this.loggingService.logError(
        new Error('無効な Slack レスポンス（messages.matches が配列ではありません）'),
        `searchResponse validation failed: ${originalQuery}`
      );
      throw new Error('エラー: Slack API のレスポンス形式が不正です。');
    }

    // 成功レスポンスを内部形式に変換
    const searchResult = this.convertSearchResponseToResult(searchResponse, originalQuery);

    // ログに検索成功を記録
    this.loggingService.logSearchRequestSuccess(originalQuery, searchResult.messages.length);

    return searchResult;
  }

  /**
   * 検索レスポンスのエラーをハンドリングする
   * @param error エラーメッセージ
   * @throws {Error} エラーをログして例外を投げる
   */
  private handleSearchResponseError(error: string): void {
    // チャンネルIDが無効な場合のエラーハンドリング
    if (this.isInvalidChannelError(error)) {
      const errorObj = new Error(
        `エラー: 指定されたチャンネルIDが無効です。\n有効なチャンネルIDを指定してください。\nエラー詳細: ${error}`
      );
      // コンストラクタで loggingService が未指定の場合でも
      // 新しい LoggingService インスタンスが設定されるため、安全に呼び出す
      this.loggingService.logError(
        errorObj,
        `無効なチャンネルIDが検出されました。エラー: ${error}`
      );
      throw errorObj;
    }

    const errorObj = new Error(`エラー: Slack API の検索に失敗しました。\n${error}`);
    // コンストラクタで loggingService が未指定の場合でも
    // 新しい LoggingService インスタンスが設定されるため、安全に呼び出す
    this.loggingService.logError(errorObj, 'Slack API の検索に失敗しました');
    throw errorObj;
  }

  /**
   * 検索レスポンスを内部形式に変換する
   * @param searchResponse Slack API レスポンス
   * @param originalQuery 元の検索クエリ
   * @returns 検索結果
   */
  private convertSearchResponseToResult(
    searchResponse: SlackSearchResponse,
    originalQuery: string
  ): SearchResult {
    // messages.matches は上位で検証済みのはずだが、念のため安全にアクセスする
    const matches = Array.isArray(searchResponse?.messages?.matches)
      ? (searchResponse.messages.matches as SlackMessage[])
      : [];

    const messages = this.convertSlackMatchesToMessages(matches);

    const totalResultCount =
      typeof searchResponse?.messages?.totalResultCount === 'number'
        ? searchResponse.messages.totalResultCount
        : messages.length;

    const searchResult = {
      messages,
      totalResultCount,
      // ページング情報から hasMoreResults を判定
      // 現在のページ番号が総ページ数より小さい場合、次のページが存在する
      hasMoreResults: this.hasMorePages(searchResponse?.messages?.paging),
    };

    return searchResult;
  }

  /**
   * Slack API のメッセージマッチを内部形式の Message に変換する
   * @param matches Slack API のメッセージマッチ配列
   * @returns 内部形式の Message 配列
   */
  private convertSlackMatchesToMessages(matches?: SlackMessage[] | undefined): Message[] {
    return (matches ?? []).map((match: SlackMessage) => ({
      text: match.text ?? '',
      timestamp: SearchService.timestampToISO8601(match.ts ?? ''),
      channelId: match.channel?.id ?? '',
      channelName: match.channel?.name ?? '',
      userId: match.user ?? '',
      userName: match.username,
      score: match.score,
      // permalink から thread_ts を抽出して設定
      threadTs: this.extractThreadTsFromPermalink(match.permalink),
    }));
  }

  /**
   * permalink から thread_ts を抽出する
   * @param permalink Slack の permalink URL
   * @returns thread_ts の値、または undefined
   */
  private extractThreadTsFromPermalink(permalink?: string): string | undefined {
    if (!permalink) return undefined;
    try {
      const url = new URL(permalink);
      return url.searchParams.get('thread_ts') || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 検索レスポンスが有効かどうかを判定する
   * @param response 検索レスポンス
   * @returns 有効な検索レスポンスの場合 true
   */
  private static isValidSearchResponse(
    response: SlackSearchResponse | null
  ): response is SlackSearchResponse {
    return (
      response !== null &&
      response?.isSuccess === true &&
      response?.messages !== undefined &&
      Array.isArray(response.messages.matches)
    );
  }

  /**
   * ページング情報から次のページが存在するかどうかを判定する
   * @param paging ページング情報
   * @returns 次のページが存在する場合 true
   */
  private hasMorePages(paging: any): boolean {
    return paging !== undefined && paging.pageNumber < paging.totalPageCount;
  }

  /**
   * エラーメッセージが無効なチャンネルエラーを示しているかどうかを判定する
   * @param error エラーメッセージ
   * @returns 無効なチャンネルエラーの場合 true
   */
  private isInvalidChannelError(error: string): boolean {
    return (
      error.includes(SearchService.ERROR_CODE_CHANNEL_NOT_FOUND) ||
      error.includes(SearchService.ERROR_CODE_INVALID_CHANNEL)
    );
  }
}
