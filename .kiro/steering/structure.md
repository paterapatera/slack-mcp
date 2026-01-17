# Project Structure

## Organization Philosophy

シンプルな単一エントリーポイント構造。MCP サーバーとしての機能を段階的に拡張していく設計。現時点では最小限の構造で、機能追加に応じてモジュール化を進めます。

## Directory Patterns

### Root Level

**Location**: `/`  
**Purpose**: プロジェクトの設定ファイルとメインエントリーポイント  
**Example**: `package.json`, `index.js`, `jsconfig.json`

### Configuration

**Location**: `/`  
**Purpose**: プロジェクト設定とワークスペース設定  
**Example**: `package.json`, `jsconfig.json`, `slack-mcp.code-workspace`

### Documentation

**Location**: `/`  
**Purpose**: プロジェクトドキュメント  
**Example**: `README.md`, `AGENTS.md`

## Naming Conventions

- **Files**: kebab-case（例: `slack-mcp.code-workspace`）
- **Main Entry**: `index.js`（CommonJS エントリーポイント）
- **Config Files**: 標準的な命名（`package.json`, `jsconfig.json`）

## Import Organization

```javascript
// 現時点では単一ファイル構造
// 将来的な拡張時は相対インポートを推奨
// import { something } from './lib/something'
```

**Path Aliases**: 未設定（将来的に `@/` などのエイリアスを検討可能）

## Code Organization Principles

- **単一責任**: 各モジュールは明確な責務を持つ
- **段階的拡張**: 必要に応じてディレクトリ構造を追加
- **MCP 準拠**: MCP プロトコルの標準パターンに従う
- **設定の分離**: 認証情報や設定は環境変数や設定ファイルで管理

---

_Document patterns, not file trees. New files following patterns shouldn't require updates_
