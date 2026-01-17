/**
 * 検索リクエストの統計情報を管理する
 * LoggingService の責務を分離し、統計累積ロジックを独立させる
 */
export class SearchStatistics {
  /** パーセンテージ計算の乗数
   * 成功率をパーセンテージで計算する際に使用（例: 0.5 → 50%）
   */
  private static readonly PERCENTAGE_MULTIPLIER = 100
  /** 小数点の桁数（成功率の表示精度） */
  private static readonly DECIMAL_PLACES = 2
  /** 小数点の丸め係数
   * 成功率を小数点第2位まで表示するために使用
   */
  private static readonly DECIMAL_ROUNDING_FACTOR = Math.pow(10, SearchStatistics.DECIMAL_PLACES)

  /** 検索リクエストの統計情報 */
  private stats: {
    /** 総リクエスト数 */
    totalRequests: number
    /** 成功リクエスト数 */
    successfulRequests: number
    /** 失敗リクエスト数 */
    failedRequests: number
  } = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
  }

  /**
   * 検索成功を記録する
   */
  recordSuccess(): void {
    this.stats.totalRequests++
    this.stats.successfulRequests++
  }

  /**
   * 検索失敗を記録する
   */
  recordFailure(): void {
    this.stats.totalRequests++
    this.stats.failedRequests++
  }

  /**
   * 検索リクエストの統計情報を取得する
   * @returns 検索リクエストの統計情報
   */
  getStats(): {
    /** 総リクエスト数 */
    totalRequests: number
    /** 成功リクエスト数 */
    successfulRequests: number
    /** 失敗リクエスト数 */
    failedRequests: number
    /** 成功率（パーセンテージ） */
    successRate: number
  } {
    return {
      ...this.stats,
      successRate: this.calculateSuccessRate(),
    }
  }

  /**
   * 成功率をパーセンテージで計算する
   * @returns 成功率（小数点第2位まで、0-100）
   */
  private calculateSuccessRate(): number {
    // 総リクエスト数が 0 の場合は成功率 0% を返す（ゼロ除算回避）
    if (this.stats.totalRequests === 0) {
      return 0
    }

    // 成功率を計算: (成功数 / 総数) × 100
    const successRatePercentage =
      (this.stats.successfulRequests / this.stats.totalRequests) *
      SearchStatistics.PERCENTAGE_MULTIPLIER

    // 小数点第2位までに丸める
    const roundedRate =
      Math.round(successRatePercentage * SearchStatistics.DECIMAL_ROUNDING_FACTOR) /
      SearchStatistics.DECIMAL_ROUNDING_FACTOR

    return roundedRate
  }
}

/**
 * ログ記録サービス
 * 統一エラーハンドリング戦略に基づき、エラーと重要なイベントをログに記録する
 */
export class LoggingService {
  /** 検索リクエストの統計情報を管理 */
  private searchStatistics: SearchStatistics = new SearchStatistics()

  /**
   * エラーをログに記録する
   * 統一エラーハンドリング戦略に基づき、エラーの種類、発生箇所、コンテキスト情報を含める
   * @param error エラーオブジェクト
   * @param context エラーが発生したコンテキスト情報
   */
  logError(error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    // トークン情報などの機密情報は含めない
    console.error(`[ERROR] ${context}`)
    console.error(`エラーメッセージ: ${errorMessage}`)
    if (errorStack) {
      console.error(`スタックトレース: ${errorStack}`)
    }
  }

  /**
   * 認証エラーをログに記録する
   * @param error エラーオブジェクト
   * @param context エラーが発生したコンテキスト情報
   */
  logAuthenticationError(error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error(`[AUTH_ERROR] ${context}`)
    console.error(`エラーメッセージ: ${errorMessage}`)
    console.error(
      '認証エラーが発生しました。SLACK_USER_TOKEN が有効で、必要なスコープが付与されていることを確認してください。'
    )
  }

  /**
   * API エラーをログに記録する
   * @param error エラーオブジェクト
   * @param context エラーが発生したコンテキスト情報
   */
  logAPIError(error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error(`[API_ERROR] ${context}`)
    console.error(`エラーメッセージ: ${errorMessage}`)
  }

  /**
   * レート制限エラーをログに記録する
   * @param error エラーオブジェクト
   * @param context エラーが発生したコンテキスト情報
   * @param retryAttempt リトライ試行回数
   */
  logRateLimitError(error: unknown, context: string, retryAttempt: number): void {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // MCP サーバーは stdout に JSON-RPC メッセージのみを出力する必要があるため、
    // ログは stderr に出力する
    console.error(`[RATE_LIMIT_ERROR] ${context}`)
    console.error(`エラーメッセージ: ${errorMessage}`)
    console.error(`リトライ試行回数: ${retryAttempt}`)
    console.error('レート制限エラーが発生しました。リトライを実行します。')
  }

  /**
   * 検索リクエストの成功を記録する
   * @param query 検索クエリ
   * @param resultCount 検索結果数
   * @param statistics 統計情報を管理するインスタンス（オプション）
   */
  logSearchRequestSuccess(query: string, resultCount: number, statistics?: SearchStatistics): void {
    const stats = statistics ?? this.searchStatistics
    stats.recordSuccess()

    // MCP サーバーは stdout に JSON-RPC メッセージのみを出力する必要があるため、
    // ログは stderr に出力する
    console.error(`[SEARCH_SUCCESS] クエリ: "${query}", 結果数: ${resultCount}`)
  }

  /**
   * 検索リクエストの失敗を記録する
   * @param query 検索クエリ
   * @param error エラーオブジェクト
   * @param statistics 統計情報を管理するインスタンス（オプション）
   */
  logSearchRequestFailure(query: string, error: unknown, statistics?: SearchStatistics): void {
    const stats = statistics ?? this.searchStatistics
    stats.recordFailure()

    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error(`[SEARCH_FAILURE] クエリ: "${query}"`)
    console.error(`エラーメッセージ: ${errorMessage}`)
  }

  /**
   * 検索リクエストの統計情報を取得する
   * @param statistics 統計情報を管理するインスタンス（オプション）
   * @returns 検索リクエストの統計情報
   */
  searchRequestStats(statistics?: SearchStatistics) {
    const stats = statistics ?? this.searchStatistics
    return stats.getStats()
  }
}
