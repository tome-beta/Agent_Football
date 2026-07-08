# 足軽3：技術基盤・描画・ロードマップ検討（TypeScript/ブラウザ版）

## 1. 技術選定（TypeScript / ブラウザ技術）

### 1.1 主要描画技術候補と比較

#### Canvas 2D API（CanvasRenderingContext2D）
- **概要**：ブラウザ標準 API。2D グラフィックスを効率的に描画。依存ゼロ、学習曲線が緩く、カスタマイズ性が高い
- **向き**：2D ゲーム、選手自律移動・ボール物理・AI ロジック実装に最適。充実したドキュメント（MDN）・ブラウザネイティブ
- **不向き**：3D 対応なし、高度なエフェクトは実装工数が増す
- **推奨度**：**高** - 第一ステップの描画実装に最適選択（旧 Pygame の位置）

#### PixiJS（WebGL ラッパー）
- **概要**：WebGL ベースでより高速な 2D 描画。モダン API、充実したプラグインエコシステム
- **向き**：高フレームレート要求、複雑なパーティクル効果、スケーラブル実装
- **不向き**：依存増、セットアップ複雑化、今の要件には過度
- **推奨度**：**中** - 代替選択肢としては有効（旧 Arcade の位置）

#### WebGL / Three.js
- **概要**：フル 3D 対応ライブラリ、高度なグラフィックス。学習曲線が高い
- **向き**：3D ゲーム、高度なビジュアルエフェクト
- **不向き**：2D 平面描画には複雑すぎ、初期実装の負荷が大きい
- **推奨度**：**低** - 今の要件には複雑すぎ不採用（旧 Pyglet の位置）

### 1.2 開発アプローチ：段階的導入

**推奨アプローチ：純ロジック版 → Canvas 描画版への段階的展開**

**第一段階（シミュレーション開発フェーズ）**
- 描画なし（純 TypeScript、DOM/Canvas 非依存）
- Node 上でヘッドレス実行（tsx / vite-node で `src/headless.ts`）
- ゲームロジック・AI・物理シミュレーション開発に集中
- コンソール出力（console.log）でゲーム進行を確認
- 高速な試行錯誤が可能
- **推奨期間**：Phase 1-5

**第二段階（ビジュアル化フェーズ）**
- Canvas 2D API を導入し、既実装のゲームロジックに描画機能を追加
- Renderer 抽象層を挟むことで、ロジック層と完全に独立
- ブラウザで実行（Vite 開発サーバー、`src/main.ts` エントリ）
- **推奨期間**：Phase 6-7

**メリット**：
- ゲームロジックの検証が高速（描画オーバーヘッドなし）
- 描画層の有無を切り替え可能（デバッグ・テストが容易）
- AI パラメータ調整をコンソール出力で効率的に実施可能

---

## 2. 描画・可視化機能（第一ステップ）

### 2.1 ピッチ描画
- **機能名**：ピッチレンダリング
- **概要**：サッカーグラウンド を矩形で描画。グリッドラインは任意（デバッグ用）
- **優先度**：**高**
- **第一ステップに含める**：Yes（Phase 6）
- **実装メモ**：
  - ピッチサイズ固定（例：100m × 60m をスクリーンに射影）
  - グリーン背景、白線（ハーフラインなど）
  - ゴールラインの色分け（チームカラー対応）

### 2.2 選手描画
- **機能名**：プレイヤーレンダリング
- **概要**：選手を円形（またはアイコン）で表示。チームで色分け、番号表示
- **優先度**：**高**
- **第一ステップに含める**：Yes（Phase 6）
- **実装メモ**：
  - 円形 r=1m 程度の見た目
  - チーム1：青、チーム2：赤 などの基本配色
  - プレイヤー番号を中央に表示（フォントサイズ小）
  - 方向インジケータ（三角形 or 矢印）をプレイヤー内に表示

### 2.3 ボール描画
- **機能名**：ボールレンダリング
- **概要**：ボール を小さな円で表示。位置と速度ベクトルを示す
- **優先度**：**高**
- **第一ステップに含める**：Yes（Phase 6）
- **実装メモ**：
  - 円形 r=0.2m 程度
  - 白色
  - オプション：速度ベクトル矢印表示（デバッグ用）

