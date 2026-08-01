# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code (claude.ai/code) に向けたガイダンスです。
受け答えはすべて日本語が基本です。


## プロジェクト概要

TypeScript で実装する **3対3サッカー試合シミュレーション**（"Soccer Simulation - 3vs3" / `soccer-sim`）。カルチョビット風のパラメータ駆動・自律選手AIが特徴。現状は**マイルストーンF（Canvas 2D可視化）まで完了**した段階です（MVP v0.2）。型定義・設定・ピッチ・ボール物理・当たり判定・選手AI（`decideAction` / `stepPlayer`）・試合進行（`advancePhase` / `stepMatch`）・`Simulator`・`CanvasRenderer` はすべて実装済みで、`npm run headless` / `npm run dev` のいずれも動作します。次に着手するのは `TODO.md` のマイルストーンG（テスト・調整）およびH（ポジショニング刷新: 力の合成モデルによる非保持時の団子化解消）。

開発は2段階で進めます：
1. **第一段階（現在の主眼）**: 描画なし・Node ヘッドレスでのロジック実装 — 描画を一切介さずに1試合を正しくシミュレートできる状態を目指す。
2. **第二段階**: 完成したロジックの上に Canvas 2D 描画を追加。

## コマンド

```bash
npm install         # セットアップ
npm run headless    # src/headless.ts を Node（tsx）上で実行 — 第一段階の検証用
npm run dev          # Vite dev server、ブラウザで Canvas 描画 — 第二段階
npm run build        # tsc --noEmit && vite build
npm run typecheck    # tsc --noEmit
npm run test          # vitest run — 全テスト実行
npm run test:watch   # vitest ウォッチモード
```

単一テストファイルの実行: `npx vitest run tests/game/ball.test.ts`。テストの配置規約は `tests/<層>/<名前>.test.ts`（例: `tests/game/ball.test.ts`、`tests/simulation/simulator.test.ts`）で、`src/` の構成をミラーします。

なお、この環境では `npx` が PATH に無いことがあります。その場合は `./node_modules/.bin/vitest run ...` / `./node_modules/.bin/tsc --noEmit` を直接叩くか、`/c/Program Files/nodejs` を PATH に追加してください。

## アーキテクチャ

ツールで強制されているわけではなく規約ベースですが、厳格な一方向依存になっています：

```
types (src/types.ts)
  ← game (src/game/*)          — 純粋ロジック、Canvas/DOM 非依存
  ← renderer (src/renderer/*)  — types + game に依存
  ← simulation (src/simulation/*) — game と renderer を統合
  ← エントリポイント: headless.ts（Node）/ main.ts（ブラウザ）
```

`src/game/*` は `src/renderer/*` を import したり DOM/Canvas API に触れたりしてはいけません — これにより同じ試合ロジックを Node ヘッドレスとブラウザの両方で実行可能にしています。Renderer 実装は `src/types.ts` の `Renderer` インターフェース経由で差し替え可能です（ブラウザ用 `CanvasRenderer`、ヘッドレス/テスト用 `NullRenderer`）。

ゲームロジックはすべて**関数型**で書かれており、クラスベースではありません: `src/game/index.ts` はプレーンな関数群（`createBall`, `stepBall`, `kickBall`, `createPlayer`, `createTeam`, `formationPos`, `decideAction`, `stepPlayer`, `canKick`, `resolvePlayerBall`, `resolveBallPossession`, `resolvePlayerPlayer`, `createInitialState`, `currentScore`, `advancePhase`, `stepMatch`, `finalizeResult`, `nextRandom`, `chance`）を再エクスポートしており、これらは `src/types.ts` のプレーンなデータオブジェクト（`GameState`, `Ball`, `Player` など）を操作します（メソッドを持つクラスではありません）。唯一の例外が `Pitch` で、これは `src/game/pitch.ts` にクラスとして実装されています。`step*` 系の関数は引数のオブジェクトを直接書き換え、戻り値を返しません。

`docs/api.md` と `docs/development_guide.md` は現在の実装に合わせて更新済みです（`docs/architecture.md` も正確）。ただし食い違いを見つけた場合は常に `src/types.ts` と実際の `src/` のソースを正とし、docs 側を直してください。

