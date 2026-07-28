# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code (claude.ai/code) に向けたガイダンスです。

## プロジェクト概要

TypeScript で実装する **3対3サッカー試合シミュレーション**（"Soccer Simulation - 3vs3" / `soccer-sim`）。カルチョビット風のパラメータ駆動・自律選手AIが特徴。現状は**スケルトン段階**であり、`src/game/` と `src/simulation/` の大半の関数は未実装スタブ（`throw new Error("not implemented")`）です。また `vitest.config.ts` は `tests/**/*.test.ts` を期待していますが、`tests/` ディレクトリ自体まだ存在しません。

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

単一テストファイルの実行: `npx vitest run tests/game/ball.test.ts`。まだテストファイルは1つも存在しませんが、`vitest.config.ts` の include glob と `docs/architecture.md` の記述から、`tests/<層>/<名前>.test.ts`（例: `tests/game/ball.test.ts`、`tests/simulation/simulator.test.ts`）という配置が本プロジェクトの規約です。

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

ゲームロジックはすべて**関数型**で書かれており、クラスベースではありません: `src/game/index.ts` はプレーンな関数群（`createBall`, `stepBall`, `kickBall`, `createPlayer`, `decideAction`, `stepPlayer`, `resolvePlayerBall`, `resolvePlayerPlayer`, `createInitialState`, `advancePhase`, `stepMatch`, `finalizeResult`）を再エクスポートしており、これらは `src/types.ts` のプレーンなデータオブジェクト（`GameState`, `Ball`, `Player` など）を操作します（メソッドを持つクラスではありません）。唯一の例外が `Pitch` で、これは `src/game/pitch.ts` にクラスとして実装されています。

**`docs/api.md` と `docs/development_guide.md` は古い/理想形の内容**です — これらは以前のクラスベース設計（`class Ball`, `class Player`, `class Match`、`TeamType = "home"|"away"` などのフィールド名）を前提に書かれており、現在の `src/types.ts`（関数型スタイル、`TeamSide = "A"|"B"`、`Vector2D` ではなく `Vec2`、`GameConfig` 駆動のコンストラクション）とは一致しません。両者が食い違う場合は `src/types.ts` および実際の `src/` のソースコードを正としてください。`docs/architecture.md`（層構成・依存関係の説明）は現在も正確です。

主要なドメイン型は `src/types.ts` にあります: `GameState`（phase/turn/half/teams/ball/scoreLog/result）、`Player`（id/team/role/params/pos/vel/state）、`PlayerParams`（speed/passAccuracy/shootPower/vision/aggressiveness — AI調整に必須の5パラメータ）、`Ball`（pos/vel/status/lastKickerId）、`GameConfig`（pitch/player/ball/ai/physics の設定。デフォルト値は `src/config/default.ts` を参照）。`MatchPhase` は試合の状態遷移を表します: `MATCH_START → KICKOFF → PLAYING → GOAL_SCORED → RESTART_SETUP → (HALF_TIME) → MATCH_END`。`PlayerActionState` は選手ごとの行動を表します: `Idle / BallTracking / Possession / Passing / Receiving / Shooting / Marking / MovingToSpace`。

設定値は `GameConfig` に一元化されており（ゲームプレイ定数のハードコード禁止）、調整可能な値（ピッチサイズ、最高速度、AIの距離/確率、物理演算の `dt` など）は `src/config/default.ts` を参照してください。

## 設計仕様書

`specification/features_1_player_ai.md` 〜 `features_4_tech_roadmap.md` および `specification/開発メモ,.md` には、`TODO.md` の各マイルストーンの背景にある詳細な設計意図（選手AIの意思決定、ボール/ピッチ物理、試合ルール、技術ロードマップ）が書かれています。`TODO.md` のマイルストーンを実装する前にこれらを参照してください — コードや型定義には現れない「なぜそうするか」がここにあります。
