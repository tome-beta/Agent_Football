# 開発ガイド

本プロジェクトをスタブ（未実装スタブ）から実装へ進める際のガイドです。

## 開発フロー

### 1. 型定義の確認・追加（`src/types.ts`）

まず必要な型をすべて `src/types.ts` に定義します。

```typescript
// 例: Vector2D
export interface Vector2D {
  x: number;
  y: number;
}

// 例: Player
export interface Player {
  id: string;
  team: TeamType;
  position: Vector2D;
  velocity: Vector2D;
  maxSpeed: number;
}
```

**注意**: 型は後から必要に応じて追加できるので、最初からすべて完璧にする必要はありません。

### 2. ゲームロジック実装（`src/game/*`）

**重要**: この層は描画に依存しないため、Canvas/DOM API は使いません。

#### 2.1 Pitch（ピッチ）の実装

```typescript
// src/game/pitch.ts
export class Pitch {
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  
  isInBounds(position: Vector2D): boolean {
    return (
      position.x >= 0 && position.x <= this.width &&
      position.y >= 0 && position.y <= this.height
    );
  }
  
  clamp(position: Vector2D): Vector2D {
    return {
      x: Math.max(0, Math.min(this.width, position.x)),
      y: Math.max(0, Math.min(this.height, position.y)),
    };
  }
}
```

#### 2.2 Ball（ボール）の実装

```typescript
// src/game/ball.ts
export class Ball {
  private position: Vector2D;
  private velocity: Vector2D;
  private readonly radius: number = 0.2; // meter
  private readonly friction: number = 0.98;
  
  constructor(initialPosition: Vector2D, initialVelocity?: Vector2D) {
    this.position = initialPosition;
    this.velocity = initialVelocity ?? { x: 0, y: 0 };
  }
  
  update(dt: number, pitch: Pitch): void {
    // ボール移動
    this.position = {
      x: this.position.x + this.velocity.x * dt,
      y: this.position.y + this.velocity.y * dt,
    };
    
    // 摩擦力を適用
    this.velocity = multiply(this.velocity, this.friction);
    
    // ピッチ境界で反射
    if (!pitch.isInBounds(this.position)) {
      this.position = pitch.clamp(this.position);
      this.velocity = multiply(this.velocity, -1); // 反射
    }
  }
  
  getPosition(): Vector2D {
    return this.position;
  }
  
  getVelocity(): Vector2D {
    return this.velocity;
  }
}
```

#### 2.3 Player（プレイヤー）の実装

```typescript
// src/game/player.ts
export class Player {
  private position: Vector2D;
  private velocity: Vector2D;
  private readonly maxSpeed: number = 15; // m/s
  private currentDirection: Vector2D = { x: 0, y: 0 };
  
  constructor(
    public readonly id: string,
    public readonly team: TeamType,
    initialPosition: Vector2D
  ) {
    this.position = initialPosition;
    this.velocity = { x: 0, y: 0 };
  }
  
  move(direction: Vector2D): void {
    // 方向を正規化して速度を設定
    const normalized = normalize(direction);
    this.velocity = multiply(normalized, this.maxSpeed);
  }
  
  update(dt: number, pitch: Pitch): void {
    // プレイヤー移動
    this.position = {
      x: this.position.x + this.velocity.x * dt,
      y: this.position.y + this.velocity.y * dt,
    };
    
    // ピッチ内に制限
    this.position = pitch.clamp(this.position);
  }
  
  getPosition(): Vector2D {
    return this.position;
  }
}
```

#### 2.4 Collision（衝突判定）の実装

```typescript
// src/game/collision.ts
export function checkBallPlayerCollision(
  ball: Ball,
  player: Player
): boolean {
  const ballPos = ball.getPosition();
  const playerPos = player.getPosition();
  const dist = distance(ballPos, playerPos);
  const collisionRadius = ball.radius + 0.3; // player radius
  return dist < collisionRadius;
}

export function resolveBallPlayerCollision(
  ball: Ball,
  player: Player
): void {
  // ボール速度をプレイヤー方向に変更
  const ballPos = ball.getPosition();
  const playerPos = player.getPosition();
  const direction = normalize(subtract(ballPos, playerPos));
  const kickPower = 20; // m/s
  ball.setVelocity(multiply(direction, kickPower));
}
```

