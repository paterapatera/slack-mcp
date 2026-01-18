/**
 * IMetricsService
 * 検索リクエストの統計情報を管理するためのインターフェース
 */
export interface IMetricsService {
  recordSuccess(): void;
  recordFailure(): void;
  recordLatency(latencyMs: number): void;
  recordRateLimitEvent(): void;
  recordPaginationEvent(): void;
  getStats(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
    averageLatencyMs: number;
    latencyPercentiles: { p50: number; p99: number };
    rateLimitEvents: number;
    paginationEvents: number;
  };
}

/**
 * MetricsService
 * 検索リクエストの統計情報の実装（元: SearchStatistics）
 */
export class MetricsService implements IMetricsService {
  /** パーセンテージ計算の乗数
   * 成功率をパーセンテージで計算する際に使用（例: 0.5 → 50%）
   */
  private static readonly PERCENTAGE_MULTIPLIER = 100;
  /** 小数点の桁数（成功率の表示精度） */
  private static readonly DECIMAL_PLACES = 2;
  /** 小数点の丸め係数
   * 成功率を小数点第2位まで表示するために使用
   */
  private static readonly DECIMAL_ROUNDING_FACTOR = Math.pow(10, MetricsService.DECIMAL_PLACES);

  private stats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    latencies: number[];
    rateLimitEvents: number;
    paginationEvents: number;
  } = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    latencies: [],
    rateLimitEvents: 0,
    paginationEvents: 0,
  };

  /**
   * 検索成功を記録する
   */
  recordSuccess(): void {
    this.stats.totalRequests++;
    this.stats.successfulRequests++;
  }

  /**
   * 検索失敗を記録する
   */
  recordFailure(): void {
    this.stats.totalRequests++;
    this.stats.failedRequests++;
  }

  /**
   * レイテンシ（ミリ秒）を記録する
   */
  recordLatency(latencyMs: number): void {
    this.stats.latencies.push(latencyMs);
  }

  /**
   * レート制限イベントを記録する
   */
  recordRateLimitEvent(): void {
    this.stats.rateLimitEvents++;
  }

  /**
   * ページネーション利用イベントを記録する
   */
  recordPaginationEvent(): void {
    this.stats.paginationEvents++;
  }

  /**
   * 検索リクエストの統計情報を取得する
   * @returns 検索リクエストの統計情報
   */
  getStats(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
    averageLatencyMs: number;
    latencyPercentiles: { p50: number; p99: number };
    rateLimitEvents: number;
    paginationEvents: number;
  } {
    const latencyStats = this.calculateLatencyStats();

    return {
      totalRequests: this.stats.totalRequests,
      successfulRequests: this.stats.successfulRequests,
      failedRequests: this.stats.failedRequests,
      successRate: this.calculateSuccessRate(),
      averageLatencyMs: latencyStats.average,
      latencyPercentiles: { p50: latencyStats.p50, p99: latencyStats.p99 },
      rateLimitEvents: this.stats.rateLimitEvents,
      paginationEvents: this.stats.paginationEvents,
    };
  }

  /**
   * 成功率をパーセンテージで計算する
   * @returns 成功率（小数点第2位まで、0-100）
   */
  private calculateSuccessRate(): number {
    // 総リクエスト数が 0 の場合は成功率 0% を返す（ゼロ除算回避）
    if (this.stats.totalRequests === 0) {
      return 0;
    }

    // 成功率を計算: (成功数 / 総数) × 100
    const successRatePercentage =
      (this.stats.successfulRequests / this.stats.totalRequests) *
      MetricsService.PERCENTAGE_MULTIPLIER;

    // 小数点第2位までに丸める
    const roundedRate =
      Math.round(successRatePercentage * MetricsService.DECIMAL_ROUNDING_FACTOR) /
      MetricsService.DECIMAL_ROUNDING_FACTOR;

    return roundedRate;
  }

  /**
   * recorded latencies から平均とパーセンタイルを計算する
   */
  private calculateLatencyStats(): { average: number; p50: number; p99: number } {
    const latencies = [...this.stats.latencies].sort((a, b) => a - b);

    if (latencies.length === 0) {
      return { average: 0, p50: 0, p99: 0 };
    }

    const sum = latencies.reduce((a, b) => a + b, 0);
    const average = Math.round(sum / latencies.length);

    const p50Index = Math.max(
      0,
      Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.5) - 1)
    );
    const p99Index = Math.max(
      0,
      Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.99) - 1)
    );
    const p50 = latencies[p50Index] ?? 0;
    const p99 = latencies[p99Index] ?? 0;

    return { average, p50, p99 };
  }
}
