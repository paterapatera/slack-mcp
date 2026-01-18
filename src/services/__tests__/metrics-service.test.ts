import { describe, it, expect, beforeEach } from 'bun:test'
import { MetricsService } from '../metrics-service'

describe('MetricsService', () => {
  let metrics: MetricsService

  beforeEach(() => {
    metrics = new MetricsService()
  })

  it('recordSuccess が総リクエスト数と成功数を増やす', () => {
    metrics.recordSuccess()
    metrics.recordSuccess()

    const stats = metrics.getStats()
    expect(stats.totalRequests).toBe(2)
    expect(stats.successfulRequests).toBe(2)
    expect(stats.failedRequests).toBe(0)
  })

  it('recordFailure が総リクエスト数と失敗数を増やす', () => {
    metrics.recordFailure()

    const stats = metrics.getStats()
    expect(stats.totalRequests).toBe(1)
    expect(stats.successfulRequests).toBe(0)
    expect(stats.failedRequests).toBe(1)
  })

  it('成功率をパーセンテージで返す（小数点第2位で丸め）', () => {
    // 3 回中 1 回成功 → 33.33...
    metrics.recordFailure()
    metrics.recordFailure()
    metrics.recordSuccess()

    const stats = metrics.getStats()
    expect(stats.successRate).toBeCloseTo(33.33, 2)
  })

  it('リクエストがない場合は成功率は 0 を返す', () => {
    const stats = metrics.getStats()
    expect(stats.successRate).toBe(0)
  })
})
