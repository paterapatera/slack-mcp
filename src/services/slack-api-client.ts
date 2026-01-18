import { App } from '@slack/bolt';
import { SearchMessagesResponse } from '@slack/web-api';
import { LoggingService } from './logging-service.js';

/**
 * レート制限エラー
 * リトライ待機時間を保持するカスタムエラークラス
 */
class RateLimitError extends Error {
  /** 待機時間（ミリ秒） */
  delayMs: number;

  constructor(delayMs: number) {
    super(`レート制限エラーが発生しました（待機: ${delayMs}ms）`);
    this.delayMs = delayMs;
    this.name = 'RateLimitError';
  }

  /**
   * 通常の Error オブジェクトに変換する
   */
  toError(): Error {
    return new Error(this.message);
  }
}

/**
 * Slack API レスポンス（メタデータを含む）
 * SearchMessagesResponse に HTTP レスポンスのメタデータ（headers, statusCode）を追加
 */
type SlackAPIResponse = SearchMessagesResponse & {
  headers?: {
    [key: string]: string | string[] | undefined;
    'retry-after'?: string;
  };
  statusCode?: number;
};

/**
 * Slack 検索オプション
 * Slack API の検索機能に使用するオプションを定義
 */
export interface SlackSearchOptions {
  /** 検索クエリ */
  query: string;
  /** 検索結果の最大件数 */
  maxResultCount?: number;
  /** ページ番号 */
  pageNumber?: number;
  /** ソート方法（"score": 関連度順、"timestamp": 時刻順） */
  sort?: 'score' | 'timestamp';
  /** ハイライト表示の有無 */
  highlight?: boolean;
  /** チームID */
  teamId?: string;
}

/**
 * Slack メッセージ
 * Slack API から返されるメッセージ情報を定義
 */
export interface SlackMessage {
  /** メッセージタイプ */
  type: string;
  /** チャンネル情報 */
  channel: {
    /** チャンネルID */
    id: string;
    /** チャンネル名 */
    name: string;
  };
  /** ユーザーID */
  user: string;
  /** ユーザー名（オプション） */
  username?: string;
  /** メッセージテキスト */
  text: string;
  /** タイムスタンプ */
  ts: string;
  /** スレッド親の ts（オプション） */
  thread_ts?: string;
  /** 返信数（親メッセージの場合に含まれる可能性あり） */
  reply_count?: number;
  /** メッセージへのリンク */
  permalink: string;
  /** 検索関連度スコア（オプション） */
  score?: number;
}

/**
 * Slack 検索レスポンス
 * Slack API の検索結果を定義
 */
export interface SlackSearchResponse {
  /** 検索が成功したかどうか */
  isSuccess: boolean;
  /** 検索クエリ */
  query: string;
  /** メッセージ情報 */
  messages: {
    /** 検索結果の総件数 */
    totalResultCount: number;
    /** 検索結果のメッセージ配列 */
    matches: SlackMessage[];
    /** ページング情報（オプション） */
    paging?: {
      /** 現在のページの結果数 */
      count: number;
      /** 全検索結果数 */
      totalResultCount: number;
      /** 現在のページ番号 */
      pageNumber: number;
      /** 総ページ数 */
      totalPageCount: number;
    };
  };
  /** エラーメッセージ（オプション） */
  error?: string;
}

/**
 * Slack API クライアント
 * Slack API への接続とメッセージ検索機能を提供
 */
import type { ISlackClient } from './slack-client-adapter.js';

