import { IMetricsService, MetricsService } from './metrics-service.js';

/**
 * ログ記録サービス
 * 統一エラーハンドリング戦略に基づき、エラーと重要なイベントをログに記録する
 */
export class LoggingService {
  /** 検索リクエストの統計情報を管理 */
  private metrics: IMetricsService;

  constructor(metrics?: IMetricsService) {
    this.metrics = metrics ?? new MetricsService();
  }

  /**
   * エラーをログに記録する
   * 統一エラーハンドリング戦略に基づき、エラーの種類、発生箇所、コンテキスト情報を含める
   * @param error エラーオブジェクト
   * @param context エラーが発生したコンテキスト情報
   */
  logError(error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // トークン情報などの機密情報は含めない
    console.error(`[ERROR] ${context}`);
    console.error(`エラーメッセージ: ${errorMessage}`);
    if (errorStack) {
      console.error(`スタックトレース: ${errorStack}`);
    }
  }

  /**
   * 認証エラーをログに記録する
   * @param error エラーオブジェクト
   * @param context エラーが発生したコンテキスト情報
   */
  logAuthenticationError(error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[AUTH_ERROR] ${context}`);
    console.error(`エラーメッセージ: ${errorMessage}`);
    console.error(
      '認証エラーが発生しました。SLACK_USER_TOKEN が有効で、必要なスコープが付与されていることを確認してください。'
    );
  }

  /**
   * API エラーをログに記録する
   * @param error エラーオブジェクト
   * @param context エラーが発生したコンテキスト情報
   */
  logAPIError(error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[API_ERROR] ${context}`);
    console.error(`エラーメッセージ: ${errorMessage}`);
  }

  /**
   * デバッグ情報をログに記録する（開発時のみ有用）
   * @param context コンテキスト文字列
   * @param data 任意のデバッグデータ
   */
  logDebug(context: string, data: unknown): void {
    try {
      console.error(`[DEBUG] ${context}`);
      // JSON.stringify が失敗する可能性があるため try/catch を使う
      console.error(JSON.stringify(data, null, 2));
    } catch (err) {
      // JSON 化に失敗した場合でも簡易的に出力
      console.error(`[DEBUG] ${context} - (非表示データ)`);
    }
  }

  /**
   * レート制限エラーをログに記録する
   * @param error エラーオブジェクト
   * @param context エラーが発生したコンテキスト情報
   * @param retryAttempt リトライ試行回数
   */
  logRateLimitError(
    error: unknown,
    context: string,
    retryAttempt: number,
    statistics?: IMetricsService
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const stats = statistics ?? this.metrics;
    stats.recordRateLimitEvent();

    // MCP サーバーは stdout に JSON-RPC メッセージのみを出力する必要があるため、
    // ログは stderr に出力する
    console.error(`[RATE_LIMIT_ERROR] ${context}`);
    console.error(`エラーメッセージ: ${errorMessage}`);
    console.error(`リトライ試行回数: ${retryAttempt}`);
    console.error('レート制限エラーが発生しました。リトライを実行します。');
  }

  /**
   * 検索リクエストの成功を記録する
   * @param query 検索クエリ
   * @param resultCount 検索結果数
   * @param statistics 統計情報を管理するインスタンス（オプション）
   */
  logSearchRequestSuccess(query: string, resultCount: number, statistics?: IMetricsService): void {
    const stats = statistics ?? this.metrics;
    stats.recordSuccess();

    // MCP サーバーは stdout に JSON-RPC メッセージのみを出力する必要があるため、
    // ログは stderr に出力する
    console.error(`[SEARCH_SUCCESS] クエリ: "${query}", 結果数: ${resultCount}`);
  }

  /**
   * 検索リクエストの失敗を記録する
   * @param query 検索クエリ
   * @param error エラーオブジェクト
   * @param statistics 統計情報を管理するインスタンス（オプション）
   */
  logSearchRequestFailure(query: string, error: unknown, statistics?: IMetricsService): void {
    const stats = statistics ?? this.metrics;
    stats.recordFailure();

    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[SEARCH_FAILURE] クエリ: "${query}"`);
    console.error(`エラーメッセージ: ${errorMessage}`);
  }

  /**
   * 検索リクエストの統計情報を取得する
   * @param statistics 統計情報を管理するインスタンス（オプション）
   * @returns 検索リクエストの統計情報
   */
  searchRequestStats(statistics?: IMetricsService) {
    const stats = statistics ?? this.metrics;
    return stats.getStats();
  }

  /**
   * スレッド取得リクエストの成功を記録する
   * @param channelId チャンネルID
   * @param threadTs スレッドの親メッセージ ts
   * @param resultCount 取得した返信数
   * @param statistics 統計情報を管理するインスタンス（オプション）
   * @param latencyMs レイテンシ（ミリ秒、オプション）
   */
  logThreadRequestSuccess(
    channelId: string,
    threadTs: string,
    resultCount: number,
    statistics?: IMetricsService,
    latencyMs?: number
  ): void {
    const stats = statistics ?? this.metrics;
    stats.recordSuccess();
    if (typeof latencyMs === 'number') {
      stats.recordLatency(latencyMs);
    }

    console.error(
      `[THREAD_SUCCESS] チャンネル: ${channelId}, threadTs: ${threadTs}, 結果数: ${resultCount}${typeof latencyMs === 'number' ? `, レイテンシ: ${latencyMs}ms` : ''}`
    );
  }

  /**
   * スレッド取得リクエストの失敗を記録する
   */
  logThreadRequestFailure(
    channelId: string,
    threadTs: string,
    error: unknown,
    statistics?: IMetricsService
  ): void {
    const stats = statistics ?? this.metrics;
    stats.recordFailure();

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[THREAD_FAILURE] チャンネル: ${channelId}, threadTs: ${threadTs}`);
    console.error(`エラーメッセージ: ${errorMessage}`);
  }

  /**
   * スレッド取得でページネーションが使用されたことを記録する
   */
  logThreadPagination(
    channelId: string,
    threadTs: string,
    nextCursor: string,
    statistics?: IMetricsService
  ): void {
    const stats = statistics ?? this.metrics;
    stats.recordPaginationEvent();

    console.error(
      `[THREAD_PAGINATION] チャンネル: ${channelId}, threadTs: ${threadTs}, next_cursor: ${nextCursor}`
    );
  }
}
