# Research & Design Decisions Template

---

**Purpose**: Capture discovery findings, architectural investigations, and rationale that inform the technical design.

**Usage**:

- Log research activities and outcomes during the discovery phase.
- Document design decision trade-offs that are too detailed for `design.md`.
- Provide references and evidence for future audits or reuse.

---

## Summary

- **Feature**: `slack-message-search`
- **Discovery Scope**: New Feature (Greenfield)
- **Key Findings**:
  - MCP公式SDK（@modelcontextprotocol/server）を使用してMCPサーバーを実装
  - `@slack/bolt`パッケージを使用してSlack APIとの統合を実装
  - MCP Inspectorを使用してMCPサーバーをテスト可能にする
  - Viteを使用してTypeScriptをビルドし、npm linkでローカル開発環境にリンク可能にする
  - 環境変数による設定管理とエラーハンドリングが重要

## Research Log

### MCP (Model Context Protocol) サーバー実装

- **Context**: MCPサーバーとしての実装方法を調査
- **Sources Consulted**:
  - [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — 公式SDKのドキュメント
  - [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) — MCPサーバーのテストツール
- **Findings**:
  - MCP公式SDK（@modelcontextprotocol/server）が提供されている
  - stdio transportを使用してMCPサーバーを実装可能
  - ツール（tools）として検索機能を公開する必要がある
  - MCP Inspectorを使用してサーバーをテスト可能
  - エラーハンドリングとリクエスト/レスポンスの形式が重要
- **Implications**:
  - @modelcontextprotocol/serverパッケージを使用してMCPサーバーを実装
  - stdio transportを使用して標準入力/出力経由で通信
  - ツール定義とハンドラー関数の実装が必要
  - MCP Inspectorとの互換性を確保

### Slack Web API 統合

- **Context**: Slack APIを使用したメッセージ検索の実装方法
- **Sources Consulted**:
  - [Slack API Methods Reference](https://docs.slack.dev/reference/methods) — Slack APIメソッドのリファレンス
  - `@slack/bolt`パッケージの使用方法
- **Findings**:
  - `@slack/bolt`はSlackアプリ開発のためのフレームワーク
  - `app.client.search.messages()`でメッセージ検索が可能
  - 必要なスコープ: `search:read`（公開チャンネル）、`search:read.private`（プライベートチャンネル）
  - レート制限: Tier 3（50リクエスト/分）
  - 認証にはBot TokenまたはUser Tokenが必要
  - チャンネルIDで検索範囲を制限可能
- **Implications**:
  - `@slack/bolt`パッケージを使用してAPI呼び出しを実装
  - Boltアプリの初期化とクライアントインスタンスの管理が必要
  - レート制限対応のリトライロジックが必要
  - 認証エラーの適切な処理が必要

### TypeScript と Vite によるビルド設定

- **Context**: Viteを使用したTypeScriptビルドとnpm link対応
- **Sources Consulted**:
  - Vite公式ドキュメント: ライブラリモードの設定
  - npm linkの使用方法
- **Findings**:
  - ViteのライブラリモードでTypeScriptをビルド可能
  - `package.json`の`main`フィールドでエントリーポイントを指定
  - `types`フィールドで型定義ファイルのパスを指定
  - `bin`フィールドでCLIコマンドを定義可能
  - npm linkでローカル開発環境にリンク可能
- **Implications**:
  - Vite設定でライブラリモードを有効化
  - TypeScriptコンパイル設定を適切に構成
  - ビルド出力を`dist/`ディレクトリに配置
  - package.jsonの設定を適切に構成

### 環境変数による設定管理

- **Context**: 環境変数による設定の読み込みと検証
- **Sources Consulted**:
  - Node.jsの`process.env`の使用方法
  - 環境変数の検証パターン
- **Findings**:
  - `process.env`で環境変数を読み込み可能
  - 起動時に必須環境変数の検証が必要
  - カンマ区切りのチャンネルIDリストのパースが必要
- **Implications**:
  - 設定モジュールで環境変数を読み込み
  - 起動時に必須項目の検証を実装
  - エラーメッセージを明確に表示

## Architecture Pattern Evaluation

| Option                     | Description                                                      | Strengths                  | Risks / Limitations            | Notes                      |
| -------------------------- | ---------------------------------------------------------------- | -------------------------- | ------------------------------ | -------------------------- |
| レイヤードアーキテクチャ   | プレゼンテーション層、ビジネスロジック層、データアクセス層に分離 | 責務が明確、テストしやすい | シンプルな機能には過剰な可能性 | 小規模な機能に適している   |
| モジュール化アーキテクチャ | 機能ごとにモジュールを分離                                       | 拡張性が高い、保守しやすい | 初期実装が複雑になる可能性     | 将来的な拡張を考慮して採用 |

## Design Decisions

### Decision: モジュール化アーキテクチャの採用

- **Context**: 機能の拡張性と保守性を考慮したアーキテクチャパターンの選択
- **Alternatives Considered**:
  1. 単一ファイル実装 — シンプルだが拡張性が低い
  2. モジュール化アーキテクチャ — 機能ごとに分離、拡張性が高い
- **Selected Approach**: モジュール化アーキテクチャを採用。MCPサーバー、Slack APIクライアント、検索サービス、設定管理を分離
- **Rationale**: 将来的な機能拡張（メッセージ送信、チャンネル管理など）を考慮し、モジュール化された構造が適している
- **Trade-offs**: 初期実装はやや複雑になるが、長期的な保守性と拡張性が向上
- **Follow-up**: 各モジュールのインターフェースを明確に定義し、依存関係を最小化する

### Decision: @slack/boltパッケージの使用

- **Context**: Slack API呼び出しの実装方法
- **Alternatives Considered**:
  1. 直接HTTPリクエスト — より軽量だが実装が複雑
  2. @slack/web-apiパッケージ — 低レベルAPI、実装が複雑
  3. @slack/boltパッケージ — 高レベルフレームワーク、実装が簡単
- **Selected Approach**: `@slack/bolt`パッケージを使用
- **Rationale**: Boltフレームワークにより、型安全性、エラーハンドリング、レート制限対応が容易。Slackアプリ開発のベストプラクティスに準拠
- **Trade-offs**: 依存関係が増えるが、実装の簡素化と保守性の向上が得られる
- **Follow-up**: パッケージのバージョンと互換性を確認

### Decision: MCP公式SDKの使用

- **Context**: MCPサーバー実装の方法
- **Alternatives Considered**:
  1. カスタム実装 — より軽量だが実装が複雑
  2. MCP公式SDK（@modelcontextprotocol/server） — 公式SDK、実装が簡単
- **Selected Approach**: `@modelcontextprotocol/server`パッケージを使用
- **Rationale**: 公式SDKにより、MCPプロトコルの準拠、型安全性、エラーハンドリングが容易。MCP Inspectorとの互換性も確保される
- **Trade-offs**: 依存関係が増えるが、実装の簡素化と保守性の向上が得られる
- **Follow-up**: パッケージのバージョンと互換性を確認

### Decision: MCP Inspectorでのテスト

- **Context**: MCPサーバーのテスト方法
- **Alternatives Considered**:
  1. カスタムテストクライアント — 実装が複雑
  2. MCP Inspector — 公式テストツール、実装が簡単
- **Selected Approach**: MCP Inspectorを使用してテスト
- **Rationale**: 公式ツールにより、MCPプロトコルの準拠確認、デバッグ、開発効率の向上が可能
- **Trade-offs**: 追加のツールが必要だが、テストの品質と効率が向上
- **Follow-up**: MCP Inspectorの使用方法と設定を確認

### Decision: Viteライブラリモードの使用

- **Context**: TypeScriptビルドツールの選択
- **Alternatives Considered**:
  1. tsc直接使用 — シンプルだが設定が限定的
  2. Viteライブラリモード — モダンなビルドツール、設定が柔軟
- **Selected Approach**: Viteのライブラリモードを使用
- **Rationale**: 開発体験が良く、ビルド設定が柔軟。npm linkとの互換性も良好
- **Trade-offs**: 追加の依存関係が必要だが、開発効率が向上
- **Follow-up**: Vite設定ファイルの最適化

## Risks & Mitigations

- **Slack APIレート制限** — 指数バックオフを伴うリトライロジックを実装し、レート制限エラーを適切に処理
- **認証トークンの漏洩** — 環境変数による管理と、トークンの検証を実装
- **無効なチャンネルID** — チャンネルIDの検証と、エラーハンドリングを実装
- **MCPプロトコルの変更** — 標準的な実装パターンに従い、将来の変更に対応可能な設計

## References

- [Slack API Methods Reference](https://docs.slack.dev/reference/methods) — Slack APIメソッドのリファレンス
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — MCP公式SDK
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) — MCPサーバーのテストツール
- [Vite Library Mode](https://vitejs.dev/guide/build.html#library-mode) — Viteライブラリモードの設定
- [npm link Documentation](https://docs.npmjs.com/cli/v8/commands/npm-link) — npm linkの使用方法
