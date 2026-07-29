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
| `ai` | `ballControlDistance` / `trapDistance` / `trapMaxBallSpeed` / `tackleDistance` / `passDistance` / `shootDistance` / `shootProbability` / `visionDistance` / `passSpeed` / `shootSpeed` / `aimErrorMaxDeg` | 各種判定距離・確率。`visionDistance` は選手が味方/敵/ボールを認識できる距離（視野角は `PlayerParams.vision`）、`passSpeed`/`shootSpeed` はキックの基準初速、`aimErrorMaxDeg` は `passAccuracy`/`shootPower` が0のときの最大キック角度誤差 |
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
| `stepBall` | `(ball: Ball, config: GameConfig) => void` | 実装済み。位置更新→摩擦→速度上限→停止閾値 |
| `kickBall` | `(ball: Ball, dir: Vec2, power: number, kickerId: string) => void` | 実装済み。速度設定・`lastKickerId` 更新・保持解除 |

`stepBall` は features_2 §5.1 の順序で1ターン進めます。

1. `pos += vel * dt`
2. `vel *= friction^dt`（`friction` は毎秒の保持率なので `dt` 乗する）
3. `|vel| <= ball.maxSpeed` にクランプ
4. `|vel| < ball.stopThreshold` なら完全に停止

`status` が `Possessed` / `OutOfBounds` のときは何もしません。保持中のボールは保持者に追従するため `resolvePlayerBall` が動かし、アウト中のボールは再開処理（マイルストーンD）を待ちます。

`kickBall` は `dir` を正規化して扱うため、`dir` の大きさは速さに影響しません（速さは `power` [m/s]）。零ベクトルを渡すと速度0でボールを手放します。`config` を受け取らないので**速度上限はここでは掛からず**、次の `stepBall` が適用します。`lastKickerId` を更新するのはこの関数だけです（奪取では更新しない）。方向の誤差は乗せません（第一ステップは決定的。`passAccuracy` による揺らぎは選手AI側で `dir` に加える）。

---

## 7. `src/game/player.ts` — 選手

| 関数 | シグネチャ | 状態 |
|---|---|---|
| `createPlayer` | `(id, team, role, params, homePos) => Player` | 実装済み。`pos` は `homePos` のコピー |
| `formationPos` | `(side: TeamSide, role: Role, config: GameConfig) => Vec2` | 実装済み。比率→実座標 |
| `createTeam` | `(side: TeamSide, config: GameConfig) => Team` | 実装済み。FW/MF/DF 各1人を定位置に配置 |
| `decideAction` | `(player, state, config) => void` | 実装済み。ボール保持状況で4分岐し `player.state` と `player.vel` を更新する（保持中はシュート/パス/ドリブル判定、敵保持中はマーク、味方保持中はスペース移動、フリーボールは最近接選手のみ追跡） |
| `stepPlayer` | `(player, config) => void` | 実装済み。`decideAction` が設定した `vel` に従って `pos += vel * dt` し、ピッチ範囲内にクランプする |

---

## 8. `src/game/collision.ts` — 当たり判定

| 関数 | シグネチャ | 状態 |
|---|---|---|
| `canKick` | `(player, ball, config) => boolean` | 実装済み。`ai.ballControlDistance` 以内か |
| `resolvePlayerBall` | `(player, ball, config) => boolean` | 実装済み。解決後にこの選手が保持しているかを返す |
| `resolveBallPossession` | `(players: Player[], ball, config) => void` | 実装済み。全選手を見て保持者を決める |
| `resolvePlayerPlayer` | `(a, b, config) => void` | 実装済み（**意図的に no-op**。第一ステップでは選手同士は通り抜ける） |

### 責務の分け方

`resolvePlayerBall` は**選手1人とボールの関係**だけを扱います。

- 自分が保持中 → ボールを自分に追従させる（`pos` / `vel` をコピー。参照は共有しない）
- フリーボール → `ai.trapDistance` 以内かつ `|vel| <= ai.trapMaxBallSpeed` なら保持する
- 他選手が保持中 → **何もしない**

**奪取をここで扱わないのは意図的です。** 味方から奪ってはいけないので保持者のチームを知る必要がありますが、`Ball` は `possessorId` しか持たないため単独では判定できません。同じ理由で「複数選手が範囲内なら最も近い選手が保持」（features_2 §4.1）も1人分の情報では表現できません。

そこで全体の調停は `resolveBallPossession(players, ball, config)` が担当します。毎ターン1回、選手の移動後に呼びます。

- 保持者がいる → 相手チームで `ai.tackleDistance` 以内の選手のうち**最も近い1人**が奪う。奪取時は `vel = 0` にし、**`lastKickerId` は変えない**（蹴っていないため）。奪う者がいなければ保持者に追従させる
- フリーボール → トラップ条件を満たす選手のうち最も近い1人が保持する
- `possessorId` が `players` に見つからない場合はフリーボールに戻して復帰させる
- `OutOfBounds` のときは何もしない

---

## 9. `src/game/match.ts` — 試合ルール

| 関数 | シグネチャ | 状態 |
|---|---|---|
| `createInitialState` | `(config: GameConfig) => GameState` | 実装済み。両チーム3人を配置し `MATCH_START` で開始 |
| `currentScore` | `(state: GameState) => { A: number; B: number }` | 実装済み。`scoreLog` から集計 |
| `advancePhase` | `(state, config) => void` | 実装済み。フェーズごとのタイムアウト（`config.match.*Turns`）を見て次のフェーズへ遷移する。`MATCH_START`/`RESTART_SETUP`/`HALF_TIME`→`KICKOFF` への遷移はキックオフ再配置（選手を定位置へ・ボールを中央へ・`kickoffSide` の選手に持たせる）を伴う。`PLAYING` は `state.turn` がハーフ終了ターン数に達したら `HALF_TIME`（前半）または `MATCH_END`＋`finalizeResult`（後半）へ |
| `stepMatch` | `(state, config) => void` | 実装済み。`turn`/`phaseTurn` を進め、`PLAYING` 中はゴール判定（`Pitch.isInGoalA`/`isInGoalB`）とアウトオブバウンズの簡易再開（中央へ戻し、最後のキッカーの相手チームで中央に最も近い選手に持たせる）を行い、最後に `advancePhase` を呼ぶ。ゴール検出はイベント駆動で即座に `GOAL_SCORED` へ遷移し `scoreLog` に追記、`kickoffSide` を失点側に設定する。選手AI・ボール物理・当たり判定の呼び出しは含まない（Simulator/マイルストーンEの責務） |
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
