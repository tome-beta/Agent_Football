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
- `canvasRenderer.ts`: Canvas 2D による具体的な実装（未実装。第二段階で着手）
- `nullRenderer.ts`: ダミー実装（テスト・ヘッドレス時用）

抽象インターフェース `Renderer` は Types 層（`src/types.ts`）に置いています。Renderer 層が「差し替え可能な実装の集まり」であるのに対し、その契約は game / simulation 層からも参照されるためです。

**Node から `NullRenderer` を使うときは `src/renderer/nullRenderer` を直接 import すること。** `src/renderer/index.ts` 経由だと DOM 依存の `CanvasRenderer` を巻き込みます。

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

## データフロー（1ターン）

1ターン = `config.physics.dt` 秒。`Simulator.step()` が以下を1回まわします。

```
┌──────────────────────────────────────────────────────┐
│ Simulator.step()                                     │
├──────────────────────────────────────────────────────┤
│ 1. decideAction(player, state, config)  … 全選手     │
│      行動ステートマシンで意思決定・キック指示        │
│    ↓                                                 │
│ 2. stepPlayer(player, config)           … 全選手     │
│      pos += vel * dt                                 │
│    ↓                                                 │
│ 3. stepBall(ball, config)                            │
│      位置更新 → 摩擦 → 速度上限 → 停止閾値          │
│    ↓                                                 │
│ 4. resolvePlayerBall(player, ball, config) … 全選手  │
│      トラップ・奪取判定                              │
│    ↓                                                 │
│ 5. stepMatch(state, config)                          │
│      ゴール／アウト判定、フェーズ遷移、ターン加算    │
│    ↓                                                 │
│ 6. Renderer（drawPitch / drawPlayers / drawBall /    │
│    drawHud）と Logger へ出力                         │
│    ↓ 次のターンへ                                    │
└──────────────────────────────────────────────────────┘
```

ブラウザでは `requestAnimationFrame` が、ヘッドレスでは `Simulator.run()` のループがこの `step()` を駆動します。ゲームロジック側はどちらで動かされているかを知りません。

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