### 2.4 スコア・基本情報表示
- **機能名**：HUD（Head-Up Display）
- **概要**：スコア、試合時間、ボール所有権などをスクリーン上部に表示
- **優先度**：**高**
- **第一ステップに含める**：Yes（Phase 6）
- **実装メモ**：
  - フォント：15-20 pt
  - 情報：「Team A: 2 - Team B: 1 | Time: 10:30」形式
  - ボール所有チーム表示（ハイライト）

### 2.5 デバッグ表示（オプション）
- **機能名**：デバッグオーバーレイ
- **概要**：選手の目標位置、視野範囲、速度ベクトル、AI 状態などを表示。デバッグ・パラメータ調整用
- **優先度**：**中**
- **第一ステップに含める**：Yes（Phase 6 後半）- 必須ではなく、あると便利
- **実装メモ**：
  - フラグで有効/無効を切り替え可能（config で設定）
  - プレイヤーごと：目標位置（十字）、速度ベクトル（矢印）
  - テキスト表示：各選手の状態（"Passing", "Running to Ball"など）
  - ボール所有者のID 表示

### 2.6 実況・ログ出力（コンソール）
- **機能名**：ゲームイベントログ
- **概要**：ゴール、パス、シュートなどのゲームイベントをコンソール出力
- **優先度**：**中**
- **第一ステップに含める**：Yes（Phase 5 から）
- **実装メモ**：
  - ログレベル設定可能（INFO, DEBUG）
  - タイムスタンプ付き
  - 例：「[00:05] Team A #3 shoots! Goal!」

---

## 3. ゲームループ基本構造

### 3.1 固定タイムステップ方式（推奨）

```
Loop:
  1. Input Processing     - ユーザー入力（キーボード等）取得
  2. Game Logic Update    - AI 判定、ボール移動、衝突判定を 1 タイムステップ進める
  3. Collision & Physics  - ボール・選手の衝突処理
  4. Rendering (if enabled) - 画面描画
  5. Frame Regulation     - 目標フレームレートに同期
```

### 3.2 フレームレートとタイムステップ

- **ターゲットフレームレート**：60 FPS（16.67 ms/フレーム）
  - 標準的なディスプレイ（60 Hz）と同期
  - スムーズな表示と十分な応答性

- **ゲームロジックタイムステップ**：
  - **オプション A**：フレームと同期（60 倍速）
    - シンプル、フレームスキップ対応容易
  - **オプション B**：複数ティック/フレーム（例：120 ティック/秒、2 倍速実行）
    - より精密なシミュレーション、ただし複雑性増
  - **推奨**：オプション A（60 FPS）で開始、後に加速再生オプション追加

### 3.3 時間経過の管理

```typescript
const dt = 1.0 / 60.0;  // 1 フレーム = 1/60 秒（現実時間）
const gameDt = 1.0 / 60.0;  // ゲーム内時間ステップ

// requestAnimationFrame + 固定タイムステップ対応：
let lastTime = performance.now();
let accumulated = 0;

function gameLoop(currentTime: number) {
  const elapsed = (currentTime - lastTime) / 1000;  // 秒単位に変換
  lastTime = currentTime;
  accumulated += elapsed;
  
  while (accumulated > gameDt) {
    updateGame(gameDt);
    accumulated -= gameDt;
  }
  
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
```

---

## 4. モジュール構成案

### 4.1 ディレクトリ・ファイル構成

```
project/
├── src/
│   ├── types.ts                 # 共通型定義
│   ├── game/                    # ゲームロジック層
│   │   ├── index.ts
│   │   ├── match.ts             # 試合管理、スコア、ルール
│   │   ├── player.ts            # 選手データ、AI ロジック
│   │   ├── ball.ts              # ボール物理、移動
│   │   ├── pitch.ts             # ピッチ定義、定数
│   │   ├── collision.ts         # 衝突判定
│   │   └── utils.ts             # ベクトル計算など
│   │
│   ├── renderer/                # 描画層（抽象層 + 実装）
│   │   ├── index.ts
│   │   ├── renderer.ts          # 描画抽象インターフェース
│   │   ├── canvasRenderer.ts    # Canvas 2D API 実装
│   │   └── nullRenderer.ts      # ダミー実装（描画なし版用）
│   │
│   ├── simulation/              # シミュレーション実行エンジン
│   │   ├── index.ts
│   │   ├── simulator.ts         # メインゲームループ
│   │   ├── config.ts            # 設定管理（TS 定数）
│   │   └── logger.ts            # ゲームイベントログ
│   │
│   ├── config/
│   │   └── default.ts           # デフォルト設定（TS 定数、旧 YAML）
│   │
│   ├── headless.ts              # 第一段階エントリ（Node ヘッドレス実行）
│   └── main.ts                  # 第二段階エントリ（ブラウザ）
│
├── tests/                       # テストコード（Vitest）
│   ├── player_ai.test.ts
│   ├── ball_physics.test.ts
│   ├── match_rules.test.ts
│   ├── collision.test.ts
│   └── vitest.config.ts
│
├── docs/
│   ├── architecture.md          # アーキテクチャ説明
│   ├── api.md                   # モジュール API 仕様
│   └── development_guide.md     # 開発者ガイド
│
├── index.html                   # ブラウザエントリーポイント
├── package.json                 # Node 依存パッケージ
├── tsconfig.json                # TypeScript 設定
├── vite.config.ts               # Vite 設定
├── README.md                    # プロジェクト概要
└── .gitignore
```

