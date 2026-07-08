# Soccer Simulation - 3vs3

3対3のサッカーゲームシミュレーション実装プロジェクト。TypeScript で開発し、ブラウザ上で動作します。

## 概要

- **言語**: TypeScript
- **ターゲット**: ブラウザ（Canvas 2D）
- **ゲーム**: 3対3サッカーマッチシミュレーション
- **ステータス**: スケルトン（雛形）— 各モジュールは未実装スタブです

## 2段階開発アプローチ

このプロジェクトは2段階で実装を進めます：

### 第一段階：ロジック完成（描画なし・Node ヘッドレス実行）
- 型定義、ゲームロジック、物理演算、マッチシミュレーションなど核となるロジックを Node.js でヘッドレス実行
- 描画層に依存しない純ロジック実装
- テストケースはこの段階で充実

### 第二段階：Canvas 2D 描画統合
- ゲームロジックを入力として、Canvas 2D で可視化
- 描画層は `src/renderer/` に集約
- ゲームロジック層（`src/game/`）は描画に依存しない設計を維持

## ディレクトリ構成

```
project/
├── src/
│   ├── types.ts              # 型定義（Team, Player, Ball, Pitch など）
│   ├── game/                 # ゲームロジック（描画非依存）
│   │   ├── index.ts
│   │   ├── pitch.ts          # ピッチ定義
│   │   ├── ball.ts           # ボール物理
│   │   ├── player.ts         # プレイヤーロジック
│   │   ├── match.ts          # マッチシミュレーション
│   │   ├── collision.ts      # 衝突判定
│   │   └── utils.ts          # ユーティリティ
│   ├── renderer/             # 描画層（Canvas 2D）
│   │   ├── index.ts
│   │   ├── renderer.ts       # 基底レンダラー
│   │   ├── canvasRenderer.ts # Canvas 2D 実装
│   │   └── nullRenderer.ts   # ダミーレンダラー（テスト用）
│   ├── simulation/           # シミュレーション実行系
│   │   ├── index.ts
│   │   ├── simulator.ts      # シミュレータ本体
│   │   ├── config.ts         # 設定管理
│   │   └── logger.ts         # ロギング
│   ├── config/
│   │   └── default.ts        # デフォルト設定
│   ├── headless.ts           # Node ヘッドレス実行エントリ（第一段階）
│   └── main.ts               # ブラウザエントリ（第二段階）
├── tests/
│   └── *.test.ts             # テストケース
├── docs/
│   ├── architecture.md       # アーキテクチャ説明
│   ├── api.md                # 公開 API 仕様
│   └── development_guide.md  # 開発手順
├── index.html                # ブラウザ HTML（Canvas）
├── package.json              # npm スクリプト・依存関係
├── tsconfig.json             # TypeScript 設定
├── vite.config.ts            # Vite ビルド設定
├── vitest.config.ts          # Vitest テスト設定
├── .gitignore                # Git 無視設定
└── README.md                 # このファイル
```

## インストール・実行

### セットアップ

```bash
npm install
```

### 第一段階：ロジック検証（Node ヘッドレス）

```bash
npm run headless
```

Node.js 上でマッチシミュレーションを実行し、ロジックが正常に動作するか検証します。

### 第二段階：ブラウザで実行

```bash
npm run dev
```

ブラウザで Canvas 2D 描画を含むゲームを実行します（Vite dev server）。

### ビルド

```bash
npm run build
```

本番用にビルドします（型チェック + Vite bundle）。

### テスト

```bash
npm run test
```

すべてのテストを実行します。

```bash
npm run test:watch
```

ウォッチモードでテストを実行（開発時）。

### 型チェック

```bash
npm run typecheck
```

TypeScript 型チェックを実行します。

## スタブ実装について

このスケルトンの各モジュールは未実装スタブです。例：

```typescript
export function someFunction(): void {
  throw new Error("not implemented");
}
```

開発時は、この `throw` 部分を実装に置き換えていきます。関連するテストも追加してください。

## アーキテクチャ

詳細は [docs/architecture.md](docs/architecture.md) を参照してください。

### 層構成
- **types**: 共有型定義
- **game**: ゲームロジック（描画非依存）
- **renderer**: 描画層（game に依存）
- **simulation**: シミュレーション実行（game と renderer を統合）
- **エントリ**: headless.ts（Node）、main.ts（ブラウザ）

### 依存方向（一方向）
```
types ← game ← [renderer / simulation]
```

## 開発ガイド

詳細は [docs/development_guide.md](docs/development_guide.md) を参照してください。

### 基本フロー
1. 型定義を `src/types.ts` に追加
2. `src/game/*` で純ロジックを実装・テスト
3. `src/renderer/*` で描画を実装（第二段階）
4. `src/main.ts` / `src/headless.ts` で統合

## API リファレンス

主要モジュールの public API は [docs/api.md](docs/api.md) を参照してください。
