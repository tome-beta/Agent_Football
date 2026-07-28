# API リファレンス

`src/` の実装に対応した API 一覧。**正は常に `src/types.ts` と実際のソース**であり、本ドキュメントとの食い違いを見つけたらソース側を信じ、本ドキュメントを直すこと。

未実装の関数は `throw new Error("not implemented")` のスタブとして存在する。本ドキュメントでは **(未実装)** と記す。

---

## 1. 設計上の前提

- **関数型**。`Pitch` を除きクラスは使わず、プレーンなデータ（`GameState` / `Player` / `Ball`）を関数が操作する。
- **ミューテーション方式**。`stepBall` / `stepPlayer` / `stepMatch` などの `step*` 系は引数のオブジェクトを直接書き換え、戻り値を返さない。
- **単位系**。距離 = メートル、速度 = m/s、時間 = 秒。1ターン = `config.physics.dt` 秒。
- **座標系**。原点はピッチ中央。x = タッチライン方向（±`width/2`）、y = ゴールライン方向（±`length/2`）。
  **チームA は y = -length/2 のゴールを守り、チームB は y = +length/2 のゴールを守る。**
  （`specification/features_3_match_rules.md` は「x軸方向にゴール・0〜100座標」と書いているが、これは実装とは異なる古い記述。）
- **乱数**。`Math.random()` は使わない。乱数状態は `GameState.rngSeed` として保持し、`nextRandom()` が進める。

---

## 2. 型定義（`src/types.ts`）

### Vec2
```ts
interface Vec2 { x: number; y: number }
```

### TeamSide / Role / PlayerActionState
```ts
type TeamSide = "A" | "B";
type Role = "FW" | "MF" | "DF";   // GK は第一ステップでは扱わない
type PlayerActionState =
  | "Idle" | "BallTracking" | "Possession" | "Passing"
  | "Receiving" | "Shooting" | "Marking" | "MovingToSpace";
```

### PlayerParams
AI調整の中核となる5パラメータ。
| フィールド | 意味 | 目安 |
|---|---|---|
| `speed` | 最高速度 [m/s] | 4.5〜7.5 |
| `passAccuracy` | パス方向のブレの少なさ | 0.5〜1.0 |
| `shootPower` | シュート成功率の係数 | 0.5〜1.0 |
| `vision` | 視野角 [度] | 50〜150 |
| `aggressiveness` | 攻撃志向の重み | 0.3〜0.9 |

### Player
```ts
interface Player {
  id: string;              // 例: "A-FW"
  team: TeamSide;
  role: Role;
  params: PlayerParams;
  homePos: Vec2;           // フォーメーション上の定位置（再開時に戻る基準）
  pos: Vec2;
  vel: Vec2;
  state: PlayerActionState;
}
```

### Ball
```ts
interface Ball {
  pos: Vec2;
  vel: Vec2;
  status: "Free" | "Possessed" | "OutOfBounds";
  possessorId: string | null;   // 現在の保持者。status !== "Possessed" なら null
  lastKickerId: string | null;  // 最後に蹴った選手。保持者とは別物（再開権・得点者判定用）
}
```

### Team / TeamTactics
```ts
interface TeamTactics { aggressiveness: number; formationWidth: number }
interface Team { side: TeamSide; name: string; tactics: TeamTactics; players: Player[] }
```

### GameState
```ts
interface GameState {
  phase: MatchPhase;
  phaseTurn: number;        // 現フェーズに入ってからの経過ターン（タイムアウト判定用）
  turn: number;
  half: 1 | 2;
  kickoffSide: TeamSide;    // 次のキックオフを行うチーム
  teams: { A: Team; B: Team };
  ball: Ball;
  scoreLog: ScoreLogEntry[];  // スコアは常にここから集計する（単一の情報源）
  rngSeed: number;
  result: MatchResult | null;
}
```

`MatchPhase` は `MATCH_START → KICKOFF → PLAYING → GOAL_SCORED → RESTART_SETUP → (HALF_TIME) → MATCH_END`。

```ts
interface ScoreLogEntry { team: TeamSide; playerId: string; turn: number }
interface MatchResult { scoreA: number; scoreB: number; winner: TeamSide | "Draw"; durationTurns: number }
```

### GameConfig
ゲームプレイ定数はすべてここに集約する（ロジック側でのハードコード禁止）。デフォルト値は `src/config/default.ts`。

| セクション | キー | 意味 |
|---|---|---|
| `pitch` | `width` / `length` / `goalWidth` | ピッチ幅・長さ・ゴール総幅 [m]（判定は `abs(x) <= goalWidth/2`） |
| `player` | `maxSpeed` / `radius` | 選手の速度上限・半径 |
| `ball` | `radius` / `friction` / `stopThreshold` / `maxSpeed` | `friction` は**毎秒の速度保持率**。適用は `friction^dt` |
| `ai` | `ballControlDistance` / `trapDistance` / `trapMaxBallSpeed` / `tackleDistance` / `passDistance` / `shootDistance` / `shootProbability` | 各種判定距離・確率 |
| `team` | `roleParams` / `formation` / `tactics` / `names` | 役割別パラメータ・定位置・戦術・チーム名 |
| `match` | `turnsPerHalf` / `goalScoredTurns` / `restartSetupTurns` / `kickoffTurns` | ハーフのターン数と各フェーズの滞在ターン数 |
| `physics` | `dt` | 1ターンの秒数 |
| `random` | `seed` | 決定的シミュレーションのシード |

`team.formation` は**自陣基準の比率**。`x` は `width/2`、`y` は `length/2` に対する比率で、`y = -1` が自ゴール側・`+1` が敵ゴール側。チームB は x・y ともに符号を反転して実座標に変換される。

