# Soccer Simulation - 3vs3

3対3のサッカー試合シミュレーション。カルチョビット風に、**パラメータ設定にしたがって選手が自律的に動いて試合が成立する**ことを目指すプロジェクト。TypeScript で実装し、最終的にブラウザ上で動作します。

## 概要

- **言語**: TypeScript
- **ターゲット**: ブラウザ（Canvas 2D）／ Node ヘッドレス
- **ステータス**: **マイルストーンE（シミュレーション統合・MVP v0.1）完了。マイルストーンF（Canvas 2D 可視化）は一部完了**
  - 実装済み: 型定義・設定（`GameConfig`）・ピッチ・初期状態生成（両チーム3人の配置）・決定的乱数・ベクトル演算・スコア集計・ボール物理（移動/摩擦/速度上限/キック）・当たり判定（キック距離/トラップ/保持追従/奪取）・選手AI（行動ステートマシン・パス/シュート/マーク判定）・試合ルール（フェーズ遷移・ゴール判定・キックオフ/再開・勝敗判定）・`Simulator`（メインループ）・`CanvasRenderer`（ピッチ/選手/ボール/HUD描画）
  - `npm run headless` は例外なく1試合（前後半計1800ターン）を完走し、`npm run dev` でブラウザ上でも試合が自動再生される
  - 未実装: マイルストーンFの残り（開始/一時停止ボタン・選手パラメータ調整UI・デバッグオーバーレイ）、マイルストーンG（テスト・調整）
  - 次の作業: `TODO.md` のマイルストーンF続き、またはG

## 2段階開発アプローチ

### 第一段階：ロジック完成（描画なし・Node ヘッドレス実行）— 完了
- 型定義、ゲームロジック、物理演算、試合シミュレーションを Node.js でヘッドレス実行
- 描画層に依存しない純ロジック実装
- ゴール: `npm run headless` で1試合を完走できること（**MVP v0.1 達成**）

### 第二段階：Canvas 2D 描画統合 — 進行中
- 完成したロジックを入力として Canvas 2D で可視化（`npm run dev`）
- 描画層は `src/renderer/` に集約し、ゲームロジック層（`src/game/`）は描画に依存しない設計を維持
- ピッチ・選手・ボール・HUD の描画は実装済み。開始/一時停止ボタンやパラメータ調整UIなどの操作系は未実装

## ディレクトリ構成

```
project/
├── src/
│   ├── types.ts              # 型定義（GameState, Player, Ball, GameConfig, Renderer など）
│   ├── game/                 # ゲームロジック（描画非依存）
│   │   ├── index.ts
│   │   ├── pitch.ts          # ピッチ定義・境界/ゴール判定（唯一のクラス）
│   │   ├── ball.ts           # ボール物理
│   │   ├── player.ts         # 選手生成・フォーメーション・選手AI
│   │   ├── match.ts          # 試合ルール・状態遷移・スコア
│   │   ├── collision.ts      # 当たり判定（キック距離・トラップ・保持追従・奪取）
│   │   ├── random.ts         # 決定的乱数（Math.random() は使わない）
│   │   └── utils.ts          # ベクトル演算
│   ├── renderer/             # 描画層（Canvas 2D）
│   │   ├── index.ts
│   │   ├── canvasRenderer.ts # Canvas 2D 実装（ピッチ/選手/ボール/HUD描画）
│   │   └── nullRenderer.ts   # ダミー実装（ヘッドレス/テスト用）
│   ├── simulation/           # シミュレーション実行系
│   │   ├── index.ts
│   │   ├── simulator.ts      # ゲームループ
│   │   ├── config.ts         # 設定の読み込み・マージ
│   │   └── logger.ts         # ログ出力
│   ├── config/
│   │   └── default.ts        # デフォルト設定（全ゲームプレイ定数）
│   ├── headless.ts           # Node ヘッドレス実行エントリ（第一段階）
│   └── main.ts               # ブラウザエントリ（第二段階）
├── tests/
│   └── <層>/<名前>.test.ts   # src/ の構成をミラーする（例: tests/game/pitch.test.ts）
├── docs/
│   ├── architecture.md       # 層構成・依存関係・データフロー
│   ├── api.md                # 型と関数のリファレンス
│   └── development_guide.md  # 実装手順と守るべき約束
├── specification/            # 機能設計の元資料（なぜそう作るか）
├── TODO.md                   # マイルストーンと進捗
└── index.html                # ブラウザ HTML（Canvas）
```

## インストール・実行

```bash
npm install          # セットアップ
npm run headless     # 第一段階の検証: Node でシミュレーションを実行
npm run test         # テスト実行（vitest）
npm run test:watch   # ウォッチモード
npm run typecheck    # 型チェック（tsc --noEmit）
npm run dev          # 第二段階: Vite dev server でブラウザ実行
npm run build        # 本番ビルド（型チェック + Vite bundle）
```

> `npx` が PATH に無い環境では `./node_modules/.bin/vitest run` のように直接叩いてください。

`npm run headless` は例外なく試合結果（`Match result: Team A n - m Team B (Winner: ...)`）を出力して終了します。`npm run dev` を開くと自動的に試合が再生されます（操作は不要）。

## 実装するときの約束

詳細は [docs/development_guide.md](docs/development_guide.md) にありますが、特に重要なのは次の5つです。

1. **ゲームプレイ定数は必ず `GameConfig` 経由**（ハードコード禁止）。デフォルト値は `src/config/default.ts`。
2. **`Math.random()` は使わない**。確率判定は `src/game/random.ts` の `nextRandom` / `chance` に `GameState` を渡す（再現性のため）。
3. **時間は秒で扱う**。1ターン = `config.physics.dt` 秒。摩擦は `friction^dt`（`friction` は毎秒の速度保持率）。
4. **`src/game/*` は DOM/Canvas に触れない**。同じロジックを Node とブラウザの両方で動かすための制約。
5. **座標系**: 原点はピッチ中央。チームA は y = -length/2 のゴールを守り、攻撃方向は +y。チームB は逆。

## ドキュメント

- [docs/architecture.md](docs/architecture.md) — 層構成・依存方向・1ターンのデータフロー
- [docs/api.md](docs/api.md) — 型と関数のリファレンス（未実装のものは明記）
- [docs/development_guide.md](docs/development_guide.md) — 実装手順・テストの書き方
- [TODO.md](TODO.md) — マイルストーンごとの進捗
- `specification/features_*.md` — 各機能の設計意図。マイルストーン着手前に読むこと
- `.claude/skills/` — 定型作業のスキル（`implement-stub`＝スタブ実装の型、`verify`＝検証手順、`find-bugs`＝再現検証付きバグ調査）

ドキュメントとコードが食い違う場合は、**常に `src/types.ts` と実際のソースコードが正**です。