export class SlackAPIClient implements ISlackClient {
  /** @slack/bolt の App インスタンス */
  private app: App | null = null;
  /** 最大リトライ回数
   * Slack API のレート制限や一時的なネットワークエラーに対応するため、
   * 初回試行を含めて合計4回（初回 + リトライ3回）試行する
   * MAX_RETRIES（3回）は、API のレート制限ポリシーとユーザー体験のバランスを考慮して決定
   */
  private static readonly MAX_RETRIES = 3;
  /** 基本待機時間（ミリ秒）
   * 指数バックオフの基本待機時間として1秒を使用
   * Slack API のレート制限ポリシーと、ユーザー体験への影響を考慮して決定
   * 短すぎるとレート制限に再び引っかかる可能性があり、
   * 長すぎるとユーザー体験が悪化するため、1秒を基本値として設定
   */
  private static readonly BASE_DELAY_MS = 1000; // 1秒
  /** Bot トークンのプレフィックス */
  private static readonly BOT_TOKEN_PREFIX = 'xoxb-';
  /** User トークンのプレフィックス */
  private static readonly USER_TOKEN_PREFIX = 'xoxp-';
  /** ダミーの署名シークレット
   * MCP サーバーは stdio 経由で動作するため、HTTP リクエストを受け取らない
   * 実際には使用されないが、@slack/bolt の App 初期化に必要
   */
  private static readonly DUMMY_SIGNING_SECRET = 'dummy-signing-secret-for-mcp-server';
  /** HTTPステータスコード: Too Many Requests（レート制限エラー） */
  private static readonly HTTP_STATUS_TOO_MANY_REQUESTS = 429;
  /** 秒からミリ秒への変換係数
   * retry-after ヘッダーは秒単位で返されるが、setTimeout はミリ秒単位を期待するため使用
   */
  private static readonly MILLISECONDS_PER_SECOND = 1000;
  /** parseInt の基数（10進数） */
  private static readonly DECIMAL_RADIX = 10;
  /** ページング情報のデフォルト値: カウント */
  private static readonly DEFAULT_PAGING_COUNT = 0;
  /** ページング情報のデフォルト値: 総件数 */
  private static readonly DEFAULT_PAGING_TOTAL = 0;
  /** ページング情報のデフォルト値: ページ番号 */
  private static readonly DEFAULT_PAGE_NUMBER = 1;
  /** ページング情報のデフォルト値: 総ページ数 */
  private static readonly DEFAULT_TOTAL_PAGE_COUNT = 1;
  /** 指数バックオフの底
   * 待機時間を段階的に増加させるために使用（2^attempt）
   * 一般的な指数バックオフの実装で広く使用されている値
   */
  private static readonly EXPONENTIAL_BACKOFF_BASE = 2;
  /** Slack API エラーコード: レート制限（ratelimited） */
  private static readonly ERROR_CODE_RATELIMITED = 'ratelimited';
  /** Slack API エラーコード: レート制限（rate_limited） */
  private static readonly ERROR_CODE_RATE_LIMITED = 'rate_limited';
  /** Slack API エラーコード: 認証無効（invalid_auth） */
  private static readonly ERROR_CODE_INVALID_AUTH = 'invalid_auth';
  /** Slack API エラーコード: トークン無効（invalid_token） */
  private static readonly ERROR_CODE_INVALID_TOKEN = 'invalid_token';
  /** Slack API エラーコード: アカウント非アクティブ（account_inactive） */
  private static readonly ERROR_CODE_ACCOUNT_INACTIVE = 'account_inactive';
  /** Slack API エラーコード: トークン取り消し（token_revoked） */
  private static readonly ERROR_CODE_TOKEN_REVOKED = 'token_revoked';
  /** ネットワークエラーコード: 接続拒否（ECONNREFUSED） */
  private static readonly ERROR_CODE_ECONNREFUSED = 'ECONNREFUSED';
  /** ネットワークエラーコード: タイムアウト（ETIMEDOUT） */
  private static readonly ERROR_CODE_ETIMEDOUT = 'ETIMEDOUT';
  /** ネットワークエラーコード: ホスト名解決失敗（ENOTFOUND） */
  private static readonly ERROR_CODE_ENOTFOUND = 'ENOTFOUND';
  /** ネットワークエラーコード: 接続リセット（ECONNRESET） */
  private static readonly ERROR_CODE_ECONNRESET = 'ECONNRESET';
  /** エラーメッセージに含まれる可能性のある文字列: タイムアウト */
  private static readonly ERROR_MESSAGE_TIMEOUT = 'timeout';
  /** デフォルトエラーメッセージ */
  private static readonly DEFAULT_ERROR_MESSAGE = '不明なエラー';
  /** デフォルトメッセージタイプ */
  private static readonly DEFAULT_MESSAGE_TYPE = 'message';
  /** HTTPヘッダー名: retry-after */
  private static readonly HTTP_HEADER_RETRY_AFTER = 'retry-after';
  /** ログ記録サービス */
  private readonly loggingService: LoggingService;

  constructor(loggingService?: LoggingService) {
    this.loggingService = loggingService ?? new LoggingService();
  }

  /**
   * エラーオブジェクトから安全にメッセージを取得する
   * @param error エラーオブジェクト（unknown型）
   * @returns エラーメッセージ（文字列）
   */
  private static getErrorMessage(error: unknown): string {
    // Error インスタンスの場合は message プロパティを返す
    if (error instanceof Error) {
      return error.message;
    }
    // Error インスタンスではない場合、message プロパティを確認
    const message = SlackAPIClient.extractMessageProperty(error);
    if (message !== undefined) {
      return message;
    }
    // message が取得できない場合は文字列に変換
    return String(error ?? SlackAPIClient.DEFAULT_ERROR_MESSAGE);
  }

