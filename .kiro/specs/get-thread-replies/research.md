# Research: get-thread-replies

## Summary

設計決定の根拠と外部依存性（主に Slack Web API の `conversations.replies`）を調査しました。主な結論は、既存の `SearchService` を拡張し、`SlackAPIClient` 経由で `conversations.replies` を呼び出すのが最も安全かつ短期間で実装可能である、という点です。

## Investigations

### Slack Web API: conversations.replies

- エンドポイント: `conversations.replies` はスレッドの親メッセージと返信を取得できる。
- ページネーション: `limit` と `cursor` をサポートしている（結果に `next_cursor` が含まれる）。
- エラー/レート制限: HTTP 429 を返すことがあり、再試行方針が必要。

### メッセージ編集・削除の挙動

- 編集: `message` オブジェクトに `edited` 情報が含まれている（最新版の本文を返すことを前提）。
- 削除: Slack は削除イベントや `subtype` により削除を示す場合がある。削除メッセージは本文が省略される／`deleted_ts` が設定されることがあるので、削除を示すマッピングが必要。

### 認証・権限

- Bot/User トークンのスコープによりアクセス可能なチャンネルが決まる。
- プライベートチャンネルは適切なスコープが必要。権限不足は 403 系のエラーとして扱われる（実装でのマッピングを明確にする）。

## Decisions & Rationale

- `SlackAPIClient` を通じて API 呼び出しを集中管理することで、レート制限とリトライポリシーを一元管理する。
- `SearchService` はドメインロジック（順序付け、削除・編集のマッピング、レスポンス整形）を担う。
- エラーは `ApiError` として統一して上位へ返す。

## Risks & Mitigations

- Slack API の仕様変更: モックを使った統合テストを整備し、契約違反を早期検出する。
- 大規模スレッドの遅延: ページサイズデフォルトを小さくし、クライアントに逐次フェッチを促すドキュメントを用意する。

## Open Questions

- 大規模スレッドの最良のページサイズ（実測に基づく決定が必要）
- 削除メッセージのフィールド標準化（Slack の正式ドキュメント確認）

---

## Sources

- Slack Web API docs (conversations.replies) — assumed as primary reference (リンクはレビュー時に追加予定)
