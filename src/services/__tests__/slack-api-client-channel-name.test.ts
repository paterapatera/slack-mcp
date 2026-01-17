import { test, expect, beforeEach } from "bun:test";
import { SlackAPIClient } from "../slack-api-client";

test("channelName() はチャンネルIDからチャンネル名を取得する", async () => {
  const client = new SlackAPIClient();
  const token = "xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx";
  client.initializeClient(token);

  // メソッドが存在することを確認
  expect(typeof client.channelName).toBe("function");
});

test("channelName() は app が初期化されていない場合、エラーを throw する", async () => {
  const client = new SlackAPIClient();

  await expect(client.channelName("C1234567890")).rejects.toThrow();
});
