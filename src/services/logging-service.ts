/**
 * ログ記録サービス
 * 統一エラーハンドリング戦略に基づき、エラーと重要なイベントをログに記録する
 */
export class LoggingService {
  private searchRequestStats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
  } = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
    };

  /**
   * エラーをログに記録する
   * 統一エラーハンドリング戦略に基づき、エラーの種類、発生箇所、コンテキスト情報を含める
   * @param error エラーオブジェクト
   * @param context エラーが発生したコンテキスト情報
   */
  logError(error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // 統一エラーハンドリング戦略に基づき、エラーをログに記録
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

    // 認証エラーの詳細をログに記録（トークン情報は含めない）
    console.error(`[AUTH_ERROR] ${context}`);
    console.error(`エラーメッセージ: ${errorMessage}`);
    console.error(
      "認証エラーが発生しました。SLACK_USER_TOKEN が有効で、必要なスコープが付与されていることを確認してください。"
    );
  }

  /**
   * API エラーをログに記録する
   * @param error エラーオブジェクト
   * @param context エラーが発生したコンテキスト情報
   */
  logAPIError(error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // API エラーの詳細をログに記録
    console.error(`[API_ERROR] ${context}`);
    console.error(`エラーメッセージ: ${errorMessage}`);
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
    retryAttempt: number
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // レート制限エラーの詳細とリトライ試行回数をログに記録
    // MCP サーバーは stdout に JSON-RPC メッセージのみを出力する必要があるため、
    // ログは stderr に出力する
    console.error(`[RATE_LIMIT_ERROR] ${context}`);
    console.error(`エラーメッセージ: ${errorMessage}`);
    console.error(`リトライ試行回数: ${retryAttempt}`);
    console.error("レート制限エラーが発生しました。リトライを実行します。");
  }

  /**
   * 検索リクエストの成功を記録する
   * @param query 検索クエリ
   * @param resultCount 検索結果数
   */
  logSearchRequestSuccess(query: string, resultCount: number): void {
    this.searchRequestStats.totalRequests++;
    this.searchRequestStats.successfulRequests++;

    // 検索リクエストの成功をログに記録
    // MCP サーバーは stdout に JSON-RPC メッセージのみを出力する必要があるため、
    // ログは stderr に出力する
    console.error(
      `[SEARCH_SUCCESS] クエリ: "${query}", 結果数: ${resultCount}`
    );
  }

  /**
   * 検索リクエストの失敗を記録する
   * @param query 検索クエリ
   * @param error エラーオブジェクト
   */
  logSearchRequestFailure(query: string, error: unknown): void {
    this.searchRequestStats.totalRequests++;
    this.searchRequestStats.failedRequests++;

    const errorMessage = error instanceof Error ? error.message : String(error);

    // 検索リクエストの失敗をログに記録
    console.error(`[SEARCH_FAILURE] クエリ: "${query}"`);
    console.error(`エラーメッセージ: ${errorMessage}`);
  }

  /**
   * 検索リクエストの統計情報を取得する
   * @returns 検索リクエストの統計情報
   */
  getSearchRequestStats(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
  } {
    const successRate =
      this.searchRequestStats.totalRequests > 0
        ? (this.searchRequestStats.successfulRequests /
          this.searchRequestStats.totalRequests) *
        100
        : 0;

    return {
      ...this.searchRequestStats,
      successRate: Math.round(successRate * 100) / 100, // 小数点第2位まで
    };
  }
}
