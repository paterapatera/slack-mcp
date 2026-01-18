import { test, expect, mock } from 'bun:test';
import { SlackAPIClient } from '../slack-api-client';

test('initialize() は有効なトークンで Bolt アプリを初期化する', () => {
  const client = new SlackAPIClient();
  const token = 'xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx';

  expect(() => client.initializeClient(token)).not.toThrow();
});

test('initialize() は xoxp- で始まるユーザートークンでも初期化できる', () => {
  const client = new SlackAPIClient();
  const token = 'xoxp-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx';

  expect(() => client.initializeClient(token)).not.toThrow();
});

test('initialize() は空のトークンでエラーを throw する', () => {
  const client = new SlackAPIClient();
  const token = '';

  expect(() => client.initializeClient(token)).toThrowError(/SLACK_USER_TOKEN/);
});

test('initialize() は無効なトークン形式でエラーを throw する', () => {
  const client = new SlackAPIClient();
  const token = 'invalid-token';

  expect(() => client.initializeClient(token)).toThrowError(/有効な形式/);
});

test('searchMessages() は app が初期化されていない場合、エラーを throw する', async () => {
  const client = new SlackAPIClient();

  await expect(client.searchMessages({ query: 'test' })).rejects.toThrow();
});

test('searchMessages() は検証済みオプションを executeSearchWithRetry に委譲する', async () => {
  const client = new SlackAPIClient();
  const token = 'xoxb-test-token-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx';
  client.initializeClient(token);

  const fakeResponse = {
    isSuccess: true,
    query: 'q',
    messages: { totalResultCount: 0, matches: [] },
  };

  const execSpy = mock(async () => fakeResponse);
  (client as any).executeSearchWithRetry = execSpy;

  const result = await client.searchMessages({ query: 'q', maxResultCount: 5 });

  expect((execSpy as any).mock.calls[0][0]).toEqual({ query: 'q', maxResultCount: 5 });
  expect(result).toBe(fakeResponse);
});
