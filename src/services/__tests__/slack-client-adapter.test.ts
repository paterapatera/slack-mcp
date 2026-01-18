import { describe, it, expect } from 'bun:test';
import { SlackBoltAdapter } from '../slack-client-adapter';

describe('SlackBoltAdapter', () => {
  it('underlying client のメソッドに委譲する', async () => {
    const calls: string[] = [];

    const fakeClient = {
      initializeClient: (token: string) => {
        calls.push(`init:${token}`);
      },
      searchMessages: async (options: any) => {
        calls.push(`search:${options.query}`);
        return {
          isSuccess: true,
          query: options.query,
          messages: { totalResultCount: 0, matches: [] },
        };
      },
      channelName: async (id: string) => {
        calls.push(`channel:${id}`);
        return 'channel-name';
      },
    };

    const adapter = new SlackBoltAdapter(undefined, fakeClient as any);

    adapter.initializeClient('token-123');
    const res = await adapter.searchMessages({ query: 'hello' } as any);
    const name = await adapter.channelName('C123');

    expect(calls).toEqual(['init:token-123', 'search:hello', 'channel:C123']);
    expect(res.isSuccess).toBe(true);
    expect(name).toBe('channel-name');
  });
});
