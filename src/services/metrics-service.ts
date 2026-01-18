/**
 * IMetricsService
 * 検索リクエストの統計情報を管理するためのインターフェース
 */
export interface IMetricsService {
  recordSuccess(): void
  recordFailure(): void
  getStats(): {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    successRate: number
  }
}

/**
 * MetricsService
 * 検索リクエストの統計情報の実装（元: SearchStatistics）
 */
export class MetricsService implements IMetricsService {
  /** パーセンテージ計算の乗数
   * 成功率をパーセンテージで計算する際に使用（例: 0.5 → 50%）
   */
  private static readonly PERCENTAGE_MULTIPLIER = 100
  /** 小数点の桁数（成功率の表示精度） */
  private static readonly DECIMAL_PLACES = 2
  /** 小数点の丸め係数
   * 成功率を小数点第2位まで表示するために使用
   */
  private static readonly DECIMAL_ROUNDING_FACTOR = Math.pow(
    10,
    MetricsService.DECIMAL_PLACES
  )

  private stats: {
    totalRequests: number
    successfulRequests: number
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
    totalRequests: number
    successfulRequests: number
    failedRequests: number
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
      MetricsService.PERCENTAGE_MULTIPLIER

    // 小数点第2位までに丸める
    const roundedRate =
      Math.round(successRatePercentage * MetricsService.DECIMAL_ROUNDING_FACTOR) /
      MetricsService.DECIMAL_ROUNDING_FACTOR

    return roundedRate
  }
}