### 4.2 主要モジュールの役割

| モジュール | 責任 | 依存先 |
|-----------|------|--------|
| match.ts | 試合ルール、スコア管理、ゴール判定 | player, ball, pitch |
| player.ts | 選手データ、AI ロジック、移動制御 | pitch, ball |
| ball.ts | ボール物理、速度・加速度、境界判定 | pitch |
| pitch.ts | ピッチ定義、座標系、定数 | なし |
| collision.ts | 選手-ボール、選手-ピッチ衝突判定 | player, ball, pitch |
| simulator.ts | メインループ、時間進行、各層の更新順序制御 | game.*, renderer.* |
| renderer.ts | 描画インターフェース定義（抽象） | game.* |
| canvasRenderer.ts | Canvas 2D API を使った具体的な描画実装 | game.*, Canvas API |
| config.ts | TS 定数オブジェクト、パラメータ提供 | なし |

### 4.3 レイヤー設計のポイント

- **ゲームロジック層（game/）**：renderer に依存しない
  - テスト容易（描画なしで動作検証可能）
  - AI パラメータ調整が独立実施可能
  
- **描画層（renderer/）**：ゲームロジック層に一方向依存
  - 抽象インターフェース経由で実装を切り替え可能
  - Canvas なしでも動作（NullRenderer 使用）
  
- **シミュレーション層（simulation/）**：全層を調整
  - タイムステップ管理
  - ゲームループ制御
  - 入力・描画の統合

---

## 5. 開発段階的ロードマップ

### 5.1 全体工程表

| Phase | 名称 | 内容 | 推奨期間 | 成果物 |
|-------|------|------|---------|--------|
| 1 | 基本構造構築 | ピッチ定義、データモデル、設定管理 | 1-2 日 | game/ モジュール基盤、config（TS定数） |
| 2 | ボール物理 | 速度・加速度、ピッチ境界衝突 | 1 日 | ball.ts, collision.ts |
| 3 | 選手 AI | 移動ロジック、ボール認識、パス・シュート判定 | 2-3 日 | player.ts, 基本 AI 実装 |
| 4 | 試合ルール | ゴール判定、スコア管理、試合終了 | 1 日 | match.ts |
| 5 | シミュレーション検証 | ゲームループ、コンソール出力、デバッグログ | 1 日 | simulator.ts, logger.ts |
| 6 | 描画実装 | Canvas セットアップ、ピッチ・選手・ボール描画 | 2-3 日 | canvasRenderer.ts, HUD |
| 7 | テスト・チューニング | パラメータ調整、AI 動作確認、バグ修正 | 1-2 日 | テストスイート、バランス調整 |

**推定合計期間：9-13 日間（マイルストーン：Phase 5 後に初 MVP）**

### 5.2 各 Phase の詳細

#### Phase 1：基本構造構築（1-2 日）

**目標**：ゲームの骨組み完成、各層の初期化可能

**実装項目**：
- `pitch.ts`：ピッチサイズ（例 100m × 60m）、チームエリア定義、定数管理
- `player.ts`：Player クラス（位置、速度、チーム、ID）、初期配置ロジック
- `ball.ts`：Ball クラス（位置、速度）
- `match.ts`：Match クラス（スコア、時間）
- `config.ts`：TypeScript 定数読み込み、パラメータオブジェクト化
- `src/config/default.ts`：初期パラメータ（選手速度、ボール加速度など）

**確認項目**：
- 6 選手 + 1 ボールをメモリ上で初期化可能
- TypeScript 定数から設定読み込み可能
- 簡単なコンソール出力で状態確認可能