#### 2.5 Match（マッチ）の実装

```typescript
// src/game/match.ts
export class Match {
  private homeTeam: Team;
  private awayTeam: Team;
  private ball: Ball;
  private pitch: Pitch;
  private time: number = 0;
  
  constructor(homeTeam: Team, awayTeam: Team, pitch: Pitch) {
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
    this.pitch = pitch;
    this.ball = new Ball({ x: pitch.width / 2, y: pitch.height / 2 });
  }
  
  update(dt: number, playerInputs: PlayerInput[]): void {
    // ボール更新
    this.ball.update(dt, this.pitch);
    
    // プレイヤー更新
    [...this.homeTeam.players, ...this.awayTeam.players].forEach(
      (player) => {
        player.update(dt, this.pitch);
      }
    );
    
    // 衝突判定
    this.homeTeam.players.forEach((player) => {
      if (checkBallPlayerCollision(this.ball, player)) {
        resolveBallPlayerCollision(this.ball, player);
      }
    });
    
    // 時間更新
    this.time += dt;
    
    // ゴール判定（ここで簡略化）
    this.checkGoal();
  }
  
  private checkGoal(): void {
    const ballPos = this.ball.getPosition();
    const pitch = this.pitch;
    
    // 右ゴール（away チームが得点）
    if (ballPos.x >= pitch.width) {
      this.awayTeam.score += 1;
      this.resetBall();
    }
    // 左ゴール（home チームが得点）
    if (ballPos.x <= 0) {
      this.homeTeam.score += 1;
      this.resetBall();
    }
  }
  
  private resetBall(): void {
    this.ball = new Ball({
      x: this.pitch.width / 2,
      y: this.pitch.height / 2,
    });
  }
  
  getState(): MatchState {
    return {
      homeTeam: this.homeTeam,
      awayTeam: this.awayTeam,
      ball: this.ball,
      pitch: this.pitch,
      time: this.time,
    };
  }
}
```

### 3. テスト追加（`tests/*`）

各モジュールの実装と並行して、テストを追加します。

```typescript
// tests/game/ball.test.ts
import { describe, it, expect } from 'vitest';
import { Ball } from '../../src/game/ball.js';
import { Pitch } from '../../src/game/pitch.js';

describe('Ball', () => {
  it('should move forward when velocity is set', () => {
    const ball = new Ball({ x: 0, y: 0 }, { x: 10, y: 0 });
    const pitch = new Pitch(100, 100);
    
    ball.update(0.1, pitch);
    
    const pos = ball.getPosition();
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.y).toEqual(0);
  });
  
  it('should not go out of bounds', () => {
    const ball = new Ball({ x: 99, y: 50 }, { x: 100, y: 0 });
    const pitch = new Pitch(100, 100);
    
    ball.update(1, pitch);
    
    const pos = ball.getPosition();
    expect(pos.x).toBeLessThanOrEqual(100);
  });
});
```

**テスト実行**:

```bash
npm run test           # すべてのテストを実行
npm run test:watch    # ウォッチモード
```

### 4. 描画層実装（`src/renderer/*` — 第二段階）

ロジックが完成した後、描画層を実装します。

