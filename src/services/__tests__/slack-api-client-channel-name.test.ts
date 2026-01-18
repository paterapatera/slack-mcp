import { test, expect, mock } from 'bun:test';
import { SlackAPIClient } from '../slack-api-client';

test('channelName() は conversations.info の応答からチャンネル名を返す', async () => {
  const client = new SlackAPIClient();
  const infoSpy = mock(async () => ({ ok: true, channel: { name: 'general' } }));
  (client as any).app = {
    client: {
      conversations: {
        info: infoSpy,
      },
    },
  };

  const name = await client.channelName('C1234567890');

  expect(name).toBe('general');
  expect(infoSpy).toHaveBeenCalledWith({ channel: 'C1234567890' });
});

test('channelName() は app が初期化されていない場合、エラーを throw する', async () => {
  const client = new SlackAPIClient();

  await expect(client.channelName('C1234567890')).rejects.toThrow();
});
