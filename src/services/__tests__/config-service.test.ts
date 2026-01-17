import { test, expect, beforeEach, afterEach } from 'bun:test'
import { ConfigService } from '../config-service'

const originalEnv = process.env

beforeEach(() => {
  // テストごとに環境変数をクリア
  process.env = { ...originalEnv }
})

afterEach(() => {
  // 環境変数を元に戻す
  process.env = originalEnv
})

test('loadConfig() は SLACK_USER_TOKEN を読み込む', () => {
  process.env.SLACK_USER_TOKEN = 'xoxb-test-token'
  const config = ConfigService.loadConfig()

  expect(config.slackUserToken).toBe('xoxb-test-token')
})

test('loadConfig() は SLACK_USER_TOKEN が未設定の場合は空文字列を返す', () => {
  delete process.env.SLACK_USER_TOKEN
  const config = ConfigService.loadConfig()

  expect(config.slackUserToken).toBe('')
})

test('loadConfig() は SLACK_TEAM_ID を読み込む（オプション）', () => {
  process.env.SLACK_USER_TOKEN = 'xoxb-test-token'
  process.env.SLACK_TEAM_ID = 'T123456'
  const config = ConfigService.loadConfig()

  expect(config.slackTeamId).toBe('T123456')
})

test('loadConfig() は SLACK_TEAM_ID が未設定の場合は undefined を返す', () => {
  process.env.SLACK_USER_TOKEN = 'xoxb-test-token'
  delete process.env.SLACK_TEAM_ID
  const config = ConfigService.loadConfig()

  expect(config.slackTeamId).toBeUndefined()
})

test('loadConfig() は SLACK_CHANNEL_IDS をカンマ区切りリストとして読み込む', () => {
  process.env.SLACK_USER_TOKEN = 'xoxb-test-token'
  process.env.SLACK_CHANNEL_IDS = 'C123456,C789012,C345678'
  const config = ConfigService.loadConfig()

  expect(config.slackChannelIds).toEqual(['C123456', 'C789012', 'C345678'])
})

test('loadConfig() は SLACK_CHANNEL_IDS が単一値の場合も配列として返す', () => {
  process.env.SLACK_USER_TOKEN = 'xoxb-test-token'
  process.env.SLACK_CHANNEL_IDS = 'C123456'
  const config = ConfigService.loadConfig()

  expect(config.slackChannelIds).toEqual(['C123456'])
})

test('loadConfig() は SLACK_CHANNEL_IDS が未設定の場合は undefined を返す', () => {
  process.env.SLACK_USER_TOKEN = 'xoxb-test-token'
  delete process.env.SLACK_CHANNEL_IDS
  const config = ConfigService.loadConfig()

  expect(config.slackChannelIds).toBeUndefined()
})

test('loadConfig() は SLACK_CHANNEL_IDS の空白をトリムする', () => {
  process.env.SLACK_USER_TOKEN = 'xoxb-test-token'
  process.env.SLACK_CHANNEL_IDS = 'C123456, C789012 , C345678'
  const config = ConfigService.loadConfig()

  expect(config.slackChannelIds).toEqual(['C123456', 'C789012', 'C345678'])
})

test('loadConfig() は空の SLACK_CHANNEL_IDS を undefined として扱う', () => {
  process.env.SLACK_USER_TOKEN = 'xoxb-test-token'
  process.env.SLACK_CHANNEL_IDS = ''
  const config = ConfigService.loadConfig()

  expect(config.slackChannelIds).toBeUndefined()
})

test('validateConfig() は SLACK_USER_TOKEN が設定されている場合、エラーを throw しない', () => {
  process.env.SLACK_USER_TOKEN = 'xoxb-test-token'
  const config = ConfigService.loadConfig()

  expect(() => ConfigService.validateConfig(config)).not.toThrow()
})

test('validateConfig() は SLACK_USER_TOKEN が未設定の場合、ConfigError を throw する', () => {
  delete process.env.SLACK_USER_TOKEN
  const config = ConfigService.loadConfig()

  expect(() => ConfigService.validateConfig(config)).toThrow()
  try {
    ConfigService.validateConfig(config)
  } catch (error: any) {
    expect(error.message).toContain('SLACK_USER_TOKEN')
    expect(error.message).toContain('必須')
    expect(error.missingVars).toContain('SLACK_USER_TOKEN')
  }
})

test('validateConfig() は SLACK_USER_TOKEN が空文字列の場合、ConfigError を throw する', () => {
  process.env.SLACK_USER_TOKEN = ''
  const config = ConfigService.loadConfig()

  expect(() => ConfigService.validateConfig(config)).toThrow()
  try {
    ConfigService.validateConfig(config)
  } catch (error: any) {
    expect(error.message).toContain('SLACK_USER_TOKEN')
    expect(error.missingVars).toContain('SLACK_USER_TOKEN')
  }
})

test('validateConfig() は SLACK_TEAM_ID が設定されている場合、エラーを throw しない', () => {
  process.env.SLACK_USER_TOKEN = 'xoxb-test-token'
  process.env.SLACK_TEAM_ID = 'T123456'
  const config = ConfigService.loadConfig()

  expect(() => ConfigService.validateConfig(config)).not.toThrow()
})

test('validateConfig() は SLACK_CHANNEL_IDS が有効な形式の場合、エラーを throw しない', () => {
  process.env.SLACK_USER_TOKEN = 'xoxb-test-token'
  process.env.SLACK_CHANNEL_IDS = 'C123456,C789012'
  const config = ConfigService.loadConfig()

  expect(() => ConfigService.validateConfig(config)).not.toThrow()
})
