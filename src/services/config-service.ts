export interface Config {
  slackUserToken: string;
  slackTeamId?: string;
  slackChannelIds?: string[];
}

export class ConfigError extends Error {
  missingVars?: string[];

  constructor(message: string, missingVars?: string[]) {
    super(message);
    this.name = "ConfigError";
    this.missingVars = missingVars;
  }
}

export class ConfigService {
  /**
   * 環境変数から設定を読み込む
   */
  static load(): Config {
    const slackUserToken = process.env.SLACK_USER_TOKEN;
    const slackTeamId = process.env.SLACK_TEAM_ID;
    const slackChannelIds = this.parseChannelIds(process.env.SLACK_CHANNEL_IDS);

    return {
      slackUserToken: slackUserToken ?? "",
      slackTeamId: slackTeamId ?? undefined,
      slackChannelIds: slackChannelIds ?? undefined,
    };
  }

  /**
   * 設定を検証する
   * @throws {ConfigError} 必須環境変数が不足している場合
   */
  static validate(config: Config): void {
    const missingVars: string[] = [];

    // SLACK_USER_TOKEN の必須チェック
    if (!config.slackUserToken || config.slackUserToken.trim() === "") {
      missingVars.push("SLACK_USER_TOKEN");
    }

    // エラーがある場合は throw
    if (missingVars.length > 0) {
      const message = `エラー: 必須環境変数 ${missingVars.join(", ")} が設定されていません。\n環境変数 ${missingVars.join(", ")} を設定してください。`;
      throw new ConfigError(message, missingVars);
    }
  }

  /**
   * SLACK_CHANNEL_IDS をカンマ区切りリストとしてパースする
   */
  private static parseChannelIds(channelIds?: string): string[] | undefined {
    if (!channelIds || channelIds.trim() === "") {
      return undefined;
    }

    return channelIds
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }
}