---

#### Phase 2：ボール物理（1 日）

**目標**：ボールがリアルに動く

**実装項目**：
- `ball.ts` 拡張：
  - `update(dt)` メソッド：位置 += 速度 × dt
  - 加速度（空気抵抗減衰）: v *= 0.95^dt など
  - ピッチ境界判定：境界外なら反射 or 止める
  
- `collision.ts`：
  - ボール-選手衝突判定（距離計算）
  - 衝突時の速度変更ロジック（反発係数）

**確認項目**：
- ボール を蹴ると移動・減速する
- ピッチ外に出ない（or 反射する）
- 選手とボール衝突で速度が変わる

---

#### Phase 3：選手 AI（2-3 日）

**目標**：選手が自律的に動く、パス・シュートの基本判定

**実装項目**：
- `player.ts` 拡張：
  - `decideAction(matchState)` メソッド：
    - ボール所有判定（距離 < threshold）
    - 次のアクション決定：Run, Pass, Shoot など
    
  - `runToTarget(target, dt)`：指定位置に向かって移動
    - 目標位置への方向計算
    - 最大速度制限
    - 衝突回避（同じチームメイトとの接触を避ける）
    
  - `passTo(teammate)` / `shootToGoal()`：パス・シュート
    - ボール速度設定

- 基本 AI ロジック：
  - ボール所有者に近い選手が移動
  - ボール所有者がシュート or パス決定
  - その他の選手はポジション維持またはサポートポジション移動

**確認項目**：
- 選手がボールに近づく
- ボール所有権が移動する
- パス・シュートが発生（コンソール出力で確認）

---

#### Phase 4：試合ルール（1 日）

**目標**：ゴール判定、スコア管理、試合状態管理

**実装項目**：
- `match.ts` 拡張：
  - `checkGoal(ball)` メソッド：ボール が ゴールラインを超えたか判定
  - `updateScore(team)` メソッド：スコア加算
  - `getElapsedTime()` / `isMatchEnded()` メソッド
  - ボール所有権管理（最後に接触した選手のチーム）

**確認項目**：
- ゴールが判定される
- スコアが増加する
- 試合が所定時間で終了する

---

#### Phase 5：シミュレーション検証（1 日）

**目標**：描画なし完全ゲーム実行、デバッグログ確認

**実装項目**：
- `simulator.ts`：メインゲームループ実装
  ```typescript
  while (match.isOngoing()) {
      for (const player of match.players) {
          player.decideAction(match);
          player.update(dt);
      }
      match.ball.update(dt);
      checkCollisions();
      match.update(dt);
      logger.logEvents();
  }
  ```

- `logger.ts`：ゲームイベントログ
  - ゴール、パス、シュート、ボール所有権変更など出力

- `nullRenderer.ts`：描画なし実装（引数を受け付けるが何もしない）

**確認項目**：
- コンソール出力で試合進行が確認できる
- パス・シュート・ゴールが発生する
- 一試合が完走する

---

#### Phase 6：描画実装（2-3 日）

**目標**：Canvas で ビジュアル化、リアルタイム試合閲覧可能

**実装項目**：
- `canvasRenderer.ts`：
  - `constructor(canvas, screenSize)`：Canvas 初期化
  - `renderPitch()`：ピッチ描画（fillRect / strokeRect）
  - `renderPlayers(players)`：選手描画（arc + fill、チームカラー、番号）
  - `renderBall(ball)`：ボール描画（arc + fill）
  - `renderHud(match)`：スコア・時間表示（fillText）
  - `renderDebug(match)` (オプション)：デバッグ情報

- `main.ts`：
  - Canvas 初期化
  - config 読み込み
  - Match / Simulator 生成
  - requestAnimationFrame でループを実行

**確認項目**：
- ブラウザ canvas にピッチが表示される
- 選手・ボール が描画される
- スコア・時間が更新される
- ゲームの流れが視覚的に確認できる

---

#### Phase 7：テスト・チューニング（1-2 日）

**目標**：AI パラメータ最適化、バグ修正、テストスイート完成

**実装項目**：
- ユニットテスト（Vitest）：
  - `player_ai.test.ts`：AI ロジック単体テスト
  - `ball_physics.test.ts`：ボール物理テスト
  - `match_rules.test.ts`：ゴール判定など
  - `collision.test.ts`：衝突判定テスト

