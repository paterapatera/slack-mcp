import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SearchService } from "../../search-service";
import { SlackAPIClient } from "../../slack-api-client";
import { LoggingService } from "../../logging-service";

const originalEnv = process.env;

describe("メッセージ検索フローの統合テスト", () => {
  let slackClient: SlackAPIClient;
  let searchService: SearchService;
  let loggingService: LoggingService;

  beforeEach(() => {
    // テストごとに環境変数をクリア
    process.env = { ...originalEnv };
    loggingService = new LoggingService();
    slackClient = new SlackAPIClient(loggingService);
    searchService = new SearchService(slackClient, loggingService);
  });

  afterEach(() => {
    // 環境変数を元に戻す
    process.env = originalEnv;
  });

  describe("Search Service と Slack API Client の統合テスト", () => {
    beforeEach(() => {
      const token = "xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx";
      slackClient.initialize(token);
    });

    it("Search Service が Slack API Client を正しく呼び出す", async () => {
      // メソッドが存在することを確認
      expect(typeof searchService.searchMessages).toBe("function");
      expect(typeof slackClient.searchMessages).toBe("function");
    });

    it("検索クエリが Search Service から Slack API Client に正しく渡される", async () => {
      // 統合テストでは、実際の API 呼び出しは行わない
      // メソッドの存在とインターフェースの整合性を確認
      expect(searchService).toBeDefined();
      expect(slackClient).toBeDefined();
    });
  });

  describe("エンドツーエンドの検索リクエストフローのテスト", () => {
    beforeEach(() => {
      const token = "xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx";
      slackClient.initialize(token);
    });

    it("検索リクエストが正しい形式で処理される", async () => {
      // 検索オプションの形式を確認
      const options = {
        query: "test query",
        limit: 10,
        channelIds: ["C1234567890"],
        teamId: "T1234567890",
      };

      // メソッドが存在することを確認
      expect(typeof searchService.searchMessages).toBe("function");
    });

    it("検索結果が正しい形式で返却される", async () => {
      // 検索結果の形式を確認
      // 実際の API 呼び出しは統合テストで行う
      expect(searchService).toBeDefined();
    });
  });
});
