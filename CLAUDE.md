# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code (claude.ai/code) に向けたガイダンスです。
受け答えはすべて日本語が基本です。


## プロジェクト概要

TypeScript で実装する **3対3サッカー試合シミュレーション**（"Soccer Simulation - 3vs3" / `soccer-sim`）。カルチョビット風のパラメータ駆動・自律選手AIが特徴。現状は**マイルストーンI（オフサイド判定 ステップ1）まで完了**した段階です（MVP v0.2 + オフサイド回避・ドリブル減速）。型定義・設定・ピッチ・ボール物理・当たり判定・選手AI（`decideAction` / `stepPlayer`）・試合進行（`advancePhase` / `stepMatch`）・`Simulator`・`CanvasRenderer`・オフサイド回避（`isOffside`）はすべて実装済みで、`npm run headless` / `npm run dev` のいずれも動作します。次に着手するのは `TODO.md` の「第二ステップ以降」（スタミナ・選手同士の衝突・オフサイドの反則判定・GK AI など）。

開発は「描画なしのNodeヘッドレス実装」→「Canvas 2D描画の追加」の2段階で進める方針でしたが、**両段階とも完了済み**です。詳細・現在の位置づけは [`docs/development_guide.md`](docs/development_guide.md) §2〜§3 を参照してください。

## コマンド

一覧は [`docs/development_guide.md`](docs/development_guide.md) §1 を参照（`npm run headless`/`dev`/`build`/`typecheck`/`test`/`test:watch`）。**この環境では `npx` が PATH に無いことがあるため、`./node_modules/.bin/vitest run ...` / `./node_modules/.bin/tsc --noEmit` を直接叩くか `/c/Program Files/nodejs` を PATH に追加すること。** テストの配置規約は `tests/<層>/<名前>.test.ts`（例: `tests/game/ball.test.ts`）で `src/` の構成をミラーします。

## アーキテクチャ

層構成・依存グラフ・データフロー図は [`docs/architecture.md`](docs/architecture.md)、型定義・全関数のシグネチャと実装状況は [`docs/api.md`](docs/api.md)、実装時に守るべき規約（`GameConfig`経由・乱数・座標系・`step*`のミューテーション方式など）は [`docs/development_guide.md`](docs/development_guide.md) を参照してください。**これら3つのdocsは実装と同期済みの一次情報源**です。ただし食い違いを見つけた場合は常に `src/types.ts` と実際の `src/` のソースを正とし、docs 側を直してください。

## スキル

`.claude/skills/<スキル名>/SKILL.md` にプロジェクト専用スキルを置ける（書き方は `.claude/skills/README.md` を参照）。同じ手順を繰り返し使うと分かった場合（例: ヘッドレス実行結果の確認手順、ボール物理パラメータの調整・検証フロー、特定レイヤーのスタブ実装〜テスト追加の定型手順など）は、その場で作業するだけでなくスキルとして切り出せないか検討し、有用そうなら追加すること。

## 設計仕様書

`specification/features_1_player_ai.md` 〜 `features_4_tech_roadmap.md` および `specification/開発メモ.md` には、`TODO.md` の各マイルストーンの背景にある詳細な設計意図（選手AIの意思決定、ボール/ピッチ物理、試合ルール、技術ロードマップ）が書かれています。`TODO.md` のマイルストーンを実装する前にこれらを参照してください — コードや型定義には現れない「なぜそうするか」がここにあります。`specification/カルチョビットmemo.md` には元ネタ「カルチョビット」のパラメータ仕様調査（キック/メンタル/スタミナ/フィジカル/スピード/テクニック/ジャンプ）と `PlayerParams` との対応関係をまとめてあり、Phase 2（スタミナ・対人接触）検討時の参考になります。
