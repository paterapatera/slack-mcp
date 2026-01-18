# Implementation Tasks: get-thread-replies

- [x] 1. SearchService のコア実装 ✅
  - SearchService に `getThreadReplies` ハンドラーを追加し、リクエスト検証（channelId, threadTs）、認証チェック、基本エラーハンドリングを実装する
  - _Requirements: 1.1, 3.1, 3.2_

- [x] 1.1 詳細フェッチ実装 ✅
  - `SlackAPIClient` を利用して親メッセージとスレッド返信を取得し、ページネーションをサポートする呼び出しを行うロジックを実装する
  - _Requirements: 1.1, 1.4_

- [x] 1.2 メッセージ整形と状態マッピング ✅
  - Slack API のレスポンスを `Message` 型にマッピングし、編集済み/削除済みフラグやメタデータを付与する処理を実装する
  - _Requirements: 2.3, 2.4, 1.1_

- [x] 1.3 順序オプションの実装 ✅
  - クライアントの `order` パラメータ（`oldest` | `newest`）に基づく並び替えロジックを実装する（既定は `oldest`）
  - _Requirements: 2.1, 2.2_

- [x] 1.4 既定で1ページのみ返す実装 ✅
  - 大規模スレッドでの自動集約を行わず、1ページのみを返し `next_cursor` / `has_more` を返す既定動作に変更（互換性のため singlePage オプションは非推奨）
  - ユニットテストを追加
  - _Requirements: 1.4_

- [x] 1.5 親メッセージの分離（parent フィールド） ✅
  - 親メッセージを `parent` フィールドとして分離して返す実装とユニットテストを追加する
  - _Requirements: 1.1, 2.3_

- [x] 2. SlackAPIClient の拡張 (P) ✅
  - `conversations.replies` のラッパーを実装し、`limit`/`cursor` パラメータをサポートする
  - _Requirements: 1.4_

- [x] 2.1 レート制限とリトライ戦略の実装 (P) ✅
  - 接続/一時エラーに対する指数バックオフ（maxRetries=3）を実装し、HTTP 429 を `RateLimit` エラーとして標準化する
  - _Requirements: 1.3, 3.1, 3.2_

- [x] 2.2 SlackAPIClient のユニットテスト (P) ✅
  - ページネーション、次ページトークン、エラー変換（RateLimit 含む）を検証するユニットテストを追加する
  - _Requirements: 1.3, 1.4_

- [x] 3. 可観測性とエラーハンドリング (P) ✅
  - リクエスト受信、成功、失敗、レート制限、ページネーション利用を MetricsService に記録する実装を追加する
  - _Requirements: 4.3, 1.3_

- [x] 3.1 日本語エラーロギングの実装 (P) ✅
  - 失敗時に LoggingService を用いて日本語でのエラーログ（コンテキスト含む）を出力する実装を追加する
  - _Requirements: 4.2_

- [x] 3.2 レイテンシ計測とメトリクスの実装 (P) ✅
  - リクエストの処理時間を計測し、平均/パーセンタイルなどのメトリクスを記録するインストルメンテーションを追加する
  - _Requirements: 4.1_

- [x] 4. テスト: ユニット / 統合 / パフォーマンス ✅
  - Unit テストで正常系（親+返信、並び替え、編集/削除マッピング）を検証し、統合/パフォーマンステストを追加済み
  - _Requirements: 1.1, 2.1, 2.2, 2.3_

- [x] 4.1 エラー系ユニットテスト ✅
  - NotFound、AuthenticationError、AuthorizationError のユニットテストを追加し、ログ/メトリクスの検証を実装済み
  - _Requirements: 1.2, 3.1, 3.2_

- [x] 4.2 統合テスト（Slack モック） ✅
  - `conversations.replies` のページング/次ページトークン/RateLimit をモックした統合テストを追加済み
  - _Requirements: 1.3, 1.4_

- [x] 4.3 パフォーマンステスト ✅
  - 100 件返信を返すシナリオのベンチを追加し、応答時間が要件内であることを検証済み
  - _Requirements: 4.1_

- [x] 5. MCP ツール登録とエンドツーエンド検証 ✅
  - McpServer に `get-thread-replies` ツールを登録し、入力スキーマ・ハンドラーを実装済み
  - _Requirements: 1.1, 1.4_

- [x] 5.1 エンドツーエンド E2E テスト ✅
  - MCP ツールハンドラーを直接呼び出す E2E スタイルのテストを追加し、期待される `ThreadResponse` 形状を検証済み
  - _Requirements: 1.1, 1.4, 2.3_

- [x] 6. 統合・レビュー・後片付け ✅
  - 全ユニット/統合/パフォーマンステストを追加・修正し、型チェック・フォーマットを実行してクリーンな状態を確認済み
  - _Requirements: 1.1,1.2,1.3,1.4,2.1,2.2,2.3,2.4,3.1,3.2,3.3,4.1,4.2,4.3_