---

## 3. `src/game/utils.ts` — ベクトル演算

すべて純粋関数で、新しい `Vec2` を返す（引数は変更しない）。

| 関数 | シグネチャ |
|---|---|
| `add` | `(a: Vec2, b: Vec2) => Vec2` |
| `sub` | `(a: Vec2, b: Vec2) => Vec2` |
| `scale` | `(v: Vec2, s: number) => Vec2` |
| `length` | `(v: Vec2) => number` |
| `normalize` | `(v: Vec2) => Vec2`（零ベクトルは零ベクトルを返す） |
| `distance` | `(a: Vec2, b: Vec2) => number` |
| `clampMagnitude` | `(v: Vec2, max: number) => Vec2` |

---

## 4. `src/game/pitch.ts` — ピッチ

```ts
class Pitch {
  constructor(config: GameConfig);
  readonly width: number;    // config.pitch.width
  readonly length: number;   // config.pitch.length
  readonly goalWidth: number;
  isInBounds(pos: Vec2): boolean;  // 境界線上は「イン」
  isInGoalA(pos: Vec2): boolean;   // チームA のゴール内 = チームB の得点
  isInGoalB(pos: Vec2): boolean;   // チームB のゴール内 = チームA の得点
}
```

`isInGoalA` / `isInGoalB` の名前は**そのゴールの持ち主**を指す。得点したチームは逆側である点に注意。

---

## 5. `src/game/random.ts` — 決定的乱数

```ts
interface RngHolder { rngSeed: number }
function nextRandom(holder: RngHolder): number;                       // [0, 1)
function nextRandomRange(holder: RngHolder, min: number, max: number): number;
function chance(holder: RngHolder, p: number): boolean;               // 確率 p で true
```

`GameState` がそのまま `RngHolder` を満たすため `nextRandom(state)` と呼べる。同じ `rngSeed` からは常に同じ系列が得られる。

---

## 6. `src/game/ball.ts` — ボール

| 関数 | シグネチャ | 状態 |
|---|---|---|
| `createBall` | `() => Ball` | 実装済み。中央・静止・`Free` |
| `stepBall` | `(ball: Ball, config: GameConfig) => void` | **(未実装)** 位置更新→摩擦→速度上限→停止閾値 |
| `kickBall` | `(ball: Ball, dir: Vec2, power: number, kickerId: string) => void` | **(未実装)** 速度設定・`lastKickerId` 更新・保持解除 |

---

## 7. `src/game/player.ts` — 選手

| 関数 | シグネチャ | 状態 |
|---|---|---|
| `createPlayer` | `(id, team, role, params, homePos) => Player` | 実装済み。`pos` は `homePos` のコピー |
| `formationPos` | `(side: TeamSide, role: Role, config: GameConfig) => Vec2` | 実装済み。比率→実座標 |
| `createTeam` | `(side: TeamSide, config: GameConfig) => Team` | 実装済み。FW/MF/DF 各1人を定位置に配置 |
| `decideAction` | `(player, state, config) => void` | **(未実装)** 行動ステートマシン |
| `stepPlayer` | `(player, config) => void` | **(未実装)** 速度に従う位置更新 |

---

## 8. `src/game/collision.ts` — 当たり判定

| 関数 | シグネチャ | 状態 |
|---|---|---|
| `resolvePlayerBall` | `(player, ball, config) => boolean` | **(未実装)** トラップ／奪取の成否を返す |
| `resolvePlayerPlayer` | `(a, b, config) => void` | **(未実装)** 第一ステップでは実質 no-op（選手同士は通り抜ける） |

---

## 9. `src/game/match.ts` — 試合ルール

| 関数 | シグネチャ | 状態 |
|---|---|---|
| `createInitialState` | `(config: GameConfig) => GameState` | 実装済み。両チーム3人を配置し `MATCH_START` で開始 |
| `currentScore` | `(state: GameState) => { A: number; B: number }` | 実装済み。`scoreLog` から集計 |
| `advancePhase` | `(state, config) => void` | **(未実装)** フェーズ遷移 |
| `stepMatch` | `(state, config) => void` | **(未実装)** 1ターン進める |
| `finalizeResult` | `(state: GameState) => MatchResult` | 実装済み。同点は `"Draw"` |

---

## 10. `src/simulation/`

```ts
function loadConfig(partial?: Partial<GameConfig>): GameConfig;
```
デフォルト設定にセクション単位で浅くマージする（`team` のみネストを1段深くマージ）。デフォルト設定オブジェクトは変更しない。

```ts
class Simulator {
  constructor(config: GameConfig, renderer: Renderer, logger?: Logger);
  readonly state: GameState;
  step(): void;        // (未実装)
  run(): GameState;    // (未実装)
}

interface Logger {
  logTurn(state: GameState): void;
  logGoal(entry: ScoreLogEntry): void;
  logResult(state: GameState): void;
}
class ConsoleLogger implements Logger {}   // 実装済み
```

---

## 11. `src/renderer/`

```ts
interface Renderer {
  init(): void;
  clear(): void;
  drawPitch(config: GameConfig): void;
  drawPlayers(players: Player[]): void;
  drawBall(ball: Ball): void;
  drawHud(state: GameState): void;
}
```

- `NullRenderer` — 全メソッド no-op。ヘッドレス実行・テスト用。**Node 側からは `src/renderer/nullRenderer` を直接 import すること**（`src/renderer/index.ts` 経由だと DOM 依存の `CanvasRenderer` を巻き込む）。
- `CanvasRenderer` — **(未実装)** 第二段階で実装する。