```typescript
// src/renderer/canvasRenderer.ts
export class CanvasRenderer implements Renderer {
  private ctx: CanvasRenderingContext2D;
  
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }
  
  render(matchState: MatchState): void {
    this.clear();
    
    // ピッチを描画
    this.drawPitch(matchState.pitch);
    
    // ボールを描画
    this.drawBall(matchState.ball);
    
    // プレイヤーを描画
    this.drawPlayers(matchState.homeTeam);
    this.drawPlayers(matchState.awayTeam);
    
    // スコアを描画
    this.drawScore(matchState.homeTeam, matchState.awayTeam);
  }
  
  private clear(): void {
    this.ctx.fillStyle = '#2d5016';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  
  private drawBall(ball: Ball): void {
    const pos = ball.getPosition();
    // 物理座標 → 画面座標に変換
    const screenX = this.toScreenX(pos.x);
    const screenY = this.toScreenY(pos.y);
    
    this.ctx.fillStyle = 'white';
    this.ctx.beginPath();
    this.ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  private toScreenX(worldX: number): number {
    // 簡略化: 1:1 スケール
    return worldX;
  }
  
  private toScreenY(worldY: number): number {
    return worldY;
  }
  
  // ... 他のメソッド
}
```

### 5. エントリポイント実装

#### 5.1 Headless（第一段階）

```typescript
// src/headless.ts
import { Simulator } from './simulation/index.js';
import { NullRenderer } from './renderer/nullRenderer.js';
import { Match } from './game/match.js';
import { Pitch } from './game/pitch.js';
import { Player } from './game/player.js';

const pitch = new Pitch(105, 68);

const homeTeam = {
  name: 'Home',
  score: 0,
  players: [
    new Player('h1', 'home', { x: 20, y: 34 }),
    new Player('h2', 'home', { x: 50, y: 20 }),
    new Player('h3', 'home', { x: 50, y: 48 }),
  ],
};

const awayTeam = {
  name: 'Away',
  score: 0,
  players: [
    new Player('a1', 'away', { x: 85, y: 34 }),
    new Player('a2', 'away', { x: 55, y: 20 }),
    new Player('a3', 'away', { x: 55, y: 48 }),
  ],
};

const match = new Match(homeTeam, awayTeam, pitch);
const renderer = new NullRenderer();
const simulator = new Simulator(match, renderer);

simulator.start();
```

**実行**:

```bash
npm run headless
```

#### 5.2 Main（第二段階）

```typescript
// src/main.ts
import { Simulator } from './simulation/index.js';
import { CanvasRenderer } from './renderer/canvasRenderer.js';
import { Match } from './game/match.js';
import { Pitch } from './game/pitch.js';
import { Player } from './game/player.js';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = 1050;  // ピッチ幅 × 10
canvas.height = 680;  // ピッチ高さ × 10

// ... same setup as headless ...

const renderer = new CanvasRenderer(canvas);
const simulator = new Simulator(match, renderer);

simulator.start();
```

**実行**:

```bash
npm run dev
```

## チェックリスト

開発を進める際の確認事項：

- [ ] 型定義が完成している
- [ ] ゲームロジック（game 層）が実装されている
- [ ] game 層のテストが 70% 以上カバーしている
- [ ] `npm run typecheck` で型エラーがない
- [ ] `npm run test` で全テストが通っている
- [ ] `npm run headless` でロジックが正常に動作する
- [ ] 描画層実装は game 層に依存していない
- [ ] `npm run dev` でブラウザでの描画が確認できる
- [ ] README.md が最新状態に保たれている

## トラブルシューティング

### 型エラーが出ている

```bash
npm run typecheck
```

で詳細を確認。`src/types.ts` に必要な型定義があるか確認してください。

### テストが失敗する

```bash
npm run test:watch
```

で失敗箇所を詳しく確認。ロジック実装の見直しが必要かもしれません。

### ブラウザで描画されない

1. DevTools の Console でエラーを確認
2. `src/main.ts` でエントリが正しいか確認
3. Canvas 要素が `index.html` にあるか確認

## 参考資料

- [アーキテクチャ](./architecture.md)
- [API リファレンス](./api.md)
- README.md の「ディレクトリ構成」セクション

---

**始め方**:
1. `npm install`
2. `src/types.ts` 型定義を完成させる
3. `src/game/*` をスタブから実装へ
4. `tests/game/*` でテスト追加
5. `npm run headless` で確認
6. `src/renderer/*` を実装（第二段階）
7. `npm run dev` でブラウザ確認