  /**
   * エラーオブジェクトから message プロパティを安全に抽出する
   * @param error エラーオブジェクト
   * @returns message（文字列型の場合）またはundefined
   */
  private static extractMessageProperty(error: unknown): string | undefined {
    // error が object 型で、"message" プロパティを持つかを確認
    if (!SlackAPIClient.isErrorWithMessage(error)) {
      return undefined;
    }
    const message = (error as { message?: unknown }).message;
    // message が文字列型の場合のみ返す
    return typeof message === 'string' ? message : undefined;
  }

  /**
   * エラーオブジェクトが message プロパティを持つかを判定する
   * @param error オブジェクト
   * @returns message プロパティを持つ場合 true
   */
  private static isErrorWithMessage(error: unknown): boolean {
    return error !== null && typeof error === 'object' && 'message' in error;
  }

  /**
   * エラーオブジェクトから安全に statusCode を取得する
   * @param error エラーオブジェクト（unknown型）
   * @returns statusCode（数値または undefined）
   */
  private static getErrorStatusCode(error: unknown): number | undefined {
    // statusCode プロパティを持つかを確認
    if (!SlackAPIClient.isErrorWithStatusCode(error)) {
      return undefined;
    }
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    // statusCode が数値型の場合のみ返す
    return typeof statusCode === 'number' ? statusCode : undefined;
  }

  /**
   * エラーオブジェクトが statusCode プロパティを持つかを判定する
   * @param error オブジェクト
   * @returns statusCode プロパティを持つ場合 true
   */
  private static isErrorWithStatusCode(error: unknown): boolean {
    return error !== null && typeof error === 'object' && 'statusCode' in error;
  }

  /**
   * エラーオブジェクトから安全に code を取得する
   * @param error エラーオブジェクト（unknown型）
   * @returns code（文字列または undefined）
   */
  private static getErrorCode(error: unknown): string | undefined {
    // code プロパティを持つかを確認
    if (!SlackAPIClient.isErrorWithCode(error)) {
      return undefined;
    }
    const code = (error as { code?: unknown }).code;
    // code が文字列型の場合のみ返す
    return typeof code === 'string' ? code : undefined;
  }

  /**
   * エラーオブジェクトが code プロパティを持つかを判定する
   * @param error オブジェクト
   * @returns code プロパティを持つ場合 true
   */
  private static isErrorWithCode(error: unknown): boolean {
    return error !== null && typeof error === 'object' && 'code' in error;
  }

  /**
   * Slack API クライアントを初期化する
   * @param token Slack Bot Token (xoxb-...) または User Token (xoxp-...)
   * @throws {Error} トークンが無効な場合
   */
  initializeClient(token: string): void {
    this.validateToken(token);
    this.createSlackApp(token);
  }

  /**
   * トークンを検証する
   * @param token 検証するトークン
   * @throws {Error} トークンが無効な場合
   */
  private validateToken(token: string): void {
    // トークンが空でないかを確認
    if (!token || token.trim() === '') {
      throw new Error(
        'エラー: Slack API クライアントの初期化に失敗しました。\nSLACK_USER_TOKEN が有効で、必要なスコープが付与されていることを確認してください。'
      );
    }

    // トークンフォーマットが有効かを確認
    if (!this.isValidTokenFormat(token)) {
      throw new Error(
        'エラー: Slack API クライアントの初期化に失敗しました。\nSLACK_USER_TOKEN が有効な形式（xoxb-... または xoxp-...）であることを確認してください。'
      );
    }
  }

  /**
   * トークンのフォーマットが有効かどうかを判定する
   * Bot Token (xoxb-...) または User Token (xoxp-...) のいずれかである必要がある
   * @param token 検証するトークン
   * @returns 有効なトークンフォーマットの場合 true
   */
  private isValidTokenFormat(token: string): boolean {
    return (
      token.startsWith(SlackAPIClient.BOT_TOKEN_PREFIX) ||
      token.startsWith(SlackAPIClient.USER_TOKEN_PREFIX)
    );
  }

