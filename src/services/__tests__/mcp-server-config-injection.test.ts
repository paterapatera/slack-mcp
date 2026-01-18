import { describe, it, expect, beforeEach } from 'bun:test'
import { McpServer } from '../mcp-server'
import { IConfigService, Config } from '../config-service'

class FakeConfigService implements IConfigService {
  constructor(private cfg: Config) {}
  loadConfig(): Config {
    return this.cfg
  }
  validateConfig(config: Config): void {
    // no-op
  }
}

describe('McpServer config injection', () => {
  let server: McpServer

  beforeEach(() => {
    process.env = {}
  })

  it('注入された ConfigService を使用して起動できる', async () => {
    const fake = new FakeConfigService({ slackUserToken: 'xoxb-injected' })
    server = new McpServer({ name: 'test', version: '1.0.0' }, fake)

    await expect(server.startServer()).resolves.toBeUndefined()
  })
})