- パラメータ調整：
  - `src/config/default.ts`：プレイ感調整
    - 選手最大速度
    - ボール加速度・減衰
    - パス判定距離
    - シュート判定距離
    - AI 判断ルール（いつシュートするか等）

- 動作確認：
  - 複数試合を連続実行し、安定性確認
  - AI のバリエーション確認（同じ試合でも毎回異なる結果が出るか）

**確認項目**：
- テストが全て PASS（vitest で実行）
- AI パラメータで ゲーム難易度 / バランスを調整可能
- 複数回実行でも安定動作

---

### 5.3 マイルストーン

| マイルストーン | 時期 | 成果 |
|---------------|------|------|
| **MVP v0.1** | Phase 5 後 | 3 対 3 ゲーム、描画なし実行可能、パス・シュート・ゴール発生 |
| **MVP v0.2** | Phase 6 後 | Canvas でビジュアル化、リアルタイム閲覧可能 |
| **Release v1.0** | Phase 7 後 | テスト完備、パラメータ調整完了、リリース品質 |

---

## 6. テスト・調整戦略

### 6.1 パラメータ調整の仕組み

**TypeScript 定数ベース設定方針**

```typescript
// src/config/default.ts の例

export const config = {
  pitch: {
    width: 100,              // m
    height: 60,              // m
  },
  player: {
    max_speed: 8.0,          // m/s
    max_acceleration: 15.0,  // m/s²
    radius: 1.0,             // m
  },
  ball: {
    radius: 0.2,             // m
    friction_coefficient: 0.95,  // 1 フレームごとに v *= this
    bounce_coefficient: 0.8,     // 壁反射時
  },
  ai: {
    ball_distance_threshold: 2.0,   // m（この距離内ならボール所有）
    pass_target_distance: 15.0,     // m（この距離内にいる選手にパス可能）
    shoot_target_distance: 20.0,    // m（この距離内ならシュート可能）
    shoot_probability: 0.3,         // ボール所有時、30% でシュート判定
  },
  physics: {
    delta_time: 0.01667,  // 1/60 秒
    collision_damping: 0.8,  // 衝突時の反発係数
  },
} as const;
```

**パラメータ調整の流れ**：
1. `src/config/default.ts` を編集
2. プログラム再起動（ビルド時型チェック）
3. コンソール/画面で AI の動作を観察
4. パラメータ微調整を繰り返す

### 6.2 AI 動作確認方法

#### 方法 1：コンソール出力（Phase 5+）
```
[00:00] Match started. Team A vs Team B
[00:01] Team A #1 acquired ball
[00:03] Team A #1 passes to Team A #2
[00:05] Team A #2 shoots!
[00:05] GOAL! Team A scores. (1-0)
[00:08] Ball reset to center
```

**メリット**：
- 描画オーバーヘッドなし（高速実行）
- ゲームイベント追跡容易
- デバッグログ記録可能

#### 方法 2：デバッグ表示（Phase 6+）
- 各選手の状態テキスト（"Passing", "Running to Ball"など）表示
- 選手の目標位置（十字マーク）表示
- ボール所有者 ID 表示
- パス・シュート候補を線で表示（オプション）

**メリット**：
- ビジュアル確認が容易
- AI の判断を視覚化
- プレイ感の直感的理解

#### 方法 3：統計出力（Phase 7）
複数試合を高速実行し、統計を集計：
```
--- Game Statistics (10 matches) ---
Average goals per team: 2.3
Average match duration: 20:00
Pass success rate: 65%
Possession balance: Team A 48% - Team B 52%
```

### 6.3 よくある調整ポイント

| 現象 | 原因の仮説 | 調整項目 |
|------|-----------|---------|
| ゲームが単調（パスばかり） | シュート判定が厳しい | `shoot_probability` 増加、`shoot_target_distance` 拡大 |
| AI がボールを蹴れない | 衝突判定が厳しい | `collision_damping` 増加、選手 radius 拡大 |
| 選手が速すぎて制御不能 | 最大速度が高い | `max_speed` 削減 |
| ボールが止まらない | 減衰係数が小さい | `friction_coefficient` 削減（0.95 → 0.90） |
| ゴール判定が起きない | ゴール判定ロジックバグ | match.ts の checkGoal() を確認 |

---

## 7. 実装上の注意点

### 7.1 コーディング原則

