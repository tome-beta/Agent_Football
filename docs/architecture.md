# アーキテクチャ

## 概要

本プロジェクトは、**ロジック層が描画層に依存しない**設計となっています。これにより以下を実現します：

- Node.js（ヘッドレス）と ブラウザ（Canvas）の両環境で同じロジックを実行可能
- ロジック層の単体テストが描画に影響されない
- 描画層の変更（Canvas → WebGL など）でロジックに影響なし

## 層構成

### 1. Types 層 (`src/types.ts`)
- ゲーム全体で共有される型定義
- Team, Player, Ball, Pitch, Match などの型

### 2. Game 層 (`src/game/`)
**描画非依存のロジック層**
- `pitch.ts`: ピッチ定義（サイズ、座標系）
- `ball.ts`: ボール物理演算（速度、加速度、移動）
- `player.ts`: プレイヤーロジック（位置、速度、行動）
- `match.ts`: マッチシミュレーション（全体制御、ターン管理）
- `collision.ts`: 衝突判定（ボール ⟷ プレイヤー、ボール ⟷ ピッチ境界）
- `utils.ts`: ベクトル演算など共通ユーティリティ

**特性**：
- 画面座標（pixel）ではなく、物理座標で管理
- Canvas や DOM API に依存しない
- 純粋な計算に基づく

### 3. Renderer 層 (`src/renderer/`)
**描画層**
- `renderer.ts`: 基底インターフェース（描画の抽象化）
- `canvasRenderer.ts`: Canvas 2D による具体的な実装
- `nullRenderer.ts`: ダミー実装（テスト・ヘッドレス時用）

**特性**：
- Game 層のモデル（型）を受け取り、画面に描画
- 物理座標 → 画面座標への変換はここで行う
- 複数の描画バックエンド対応可能

### 4. Simulation 層 (`src/simulation/`)
**Game と Renderer を統合して実行**
- `simulator.ts`: シミュレータ本体（ゲームループ）
- `config.ts`: 設定（フレームレート、ゲーム時間など）
- `logger.ts`: ロギング（デバッグ出力）

### 5. エントリポイント
- `src/headless.ts`: Node.js 環境（第一段階）
  - Renderer は `nullRenderer`
  - ファイルにログ出力、またはコンソール出力
  
- `src/main.ts`: ブラウザ環境（第二段階）
  - Renderer は `canvasRenderer`
  - Canvas に描画

## 依存グラフ

```
types
  ↑
game (types のみ依存)
  ↑
renderer (types + game 依存)
simulation (types + game + renderer 依存)
  ↑
エントリ (headless.ts / main.ts)
```

**重要**: game層は types以外に依存しないため、描画を考慮しない。

## データフロー（一イテレーション）

```
┌─────────────────────────────────────────┐
│ Simulation Loop (Game Loop)             │
├─────────────────────────────────────────┤
│ 1. Input: プレイヤー操作 / AI判定      │
│    ↓                                    │
│ 2. Game.update(dt)                      │
│    - ボール・プレイヤー移動             │
│    - 衝突判定                           │
│    - ゲーム状態更新                     │
│    ↓                                    │
│ 3. Renderer.render(gameState)           │
│    - 画面座標に変換                     │
│    - Canvas に描画                      │
│    ↓                                    │
│ 4. requestAnimationFrame / setInterval  │
│    ↓ (next frame)                      │
│ 1. Input: ...                          │
└─────────────────────────────────────────┘
```

## 拡張性

- **新しい描画バックエンド** (e.g., WebGL): `src/renderer/` に新ファイルを追加
- **ロジック変更**: `src/game/` 層のみ変更、Renderer に影響なし
- **ネットワーク対応**: Simulation に通信ロジックを追加

## テスト戦略

- **ロジックテスト** (`tests/game/*.test.ts`):
  - Game 層の関数を直接テスト
  - Renderer 不要（nullRenderer で十分）
  
- **統合テスト** (`tests/simulation/*.test.ts`):
  - Simulator 全体の動作テスト
  - nullRenderer で検証
  
- **描画テスト** (手動または E2E):
  - Canvas 描画が正しいか確認（後段階）
