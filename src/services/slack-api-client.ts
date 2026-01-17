import { App } from "@slack/bolt";
import { LoggingService } from "./logging-service.js";

export interface SlackSearchOptions {
  query: string;
  count?: number;
  page?: number;
  sort?: "score" | "timestamp";
  highlight?: boolean;
  teamId?: string;
}

export interface SlackMessage {
  type: string;
  channel: {
    id: string;
    name: string;
  };
  user: string;
  username?: string;
  text: string;
  ts: string;
  permalink: string;
}

export interface SlackSearchResponse {
  ok: boolean;
  query: string;
  messages: {
    total: number;
    matches: SlackMessage[];
    paging?: {
      count: number;
      total: number;
      page: number;
      pages: number;
    };
  };
  error?: string;
}

export class SlackAPIClient {
  app: App | null = null;
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1000; // 1秒
  private readonly loggingService: LoggingService;

  constructor(loggingService?: LoggingService) {
    this.loggingService = loggingService ?? new LoggingService();
  }

  /**
   * Slack API クライアントを初期化する
   * @param token Slack Bot Token (xoxb-...) または User Token (xoxp-...)
   * @throws {Error} トークンが無効な場合
   */
  initialize(token: string): void {
    if (!token || token.trim() === "") {
      throw new Error(
        "エラー: Slack API クライアントの初期化に失敗しました。\nSLACK_USER_TOKEN が有効で、必要なスコープが付与されていることを確認してください。"
      );
    }

    // トークン形式の基本検証（xoxb- または xoxp- で始まる）
    if (!token.startsWith("xoxb-") && !token.startsWith("xoxp-")) {
      throw new Error(
        "エラー: Slack API クライアントの初期化に失敗しました。\nSLACK_USER_TOKEN が有効な形式（xoxb-... または xoxp-...）であることを確認してください。"
      );
    }

    try {
      // @slack/bolt の App を初期化
      // MCP サーバーは stdio 経由で動作するため、HTTP リクエストを受け取らない
      // signingSecret はダミー値を設定（実際には使用されない）
      // app.client を使用して API を呼び出すだけなので、receiver は使用しない
      this.app = new App({
        token: token,
        signingSecret: "dummy-signing-secret-for-mcp-server", // MCP サーバーでは実際には使用されない
      });
    } catch (error: any) {
      throw new Error(
        `エラー: Slack API クライアントの初期化に失敗しました。\n${error.message}\nSLACK_USER_TOKEN が有効で、必要なスコープが付与されていることを確認してください。`
      );
    }
  }

  /**
   * レート制限エラーかどうかを判定する
   */
  private isRateLimitError(result: any): boolean {
    return (
      result?.ok === false &&
      (result?.error === "ratelimited" ||
        result?.error === "rate_limited" ||
        result?.statusCode === 429)
    );
  }

  /**
   * 認証エラーかどうかを判定する
   */
  private isAuthenticationError(result: any): boolean {
    return (
      result?.ok === false &&
      (result?.error === "invalid_auth" ||
        result?.error === "invalid_token" ||
        result?.error === "account_inactive" ||
        result?.error === "token_revoked")
    );
  }

  /**
   * 接続エラーかどうかを判定する（リトライ可能なエラー）
   */
  private isConnectionError(error: any): boolean {
    return (
      error?.code === "ECONNREFUSED" ||
      error?.code === "ETIMEDOUT" ||
      error?.code === "ENOTFOUND" ||
      error?.code === "ECONNRESET" ||
      error?.message?.includes("timeout") ||
      error?.message?.includes("ECONNREFUSED") ||
      error?.message?.includes("ETIMEDOUT") ||
      error?.message?.includes("ENOTFOUND")
    );
  }