- **ゲームロジックと描画の分離**：game/ 層は renderer に一切依存しないこと
- **パラメータの外部化**：ハードコードは避け、src/config/default.ts で一元管理
- **テスト駆動**：各モジュール実装後、Vitest でユニットテスト作成

### 7.2 よく忘れるバグ

- **フレームスキップ未対応**：`dt` を使わず固定値で移動すると、フレームレート変動で挙動が変わる
- **衝突の二重判定**：選手-ボール衝突を毎フレーム複数回判定しない
- **初期化忘れ**：各フェーズ開始時に状態をリセット（スコア = 0 など）

### 7.3 拡張性を見据えたポイント

**将来の拡張を想定**（今の Phase 1-7 では未実装）：
- 6 人以上の選手対応（モジュール的には対応済み）
- 浮き球・ヘディング（ボール Z 軸追加）
- キーパー特殊ロジック（player.ts に role フィールド追加）
- 試合回数を増やす league シミュレーション

---

## 8. 開発ロードマップ（推奨着手順）

### 推奨実装順序

```
Week 1:
├─ Phase 1：基本構造（Day 1）
│  └─ project/src/game/, project/src/simulation/ 骨組み
├─ Phase 2：ボール物理（Day 2）
│  └─ project/src/game/ball.ts, collision.ts
│
Week 2:
├─ Phase 3：選手 AI（Day 3-4）
│  └─ project/src/game/player.ts, 基本 AI ロジック
├─ Phase 4：試合ルール（Day 5）
│  └─ project/src/game/match.ts
├─ Phase 5：シミュレーション検証（Day 6）
│  └─ project/src/simulation/simulator.ts, logger.ts
│
Week 3:
├─ Phase 6：描画実装（Day 7-8）
│  └─ project/src/renderer/canvasRenderer.ts, project/src/main.ts
├─ Phase 7：テスト・チューニング（Day 9-10）
│  └─ project/tests/, src/config/ パラメータ調整

MVP v0.1: Phase 5 終了後（Day 6）
  →  描画なしで 3 対 3 ゲーム完全動作
  
MVP v0.2: Phase 6 終了後（Day 8）
  →  Canvas でビジュアル化
  
Release v1.0: Phase 7 終了後（Day 10）
  →  テスト完備、本番品質
```

### 各タスク担当分け（マルチエージェント対応）

| 担当者 | タスク | Phase |
|--------|--------|-------|
| 足軽1 | 選手 AI（player.ts） | Phase 3 |
| 足軽2 | ボール物理（ball.ts, collision.ts） | Phase 2 |
| 足軽3 | 試合ルール（match.ts） | Phase 4 |
| 足軽4 | 技術基盤・ロードマップ（このドキュメント） | Phase 1, 5, 6 |

---

## 9. 成功基準

### Phase 別の成功基準

| Phase | 成功基準 |
|-------|---------|
| 1 | game/ 各モジュール import 可能、初期化エラーなし |
| 2 | コンソール出力で「ボール位置: (x, y)」が毎フレーム更新される |
| 3 | コンソール出力で「Player #1 runs to (x, y)」などが出力される |
| 4 | ゴール判定が動作、スコア表示が更新される |
| 5 | 完全な試合（前後半など）がシミュレーション可能、ゲームイベントログ出力 |
| 6 | ブラウザ canvas でリアルタイム試合映像が表示される |
| 7 | 20 試合連続実行でクラッシュなし、AI 動作にバリエーション |

---

## 10. 参考リソース（実装時参照）

### ブラウザ・TypeScript 標準 API
- MDN Canvas API：https://developer.mozilla.org/docs/Web/API/Canvas_API
- MDN requestAnimationFrame：https://developer.mozilla.org/docs/Web/API/window/requestAnimationFrame
- TypeScript Handbook：https://www.typescriptlang.org/docs/

### ビルド・開発ツール
- Vite：https://vitejs.dev
- Vitest：https://vitest.dev

### ゲーム開発の基本
- ゲームループパターン
- 固定タイムステップの実装
- ベクトル計算（2D physics）

### チューニング参考例
- FIFA/実況パワフルサッカーなど市販ゲームの選手 AI パラメータを参考に（可能な範囲で）
- e-sports 系の AI チューニング事例

---

**ドキュメント作成日**：2026-07-04  
**最終更新**：2026-07-04（Python/Pygame → TypeScript/Canvas API 置換）  
**担当**：足軽4（技術基盤・描画・ロードマップ）  
**次のステップ**：Phase 1 実装開始（足軽全体で協調）
