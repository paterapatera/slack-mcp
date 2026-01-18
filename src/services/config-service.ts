/**
 * 設定情報
 * 環境変数から読み込まれた設定を保持
 */
export interface Config {
  /** Slack ユーザートークン */
  slackUserToken: string;
  /** Slack チームID（オプション） */
  slackTeamId?: string;
  /** Slack チャンネルIDの配列（オプション） */
  slackChannelIds?: string[];
}

/**
 * 設定エラー
 * 環境変数の不足など、設定に関するエラーを表す
 */
export interface IConfigService {
  loadConfig(): Config;
  validateConfig(config: Config): void;
}

export class ConfigError extends Error {
  /** エラー名 */
  private static readonly ERROR_NAME = 'ConfigError';
  /** 不足している環境変数名の配列（オプション） */
  missingVars?: string[];

  constructor(message: string, missingVars?: string[]) {
    super(message);
    this.name = ConfigError.ERROR_NAME;
    this.missingVars = missingVars;
  }
}

/**
 * 設定サービス
 * 環境変数から設定を読み込み、検証する機能を提供
 */
export class ConfigService {
  /** チャンネルIDの区切り文字（カンマ） */
  private static readonly CHANNEL_IDS_SEPARATOR = ',';
  /** 環境変数名: Slack ユーザートークン */
  private static readonly ENV_VAR_SLACK_USER_TOKEN = 'SLACK_USER_TOKEN';

  /**
   * インスタンスメソッド: 環境変数から設定を読み込む
   */
  loadConfig(): Config {
    const slackUserToken = process.env.SLACK_USER_TOKEN;
    const slackTeamId = process.env.SLACK_TEAM_ID;
    const slackChannelIds = ConfigService.parseChannelIds(process.env.SLACK_CHANNEL_IDS);

    return {
      // 環境変数が未設定の場合、空文字列をデフォルト値として設定
      // validateConfig() で空文字列をチェックするため、ここでは空文字列を設定する
      slackUserToken: slackUserToken ?? '',
      slackTeamId: slackTeamId ?? undefined,
      slackChannelIds: slackChannelIds ?? undefined,
    };
  }

  // --- 互換ラッパー ---
  static loadConfig(): Config {
    return new ConfigService().loadConfig();
  }

  /**
   * インスタンスメソッド: 設定を検証する
   * @throws {ConfigError} 必須環境変数が不足している場合
   */
  validateConfig(config: Config): void {
    const missingVars: string[] = [];

    if (!config.slackUserToken || config.slackUserToken.trim() === '') {
      missingVars.push(ConfigService.ENV_VAR_SLACK_USER_TOKEN);
    }

    if (missingVars.length > 0) {
      throw new ConfigError(
        `エラー: 必須環境変数 ${missingVars.join(', ')} が設定されていません。\n環境変数 ${missingVars.join(', ')} を設定してください。`,
        missingVars
      );
    }
  }

  // --- 互換ラッパー ---
  static validateConfig(config: Config): void {
    return new ConfigService().validateConfig(config);
  }

  /**
   * SLACK_CHANNEL_IDS をカンマ区切りリストとしてパースする
   */
  private static parseChannelIds(channelIds?: string): string[] | undefined {
    if (!channelIds || channelIds.trim() === '') {
      return undefined;
    }

    return channelIds
      .split(ConfigService.CHANNEL_IDS_SEPARATOR)
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }
}