  /**
   * Slack App インスタンスを作成する
   * @param token Slack トークン
   * @throws {Error} App 作成に失敗した場合
   */
  private createSlackApp(token: string): void {
    try {
      this.app = new App({
        token: token,
        signingSecret: SlackAPIClient.DUMMY_SIGNING_SECRET,
      });
    } catch (error: unknown) {
      const errorMessage = SlackAPIClient.getErrorMessage(error);
      throw new Error(
        `エラー: Slack API クライアントの初期化に失敗しました。\n${errorMessage}\nSLACK_USER_TOKEN が有効で、必要なスコープが付与されていることを確認してください。`
      );
    }
  }

  /**
   * メッセージを検索する（レート制限対応）
   * レート制限エラーが発生した場合、自動的にリトライする（最大3回）
   * @param options 検索オプション
   * @returns 検索結果
   * @throws {Error} app が初期化されていない場合、または API 呼び出しが最終的に失敗した場合
   *
   * @example
   * // 基本的な検索
   * const result = await client.searchMessages({
   *   query: "test query",
   *   maxResultCount: 10
   * });
   *
   * @example
   * // ページング付き検索
   * const result = await client.searchMessages({
   *   query: "test query",
   *   maxResultCount: 20,
   *   pageNumber: 2,
   *   sort: "timestamp",
   *   teamId: "T1234567890"
   * });
   */
  async searchMessages(options: SlackSearchOptions): Promise<SlackSearchResponse> {
    if (!this.app) {
      throw new Error(
        'エラー: Slack API クライアントが初期化されていません。\ninitializeClient() を先に呼び出してください。'
      );
    }

    return await this.executeSearchWithRetry(options);
  }

  /**
   * リトライロジック付きでメッセージ検索を実行する
   * 初回試行 + 最大 MAX_RETRIES 回のリトライ実行
   * @param options 検索オプション
   * @returns 検索結果
   * @throws {Error} API 呼び出しが最終的に失敗した場合
   */
  private async executeSearchWithRetry(options: SlackSearchOptions): Promise<SlackSearchResponse> {
    // リトライループ: 初回試行（attempt=0）+ リトライ3回（attempt=1,2,3）= 合計4回試行
    // 合計4回の試行を実現するため、attempt <= MAX_RETRIES（3）とする
    for (let attempt = 0; attempt <= SlackAPIClient.MAX_RETRIES; attempt++) {
      try {
        return await this.executeSearchOnce(options, attempt);
      } catch (error: unknown) {
        // リトライ可能なエラーかどうかを判定し、リトライ可能な場合は続行
        const shouldRetry = await this.handleSearchError(error, attempt);
        if (!shouldRetry) {
          throw error;
        }
      }
    }

    // リトライ回数の上限に達しても成功しなかった場合、予期しないエラーを投げる
    throw new Error('エラー: Slack API の呼び出しに失敗しました。');
  }

  /**
   * 会話スレッドの返信を取得する（conversations.replies の最小実装）
   * 後続タスクでページネーション・リトライを実装する
   */
  async conversationsReplies(opts: {
    channel: string;
    ts: string;
    limit?: number;
    cursor?: string;
  }): Promise<any> {
    if (!this.app) {
      throw new Error(
        'エラー: Slack API クライアントが初期化されていません。\ninitializeClient() を先に呼び出してください。'
      );
    }

    // リトライループ（初回 + MAX_RETRIES 回）
    for (let attempt = 0; attempt <= SlackAPIClient.MAX_RETRIES; attempt++) {
      try {
        const res: any = await this.app!.client.conversations.replies({
          channel: opts.channel,
          ts: opts.ts,
          limit: opts.limit,
          cursor: opts.cursor,
        });

        // レスポンスのエラー判定（レート制限や認証など）
        this.handleSearchResponse(res as SlackAPIResponse, attempt);

        return res;
      } catch (error: unknown) {
        const shouldRetry = await this.handleSearchError(error, attempt);
        if (!shouldRetry) {
          throw error;
        }
        // 続行して次の試行へ
      }
    }

    throw new Error('エラー: Slack API の呼び出しに失敗しました。');
  }

  /**
   * 1回の検索を実行する
   * @param options 検索オプション
   * @param attempt 試行回数（0からの0-indexed）
   * @returns 検索結果
   * @throws {Error} 検索が失敗した場合
   */
  private async executeSearchOnce(
    options: SlackSearchOptions,
    attempt: number
  ): Promise<SlackSearchResponse> {
    // @slack/bolt の search.messages() の戻り値型は SearchMessagesResponse だが、
    // 実際のレスポンスには headers や statusCode などのメタデータが含まれるため、
    // SlackAPIResponse 型（SearchMessagesResponse を拡張した型）に型アサーションする
    const searchResult: SlackAPIResponse = (await this.app!.client.search.messages({
      query: options.query,
      count: options.maxResultCount,
      page: options.pageNumber,
      sort: options.sort,
      highlight: options.highlight,
      team_id: options.teamId,
    })) as SlackAPIResponse;

    // レスポンスのエラー判定と処理
    this.handleSearchResponse(searchResult, attempt);

    // Slack API レスポンスを内部形式に変換
    return this.convertSearchResultToResponse(searchResult, options.query);
  }

