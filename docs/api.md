# API リファレンス

本ドキュメントは主要モジュールの公開 API を概観します。詳細な型や実装は各ソースコードを参照してください。

## Types (`src/types.ts`)

ゲーム全体で使用される型定義。

### 主要型（スタブ）

```typescript
// Vector2D: 2次元ベクトル
interface Vector2D {
  x: number;
  y: number;
}

// Player: プレイヤー
interface Player {
  id: string;
  team: TeamType;
  position: Vector2D;
  velocity: Vector2D;
  // ... その他のプロパティ
}

// Ball: ボール
interface Ball {
  position: Vector2D;
  velocity: Vector2D;
  radius: number;
  // ... その他のプロパティ
}

// Pitch: ピッチ
interface Pitch {
  width: number;
  height: number;
  // ... その他のプロパティ
}

// Match: マッチ状態
interface Match {
  teams: Team[];
  ball: Ball;
  pitch: Pitch;
  time: number;
  // ... その他のプロパティ
}

// TeamType: チーム指定
type TeamType = "home" | "away";

// Team: チーム
interface Team {
  name: string;
  players: Player[];
  score: number;
}
```

## Game 層 (`src/game/`)

ゲームロジック。Canvas/DOM に依存しない。

### Pitch (`src/game/pitch.ts`)

```typescript
export class Pitch {
  constructor(width: number, height: number);
  
  // ピッチ内の座標か判定
  isInBounds(position: Vector2D): boolean;
  
  // 座標をピッチ内に制限
  clamp(position: Vector2D): Vector2D;
  
  // ゴール座標取得
  getGoalPosition(team: TeamType): Vector2D;
}
```

### Ball (`src/game/ball.ts`)

```typescript
export class Ball {
  constructor(initialPosition: Vector2D, initialVelocity?: Vector2D);
  
  // ボール更新（物理演算）
  update(dt: number, pitch: Pitch): void;
  
  // ボール位置取得
  getPosition(): Vector2D;
  
  // ボール速度取得
  getVelocity(): Vector2D;
  
  // ボール・プレイヤー衝突時に速度を更新
  bounceFromPlayer(player: Player): void;
}
```

### Player (`src/game/player.ts`)

```typescript
export class Player {
  constructor(id: string, team: TeamType, initialPosition: Vector2D);
  
  // プレイヤー更新
  update(dt: number, pitch: Pitch): void;
  
  // プレイヤー移動コマンド
  move(direction: Vector2D): void;
  
  // プレイヤー位置取得
  getPosition(): Vector2D;
  
  // プレイヤー速度取得
  getVelocity(): Vector2D;
}
```

### Match (`src/game/match.ts`)

```typescript
export class Match {
  constructor(homeTeam: Team, awayTeam: Team, pitch: Pitch);
  
  // マッチ更新
  update(dt: number, playerInputs: PlayerInput[]): void;
  
  // マッチ状態取得
  getState(): MatchState;
  
  // ゴール判定・スコア更新
  checkGoal(): boolean;
  
  // マッチ終了判定
  isFinished(): boolean;
}
```

### Collision (`src/game/collision.ts`)

```typescript
export function checkBallPlayerCollision(
  ball: Ball,
  player: Player
): boolean;

export function checkBallPitchCollision(
  ball: Ball,
  pitch: Pitch
): boolean;

export function resolveBallPlayerCollision(
  ball: Ball,
  player: Player
): void;
```

### Utils (`src/game/utils.ts`)

```typescript
export function add(a: Vector2D, b: Vector2D): Vector2D;
export function subtract(a: Vector2D, b: Vector2D): Vector2D;
export function multiply(v: Vector2D, scalar: number): Vector2D;
export function distance(a: Vector2D, b: Vector2D): number;
export function normalize(v: Vector2D): Vector2D;
```

## Renderer 層 (`src/renderer/`)

描画インターフェース。

### Renderer (`src/renderer/renderer.ts`)

```typescript
export interface Renderer {
  // マッチ状態を描画
  render(matchState: MatchState): void;
  
  // レンダラー初期化
  initialize(): void;
  
  // レンダラー終了処理
  dispose(): void;
}
```

### CanvasRenderer (`src/renderer/canvasRenderer.ts`)

Canvas 2D を使用した具体的な実装。

```typescript
export class CanvasRenderer implements Renderer {
  constructor(canvasElement: HTMLCanvasElement);
  render(matchState: MatchState): void;
  initialize(): void;
  dispose(): void;
}
```

### NullRenderer (`src/renderer/nullRenderer.ts`)

ダミー実装（テスト・ヘッドレス用）。

```typescript
export class NullRenderer implements Renderer {
  render(matchState: MatchState): void;
  initialize(): void;
  dispose(): void;
}
```

## Simulation 層 (`src/simulation/`)

Game と Renderer を統合して実行。

### Simulator (`src/simulation/simulator.ts`)

```typescript
export class Simulator {
  constructor(
    match: Match,
    renderer: Renderer,
    config?: SimulatorConfig
  );
  
  // シミュレーション開始
  start(): void;
  
  // シミュレーション停止
  stop(): void;
  
  // 1フレーム更新
  step(playerInputs?: PlayerInput[]): void;
  
  // 現在のマッチ状態取得
  getMatchState(): MatchState;
}
```

### Config (`src/simulation/config.ts`)

```typescript
export interface SimulatorConfig {
  fps?: number;              // フレームレート（デフォルト: 60）
  matchDurationSeconds?: number;  // マッチ時間（デフォルト: 600）
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export const DEFAULT_CONFIG: SimulatorConfig = {
  fps: 60,
  matchDurationSeconds: 600,
  logLevel: 'info',
};
```

### Logger (`src/simulation/logger.ts`)

```typescript
export function log(level: string, message: string): void;
export function debug(message: string): void;
export function info(message: string): void;
export function warn(message: string): void;
export function error(message: string): void;
```

## エントリポイント

### Headless (`src/headless.ts`)

Node.js 環境でゲームロジックを実行。

```typescript
// 実装例
import { Simulator } from './simulation/index.js';
import { NullRenderer } from './renderer/nullRenderer.js';
import { createDefaultMatch } from './game/index.js';

const renderer = new NullRenderer();
const match = createDefaultMatch();
const simulator = new Simulator(match, renderer);

simulator.start();
```

### Main (`src/main.ts`)

ブラウザ環境でゲームを描画・実行。

```typescript
// 実装例
import { Simulator } from './simulation/index.js';
import { CanvasRenderer } from './renderer/canvasRenderer.js';
import { createDefaultMatch } from './game/index.js';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas);
const match = createDefaultMatch();
const simulator = new Simulator(match, renderer);

simulator.start();
```

---

**注**: 本 API リファレンスはスケルトン時点のものです。実装に伴い詳細が追加・変更されます。
