import { describe, it, expect, beforeEach } from 'bun:test';
import { MetricsService } from '../metrics-service';

describe('MetricsService', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  it('recordSuccess が総リクエスト数と成功数を増やす', () => {
    // Arrange

    // Act
    metrics.recordSuccess();
    metrics.recordSuccess();

    // Assert
    const stats = metrics.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.successfulRequests).toBe(2);
    expect(stats.failedRequests).toBe(0);
  });

  it('recordFailure が総リクエスト数と失敗数を増やす', () => {
    metrics.recordFailure();

    const stats = metrics.getStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.successfulRequests).toBe(0);
    expect(stats.failedRequests).toBe(1);
  });

  it('成功率をパーセンテージで返す（小数点第2位で丸め）', () => {
    // 3 回中 1 回成功 → 33.33...
    metrics.recordFailure();
    metrics.recordFailure();
    metrics.recordSuccess();

    const stats = metrics.getStats();
    expect(stats.successRate).toBeCloseTo(33.33, 2);
  });

  it('リクエストがない場合は成功率は 0 を返す', () => {
    const stats = metrics.getStats();
    expect(stats.successRate).toBe(0);
  });

  it('recordLatency が平均とパーセンタイルを計算する', () => {
    metrics.recordLatency(100);
    metrics.recordLatency(200);
    metrics.recordLatency(300);

    const stats = metrics.getStats();
    expect(stats.averageLatencyMs).toBeCloseTo(200, 0);
    expect(stats.latencyPercentiles.p50).toBe(200);
    expect(stats.latencyPercentiles.p99).toBe(300);
  });

  it('recordPaginationEvent と recordRateLimitEvent を記録する', () => {
    metrics.recordPaginationEvent();
    metrics.recordRateLimitEvent();
    metrics.recordRateLimitEvent();

    const stats = metrics.getStats();
    expect(stats.paginationEvents).toBe(1);
    expect(stats.rateLimitEvents).toBe(2);
  });
});