  /**
   * Slack API レスポンスを内部形式に変換する
   * @param searchResult Slack API レスポンス
   * @param originalQuery 元の検索クエリ
   * @returns SlackSearchResponse 形式の結果
   */
  private convertSearchResultToResponse(
    searchResult: SlackAPIResponse,
    originalQuery: string
  ): SlackSearchResponse {
    // メッセージオブジェクトを変換
    const messagesData = this.convertMessagesData(searchResult.messages);

    return {
      isSuccess: searchResult.ok ?? false,
      query: searchResult.query ?? originalQuery,
      messages: messagesData,
      error: searchResult.error,
    };
  }

  /**
   * Slack API レスポンスのメッセージデータを変換する
   * @param messagesData Slack API の messages オブジェクト
   * @returns 変換されたメッセージデータ
   */
  private convertMessagesData(messagesData: any): {
    totalResultCount: number;
    matches: SlackMessage[];
    paging?: {
      count: number;
      totalResultCount: number;
      pageNumber: number;
      totalPageCount: number;
    };
  } {
    return {
      totalResultCount: messagesData?.total ?? 0,
      // Slack API のメッセージマッチを内部形式の SlackMessage に変換
      matches: this.convertSlackMatchesToMessages(messagesData?.matches),
      // Slack API のページング情報を内部形式に変換
      paging: this.convertPagingInfo(messagesData?.paging),
    };
  }

  /**
   * 検索レスポンスのエラーをハンドリングする
   * @param searchResult 検索レスポンス
   * @param attempt 試行回数
   * @throws {Error} リトライ不可なエラーが発生した場合
   */
  private handleSearchResponse(searchResult: SlackAPIResponse, attempt: number): void {
    // レート制限エラーの場合はリトライ可能なエラーを投げる
    if (SlackAPIClient.isRateLimitError(searchResult)) {
      if (attempt >= SlackAPIClient.MAX_RETRIES) {
        const error = new Error(
          `エラー: Slack API のレート制限に達しました。リトライ回数の上限（${SlackAPIClient.MAX_RETRIES + 1}回）に達しました。`
        );
        this.loggingService.logRateLimitError(error, 'Slack API 呼び出し', attempt + 1);
        throw error;
      }

      // レート制限エラー時の待機時間を決定
      // Slack API が retry-after ヘッダーを返している場合は retry-after ヘッダーの値を使用し、
      // そうでない場合は指数バックオフ（2^attempt 秒）を使用する
      const delayMs = this.calculateRetryDelayMs(
        searchResult.headers?.[SlackAPIClient.HTTP_HEADER_RETRY_AFTER],
        attempt
      );
      this.loggingService.logRateLimitError(
        new Error(
          `レート制限エラー検出。${delayMs}ms 待機後にリトライします（試行 ${attempt + 1}/${SlackAPIClient.MAX_RETRIES + 1}）`
        ),
        'Slack API 呼び出し',
        attempt + 1
      );
      // 待機してリトライするため、エラーを投げて外側のループで処理
      throw new RateLimitError(delayMs);
    }

    // 認証エラーの場合、リトライせずに即座にエラーを throw
    if (SlackAPIClient.isAuthenticationError(searchResult)) {
      const error = new Error(
        `エラー: Slack API の認証に失敗しました。\nトークンが有効で、必要なスコープが付与されていることを確認してください。\nエラー詳細: ${searchResult.error}`
      );
      this.loggingService.logAuthenticationError(error, 'Slack API 認証');
      throw error;
    }

    if (!searchResult.ok && searchResult.error) {
      const error = new Error(
        `エラー: Slack API の呼び出しに失敗しました。\n${searchResult.error}`
      );
      this.loggingService.logAPIError(error, 'Slack API 呼び出し');
      throw error;
    }
  }

