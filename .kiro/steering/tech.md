# Technology Stack

## Architecture

MCP サーバーとして、標準的な MCP プロトコルに準拠したサーバー実装。Slack Web API との通信を抽象化し、AI エージェント向けのツールインターフェースを提供します。

## Core Technologies

- **Language**: JavaScript (TypeScript 対応)
- **Runtime**: Bun (v1.2.21+)
- **Module System**: CommonJS

## Key Libraries

- **@types/bun**: Bun ランタイムの型定義
- **TypeScript**: 型安全性のための peer dependency (^5)

## Development Standards

### Type Safety

- TypeScript 5+ を peer dependency として使用可能
- `jsconfig.json` で TypeScript 互換設定を提供
- Strict mode 推奨（`strict: true` が設定済み）

### Code Quality

- Bun のネイティブ機能を活用
- CommonJS モジュール形式

### Testing

- テストフレームワークは未設定（将来の拡張ポイント）

## Development Environment

### Required Tools

- **Bun**: v1.2.21 以上（プロジェクト作成時のバージョン）
- **Node.js**: Bun がインストールされている環境

### Common Commands

```bash
# Install: bun install
# Run: bun run index.js
# Test: (未設定)
```

## Key Technical Decisions

- **Bun 採用**: 高速な JavaScript ランタイムとして Bun を選択。TypeScript の直接実行とパッケージ管理を統合
- **CommonJS**: MCP サーバーとしての互換性を考慮し、CommonJS モジュール形式を採用
- **TypeScript オプション**: peer dependency として提供し、型安全性を選択可能に

---

_Document standards and patterns, not every dependency_