主要なドメイン型は `src/types.ts` にあります: `GameState`（phase/phaseTurn/turn/half/kickoffSide/teams/ball/scoreLog/rngSeed/result）、`Player`（id/team/role/params/homePos/pos/vel/state）、`PlayerParams`（speed/passAccuracy/shootPower/vision/aggressiveness — AI調整に必須の5パラメータ）、`Ball`（pos/vel/status/**possessorId**/lastKickerId — `possessorId` が現在の保持者、`lastKickerId` は最終キック者で別物）、`Team`（side/name/tactics/players）、`GameConfig`。`MatchPhase` は試合の状態遷移を表します: `MATCH_START → KICKOFF → PLAYING → GOAL_SCORED → RESTART_SETUP → (HALF_TIME) → MATCH_END`。`PlayerActionState` は選手ごとの行動を表します: `Idle / BallTracking / Possession / Passing / Receiving / Shooting / Marking / MovingToSpace`。役割は `FW/MF/DF` の3種のみで、**GKは第一ステップでは扱いません**（`specification/features_3_match_rules.md` にGK前提の記述がありますが、こちらが正）。

### 実装時に必ず守る約束

- **ゲームプレイ定数は必ず `GameConfig` 経由**（ハードコード禁止）。デフォルト値は `src/config/default.ts`。新しい調整値が必要になったら `GameConfig` にキーを追加する。
- **`Math.random()` は使わない**。確率判定は `src/game/random.ts` の `nextRandom` / `chance` に `GameState` を渡す（乱数状態は `GameState.rngSeed`）。テストと試合の再現性のため。
- **時間は秒で扱う**。1ターン = `config.physics.dt` 秒（デフォルト 0.1）。位置更新は `pos += vel * dt`、摩擦は `vel *= friction^dt`（`config.ball.friction` は**毎秒の**速度保持率）。
- **座標系**: 原点はピッチ中央、x = タッチライン方向、y = ゴールライン方向。**チームA は y = -length/2 のゴールを守り（攻撃方向 +y）、チームB はその逆**。`Pitch.isInGoalA()` は「チームAのゴールに入った」＝**チームBの得点**である点に注意。
- **スコアは `scoreLog` が単一の情報源**。別カウンタを持たず `currentScore(state)` で集計する。
- **ボールの保持者調停は `resolveBallPossession(players, ball, config, prevBallPos, rng)`**（毎ターン1回、選手の移動後）。`resolvePlayerBall` は選手1人分（トラップと追従）しか見ず、奪取・インターセプト・最近接ルールは扱わない。`prevBallPos` は当ターンの `stepBall` 呼び出し前のボール位置（パスのインターセプト判定で軌跡＝線分として使う）、`rng` は確率判定用（`GameState` を渡す）。
- **Node 側から `NullRenderer` を使うときは `src/renderer/nullRenderer` を直接 import** する（`src/renderer/index.ts` 経由だと DOM 依存の `CanvasRenderer` を巻き込む）。

## スキル

`.claude/skills/<スキル名>/SKILL.md` にプロジェクト専用スキルを置ける（書き方は `.claude/skills/README.md` を参照）。同じ手順を繰り返し使うと分かった場合（例: ヘッドレス実行結果の確認手順、ボール物理パラメータの調整・検証フロー、特定レイヤーのスタブ実装〜テスト追加の定型手順など）は、その場で作業するだけでなくスキルとして切り出せないか検討し、有用そうなら追加すること。

## 設計仕様書

`specification/features_1_player_ai.md` 〜 `features_4_tech_roadmap.md` および `specification/開発メモ.md` には、`TODO.md` の各マイルストーンの背景にある詳細な設計意図（選手AIの意思決定、ボール/ピッチ物理、試合ルール、技術ロードマップ）が書かれています。`TODO.md` のマイルストーンを実装する前にこれらを参照してください — コードや型定義には現れない「なぜそうするか」がここにあります。`specification/カルチョビットmemo.md` には元ネタ「カルチョビット」のパラメータ仕様調査（キック/メンタル/スタミナ/フィジカル/スピード/テクニック/ジャンプ）と `PlayerParams` との対応関係をまとめてあり、Phase 2（スタミナ・対人接触）検討時の参考になります。
