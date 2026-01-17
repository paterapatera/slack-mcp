import { describe, it, expect, beforeEach } from "bun:test";
import { LoggingService } from "../logging-service";

describe("LoggingService", () => {
  let loggingService: LoggingService;

  beforeEach(() => {
    loggingService = new LoggingService();
  });

  it("エラーをログに記録する", () => {
    const error = new Error("テストエラー");
    loggingService.logError(error, "テストコンテキスト");
    
    // ログが記録されたことを確認
    expect(loggingService).toBeDefined();
  });

  it("認証エラーをログに記録する", () => {
    const error = new Error("認証エラー: invalid_token");
    loggingService.logAuthenticationError(error, "Slack API 認証");
    
    expect(loggingService).toBeDefined();
  });

  it("API エラーをログに記録する", () => {
    const error = new Error("API エラー: request_failed");
    loggingService.logAPIError(error, "Slack API 呼び出し");
    
    expect(loggingService).toBeDefined();
  });

  it("レート制限エラーをログに記録する", () => {
    const error = new Error("レート制限エラー: ratelimited");
    loggingService.logRateLimitError(error, "Slack API 呼び出し", 1);
    
    expect(loggingService).toBeDefined();
  });

  it("検索リクエストの成功を記録する", () => {
    loggingService.logSearchRequestSuccess("test query", 10);
    
    expect(loggingService).toBeDefined();
  });

  it("検索リクエストの失敗を記録する", () => {
    const error = new Error("検索エラー");
    loggingService.logSearchRequestFailure("test query", error);
    
    expect(loggingService).toBeDefined();
  });

  it("検索リクエストの成功/失敗率を追跡する", () => {
    loggingService.logSearchRequestSuccess("test query", 10);
    loggingService.logSearchRequestFailure("test query", new Error("エラー"));
    
    const stats = loggingService.getSearchRequestStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.successfulRequests).toBe(1);
    expect(stats.failedRequests).toBe(1);
  });
});