  /**
   * 検索エラーをハンドリングしてリトライ判定を行う
   * @param error キャッチされたエラー
   * @param attempt 試行回数
   * @returns リトライすべき場合は true
   * @throws {Error} リトライ不可なエラーを再スロー
   */
  private async handleSearchError(error: unknown, attempt: number): Promise<boolean> {
    // レート制限エラーの場合：指定時間待機してリトライ
    if (error instanceof RateLimitError) {
      if (attempt < SlackAPIClient.MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, error.delayMs));
        return true;
      }
      throw error.toError();
    }

    // 認証エラーの場合、リトライせずに即座にエラーを throw
    // 理由: 認証エラーはトークンの問題であり、リトライしても解決しないため
    // 認証エラーの種類: invalid_auth, invalid_token, account_inactive, token_revoked
    if (SlackAPIClient.isAuthenticationErrorMessage(SlackAPIClient.getErrorMessage(error))) {
      const authError = new Error(
        `エラー: Slack API の認証に失敗しました。\nトークンが有効で、必要なスコープが付与されていることを確認してください。\nエラー詳細: ${SlackAPIClient.getErrorMessage(error)}`
      );
      this.loggingService.logAuthenticationError(authError, 'Slack API 認証');
      throw authError;
    }

    // 接続エラー（ECONNREFUSED, ETIMEDOUT など）は一時的なネットワーク問題の可能性があるため、
    // 指数バックオフでリトライする
    // 理由: ネットワークの一時的な障害は時間経過で回復する可能性がある
    if (SlackAPIClient.isConnectionError(error)) {
      if (attempt >= SlackAPIClient.MAX_RETRIES) {
        const connectionError = new Error(
          `エラー: Slack API への接続に失敗しました。\nネットワーク接続を確認してください。\nエラー詳細: ${SlackAPIClient.getErrorMessage(error)}`
        );
        this.loggingService.logAPIError(connectionError, 'Slack API 接続');
        throw connectionError;
      }

      await this.waitWithExponentialBackoff(attempt);
      // logError は unknown 型のエラーを受け取るが、Error オブジェクトに変換して渡す
      // error が既に Error インスタンスの場合はエラーをそのまま使用し、
      // そうでない場合はエラーメッセージから新しい Error オブジェクトを作成
      this.loggingService.logError(
        error instanceof Error ? error : new Error(SlackAPIClient.getErrorMessage(error)),
        `接続エラー検出: ${SlackAPIClient.getErrorMessage(error)}。リトライします（試行 ${attempt + 1}/${SlackAPIClient.MAX_RETRIES + 1}）`
      );
      return true;
    }

    // catch ブロックで捕捉された例外がレート制限エラーの場合
    // （API レスポンスではなく例外として投げられた場合）
    // 指数バックオフでリトライする
    // 注意: 通常は isRateLimitError() で判定されるが、
    // 例外として投げられる場合もあるため、ここでも判定する
    if (
      SlackAPIClient.isRateLimitErrorMessage(
        SlackAPIClient.getErrorMessage(error),
        SlackAPIClient.getErrorStatusCode(error)
      )
    ) {
      if (attempt < SlackAPIClient.MAX_RETRIES) {
        await this.waitWithExponentialBackoff(attempt);
        // logRateLimitError は unknown 型のエラーを受け取るため、
        // そのまま error を渡すことができる
        // ログ記録サービス内で適切にエラーメッセージを取得する
        this.loggingService.logRateLimitError(error, 'Slack API 呼び出し', attempt + 1);
        return true;
      }
    }

    // その他のエラーはリトライしない
    throw new Error(
      `エラー: Slack API の呼び出しに失敗しました。\n${SlackAPIClient.getErrorMessage(error)}`
    );
  }

  /**
   * チャンネルIDからチャンネル名を取得する
   * @param channelId チャンネルID
   * @returns チャンネル名
   * @throws {Error} app が初期化されていない場合、または API 呼び出しが失敗した場合
   */
  async channelName(channelId: string): Promise<string> {
    if (!this.app) {
      throw new Error(
        'エラー: Slack API クライアントが初期化されていません。\ninitializeClient() を先に呼び出してください。'
      );
    }

    try {
      const channelInfoResult = await this.app.client.conversations.info({
        channel: channelId,
      });

      if (!channelInfoResult.ok || !channelInfoResult.channel) {
        throw new Error(
          `エラー: チャンネル情報の取得に失敗しました。\n${channelInfoResult.error || SlackAPIClient.DEFAULT_ERROR_MESSAGE}`
        );
      }

      // チャンネル名が取得できない場合（name が undefined または空文字列の場合）、
      // チャンネルIDをフォールバックとして返す
      // チャンネルIDをフォールバックとして返すことで、チャンネル名の取得に失敗しても検索処理を継続できる
      return channelInfoResult.channel.name || channelId;
    } catch (error: unknown) {
      // catch ブロックで捕捉されるエラーは unknown 型
      // エラーメッセージを安全に取得する
      const errorMessage = SlackAPIClient.getErrorMessage(error);
      // logAPIError は unknown 型のエラーを受け取るが、Error オブジェクトに変換して渡す
      // error が既に Error インスタンスの場合はエラーをそのまま使用し、
      // そうでない場合はエラーメッセージから新しい Error オブジェクトを作成
      this.loggingService.logAPIError(
        error instanceof Error ? error : new Error(errorMessage),
        `チャンネル情報の取得に失敗しました: ${channelId}`
      );
      throw new Error(`エラー: チャンネル情報の取得に失敗しました。\n${errorMessage}`);
    }
  }

  /**
   * レート制限エラーかどうかを判定する
   */
  private static isRateLimitError(apiResult: SlackAPIResponse): boolean {
    return (
      !apiResult?.ok &&
      (apiResult?.error === SlackAPIClient.ERROR_CODE_RATELIMITED ||
        apiResult?.error === SlackAPIClient.ERROR_CODE_RATE_LIMITED ||
        apiResult?.statusCode === SlackAPIClient.HTTP_STATUS_TOO_MANY_REQUESTS)
    );
  }

  /**
   * 認証エラーかどうかを判定する
   */
  private static isAuthenticationError(apiResult: SlackAPIResponse): boolean {
    return (
      !apiResult?.ok &&
      (apiResult?.error === SlackAPIClient.ERROR_CODE_INVALID_AUTH ||
        apiResult?.error === SlackAPIClient.ERROR_CODE_INVALID_TOKEN ||
        apiResult?.error === SlackAPIClient.ERROR_CODE_ACCOUNT_INACTIVE ||
        apiResult?.error === SlackAPIClient.ERROR_CODE_TOKEN_REVOKED)
    );
  }

  /**
   * 接続エラーかどうかを判定する（リトライ可能なエラー）
   */
  private static isConnectionError(error: unknown): boolean {
    const errorCode = SlackAPIClient.getErrorCode(error);
    const errorMessage = SlackAPIClient.getErrorMessage(error);

    return (
      errorCode === SlackAPIClient.ERROR_CODE_ECONNREFUSED ||
      errorCode === SlackAPIClient.ERROR_CODE_ETIMEDOUT ||
      errorCode === SlackAPIClient.ERROR_CODE_ENOTFOUND ||
      errorCode === SlackAPIClient.ERROR_CODE_ECONNRESET ||
      errorMessage.includes(SlackAPIClient.ERROR_MESSAGE_TIMEOUT) ||
      errorMessage.includes(SlackAPIClient.ERROR_CODE_ECONNREFUSED) ||
      errorMessage.includes(SlackAPIClient.ERROR_CODE_ETIMEDOUT) ||
      errorMessage.includes(SlackAPIClient.ERROR_CODE_ENOTFOUND)
    );
  }

  /**
   * エラーメッセージが認証エラーを示しているかどうかを判定する
   * @param errorMessage エラーメッセージ
   * @returns 認証エラーの場合 true
   */
  private static isAuthenticationErrorMessage(errorMessage: string): boolean {
    return (
      errorMessage.includes(SlackAPIClient.ERROR_CODE_INVALID_AUTH) ||
      errorMessage.includes(SlackAPIClient.ERROR_CODE_INVALID_TOKEN) ||
      errorMessage.includes(SlackAPIClient.ERROR_CODE_ACCOUNT_INACTIVE) ||
      errorMessage.includes(SlackAPIClient.ERROR_CODE_TOKEN_REVOKED)
    );
  }

  /**
   * エラーメッセージがレート制限エラーを示しているかどうかを判定する
   * @param errorMessage エラーメッセージ
   * @param statusCode HTTPステータスコード（オプション）
   * @returns レート制限エラーの場合 true
   */
  private static isRateLimitErrorMessage(errorMessage: string, statusCode?: number): boolean {
    return (
      errorMessage.includes(SlackAPIClient.ERROR_CODE_RATELIMITED) ||
      errorMessage.includes(SlackAPIClient.ERROR_CODE_RATE_LIMITED) ||
      statusCode === SlackAPIClient.HTTP_STATUS_TOO_MANY_REQUESTS
    );
  }

  /**
   * レート制限エラー時の待機時間を計算する
   * Slack API が retry-after ヘッダーを返している場合は retry-after ヘッダーの値を使用し、
   * そうでない場合は指数バックオフ（2^attempt 秒）を使用する
   * @param retryAfterHeader retry-after ヘッダーの値
   * @param attempt リトライ試行回数
   * @returns 待機時間（ミリ秒）
   */
  private calculateRetryDelayMs(
    retryAfterHeader: string | string[] | undefined,
    attempt: number
  ): number {
    // retry-after ヘッダーから待機時間（秒）を取得
    // ヘッダーが存在する場合は文字列を数値に変換し、存在しない場合は undefined
    // parseInt の第2引数に 10 を指定して10進数として解釈する
    const retryAfterValue = Array.isArray(retryAfterHeader)
      ? retryAfterHeader[0]
      : retryAfterHeader;

    // 数値変換を厳密に行い、NaN の場合は undefined として扱う
    let retryAfterSeconds: number | undefined = undefined;
    if (retryAfterValue) {
      const parsed = Number.parseInt(String(retryAfterValue), SlackAPIClient.DECIMAL_RADIX);
      retryAfterSeconds = Number.isFinite(parsed) && !isNaN(parsed) ? parsed : undefined;
    }

    // retry-after ヘッダーは秒単位で返されるが、setTimeout はミリ秒単位を期待するため、ミリ秒に変換
    // 指数バックオフの底を2にすることで、待機時間が適度に増加し（1秒→2秒→4秒→8秒）、
    // サーバーへの負荷を段階的に軽減しながら、過度な待機時間を避けられる
    // 一般的な指数バックオフの実装で広く使用されている値
    return retryAfterSeconds
      ? retryAfterSeconds * SlackAPIClient.MILLISECONDS_PER_SECOND
      : SlackAPIClient.BASE_DELAY_MS * Math.pow(SlackAPIClient.EXPONENTIAL_BACKOFF_BASE, attempt);
  }

  /**
   * Slack API のメッセージマッチを内部形式の SlackMessage に変換する
   * @param matches Slack API のメッセージマッチ配列
   * @returns 内部形式の SlackMessage 配列
   */
  private convertSlackMatchesToMessages(matches: any[] | undefined): SlackMessage[] {
    return (matches ?? []).map((match) => ({
      type: match.type ?? SlackAPIClient.DEFAULT_MESSAGE_TYPE,
      channel: {
        id: match.channel?.id ?? '',
        name: match.channel?.name ?? '',
      },
      user: match.user ?? '',
      username: match.username,
      text: match.text ?? '',
      ts: match.ts ?? '',
      permalink: match.permalink ?? '',
      score: match.score,
    }));
  }

  /**
   * Slack API のページング情報を内部形式に変換する
   * @param paging Slack API のページング情報
   * @returns 内部形式のページング情報（存在しない場合は undefined）
   */
  private convertPagingInfo(paging: any): SlackSearchResponse['messages']['paging'] | undefined {
    if (!paging) {
      return undefined;
    }

    return {
      count: paging.count ?? SlackAPIClient.DEFAULT_PAGING_COUNT,
      totalResultCount: paging.total ?? SlackAPIClient.DEFAULT_PAGING_TOTAL,
      pageNumber: paging.page ?? SlackAPIClient.DEFAULT_PAGE_NUMBER,
      totalPageCount: paging.pages ?? SlackAPIClient.DEFAULT_TOTAL_PAGE_COUNT,
    };
  }

  /**
   * 指数バックオフで待機する
   * 待機時間は 2^attempt 秒（例: 1秒、2秒、4秒、8秒...）
   * 指数バックオフにより、リトライ間隔が徐々に長くなり、サーバーへの負荷を軽減する
   */
  private async waitWithExponentialBackoff(attempt: number): Promise<void> {
    // 指数バックオフ: 待機時間 = 基本待機時間 × 底^attempt
    // attempt=0: 1秒, attempt=1: 2秒, attempt=2: 4秒, attempt=3: 8秒
    // Math.pow(EXPONENTIAL_BACKOFF_BASE, attempt) で底の attempt 乗を計算
    // 底を2にすることで、待機時間が適度に増加し、サーバーへの負荷を段階的に軽減しながら、
    // 過度な待機時間を避けられる。一般的な指数バックオフの実装で広く使用されている値
    // setTimeout を Promise でラップして await 可能にする
    // Promise でラップすることで、指定した時間（ミリ秒）だけ処理を待機できる
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        SlackAPIClient.BASE_DELAY_MS * Math.pow(SlackAPIClient.EXPONENTIAL_BACKOFF_BASE, attempt)
      )
    );
  }
}