  /**
   * 指数バックオフで待機する
   */
  private async waitWithExponentialBackoff(attempt: number): Promise<void> {
    const delayMs = this.baseDelayMs * Math.pow(2, attempt);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /**
   * メッセージを検索する（レート制限対応）
   * @param options 検索オプション
   * @returns 検索結果
   * @throws {Error} app が初期化されていない場合、または API 呼び出しが最終的に失敗した場合
   */
  async searchMessages(
    options: SlackSearchOptions
  ): Promise<SlackSearchResponse> {
    if (!this.app) {
      throw new Error(
        "エラー: Slack API クライアントが初期化されていません。\ninitialize() を先に呼び出してください。"
      );
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.app.client.search.messages({
          query: options.query,
          count: options.count,
          page: options.page,
          sort: options.sort,
          highlight: options.highlight,
          team_id: options.teamId,
        });

        // レート制限エラーの場合、リトライ
        if (this.isRateLimitError(result)) {
          if (attempt < this.maxRetries) {
            const retryAfter = result.headers?.["retry-after"]
              ? parseInt(result.headers["retry-after"], 10) * 1000
              : undefined;

            const delayMs = retryAfter ?? this.baseDelayMs * Math.pow(2, attempt);
            const rateLimitError = new Error(
              `レート制限エラー検出。${delayMs}ms 待機後にリトライします（試行 ${attempt + 1}/${this.maxRetries + 1}）`
            );
            this.loggingService.logRateLimitError(
              rateLimitError,
              "Slack API 呼び出し",
              attempt + 1
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          } else {
            const error = new Error(
              `エラー: Slack API のレート制限に達しました。リトライ回数の上限（${this.maxRetries + 1}回）に達しました。`
            );
            this.loggingService.logRateLimitError(
              error,
              "Slack API 呼び出し",
              attempt + 1
            );
            throw error;
          }
        }

        // 認証エラーの場合、リトライせずに即座にエラーを throw
        if (this.isAuthenticationError(result)) {
          const error = new Error(
            `エラー: Slack API の認証に失敗しました。\nトークンが有効で、必要なスコープが付与されていることを確認してください。\nエラー詳細: ${result.error}`
          );
          this.loggingService.logAuthenticationError(error, "Slack API 認証");
          throw error;
        }

        // その他のエラーの場合
        if (result.ok === false && result.error) {
          const error = new Error(
            `エラー: Slack API の呼び出しに失敗しました。\n${result.error}`
          );
          this.loggingService.logAPIError(error, "Slack API 呼び出し");
          throw error;
        }

        // Slack API レスポンスを内部形式に変換
        const response: SlackSearchResponse = {
          ok: result.ok ?? false,
          query: result.query ?? options.query,
          messages: {
            total: result.messages?.total ?? 0,
            matches: (result.messages?.matches ?? []).map((match) => ({
              type: match.type ?? "message",
              channel: {
                id: match.channel?.id ?? "",
                name: match.channel?.name ?? "",
              },
              user: match.user ?? "",
              username: match.username,
              text: match.text ?? "",
              ts: match.ts ?? "",
              permalink: match.permalink ?? "",
            })),
            paging: result.messages?.paging
              ? {
                  count: result.messages.paging.count ?? 0,
                  total: result.messages.paging.total ?? 0,
                  page: result.messages.paging.page ?? 1,
                  pages: result.messages.paging.pages ?? 1,
                }
              : undefined,
          },
          error: result.error,
        };

        return response;
      } catch (error: any) {
        lastError = error;

        // 認証エラーの場合、リトライせずに即座にエラーを throw
        if (
          error.message?.includes("invalid_auth") ||
          error.message?.includes("invalid_token") ||
          error.message?.includes("account_inactive") ||
          error.message?.includes("token_revoked")
        ) {
          const authError = new Error(
            `エラー: Slack API の認証に失敗しました。\nトークンが有効で、必要なスコープが付与されていることを確認してください。\nエラー詳細: ${error.message}`
          );
          this.loggingService.logAuthenticationError(authError, "Slack API 認証");
          throw authError;
        }

        // 接続エラーの場合、リトライ
        if (this.isConnectionError(error)) {
          if (attempt < this.maxRetries) {
            await this.waitWithExponentialBackoff(attempt);
            this.loggingService.logError(
              error,
              `接続エラー検出: ${error.message}。リトライします（試行 ${attempt + 1}/${this.maxRetries + 1}）`
            );
            continue;
          } else {
            const connectionError = new Error(
              `エラー: Slack API への接続に失敗しました。\nネットワーク接続を確認してください。\nエラー詳細: ${error.message}`
            );
            this.loggingService.logAPIError(connectionError, "Slack API 接続");
            throw connectionError;
          }
        }

        // レート制限エラーの可能性がある場合、リトライ
        if (
          error.message?.includes("ratelimited") ||
          error.message?.includes("rate_limited") ||
          error.statusCode === 429
        ) {
          if (attempt < this.maxRetries) {
            await this.waitWithExponentialBackoff(attempt);
            this.loggingService.logRateLimitError(
              error,
              "Slack API 呼び出し",
              attempt + 1
            );
            continue;
          }
        }

        // その他のエラーの場合、またはリトライ回数の上限に達した場合
        throw new Error(
          `エラー: Slack API の呼び出しに失敗しました。\n${error.message}`
        );
      }
    }

    // すべてのリトライが失敗した場合
    throw (
      lastError ||
      new Error("エラー: Slack API の呼び出しに失敗しました。")
    );
  }
}
