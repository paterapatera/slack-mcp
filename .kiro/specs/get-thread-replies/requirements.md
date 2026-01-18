# Requirements Document

## Project Description (Input)

get_thread_replies - スレッド全体の把握の作成

## Requirements

### Requirement 1: 基本スレッド取得

**Objective:** As a Search Service (get-thread-replies) client, I want スレッド内の全ての返信を取得できるようにし、スレッド全体の文脈を把握できるようにする

#### Acceptance Criteria

1. When クライアントがチャンネルIDと親メッセージの `thread_ts` を指定してスレッド取得を要求したとき、Search Service (get-thread-replies) shall 親メッセージおよびその全ての返信を、各メッセージのメタデータ（user, ts, text, edited フラグ 等）を含めて返す
2. If 指定された `thread_ts` に対応する親メッセージが存在しないとき、Search Service (get-thread-replies) shall 見つからないことを示す明確なエラー（NotFound）を返す
3. When Slack API がレート制限を返したとき、Search Service (get-thread-replies) shall レート制限を示すエラーを返し、メトリクスを記録する
4. While クライアントがページネーション（limit / cursor 等）を指定している間、Search Service (get-thread-replies) shall 結果をページ区切りで返し、次ページへ進むためのカーソル/トークンを返す

---

### Requirement 2: 応答の順序・一貫性・欠損扱い

**Objective:** スレッドの会話を正しく再現できるよう、順序・編集・削除の扱いを一貫して提供する

#### Acceptance Criteria

1. When クライアントが特に順序指定をしないとき、Search Service (get-thread-replies) shall 既定で時系列（古い順）で返信を返す
2. When クライアントが逆順（新しい順）を要求したとき、Search Service (get-thread-replies) shall 指定された順序で返信を返す
3. If メッセージが編集されているとき、Search Service (get-thread-replies) shall 最新の本文と編集済みであることを示すメタデータを返す
4. If メッセージが削除されているとき、Search Service (get-thread-replies) shall コンテンツは返さず、削除済みを示すマーカー（deleted: true と timestamp 等）を返す

---

### Requirement 3: 認証・権限・可視性

**Objective:** 適切な権限を持つクライアントのみがスレッドの内容にアクセスできるようにする

#### Acceptance Criteria

1. If リクエストに付与されたトークンが無効または認証に失敗したとき、Search Service (get-thread-replies) shall 認証エラーを返す（AuthenticationError）
2. If リクエストが対象のチャンネルに対する閲覧権限を持たないとき、Search Service (get-thread-replies) shall 権限エラー（AuthorizationError）を返す
3. Where プライベートチャンネルや制限付きチャンネルが対象の場合、Search Service (get-thread-replies) shall アクセス可能/不可を明示するエラーや空レスポンスの挙動をドキュメント化する

---

### Requirement 4: パフォーマンス・可観測性・運用性

**Objective:** 応答時間と可観測性を保証し、運用監視とデバッグを支援する

#### Acceptance Criteria

1. While リクエストが最大100件程度の返信を対象として処理している間、Search Service (get-thread-replies) shall 99% のリクエストに対して3秒以内に応答する（測定可能）
2. If 処理中にエラーが発生したとき、Search Service (get-thread-replies) shall LoggingService に日本語でエラーログを記録し、MetricsService に失敗として記録する
3. The Search Service (get-thread-replies) shall 重要なイベント（リクエスト受信、成功、失敗、レート制限発生、ページネーション利用）をメトリクスとして公開する

---

## Notes / 補足

- テスト可能性: すべての受け入れ基準は自動テストで検証可能であること。外部依存（Slack API）はスタブ/モックで再現すること。
- 仕様主体: 要件の主体は **Search Service (get-thread-replies)** とする（EARS の主語ガイドラインに準拠）

<!-- end of generated requirements -->
