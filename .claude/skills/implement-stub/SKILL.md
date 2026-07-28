---
name: implement-stub
description: soccer-sim の未実装スタブ（throw new Error("not implemented")）を実装してテストを追加する定型手順。TODO.md のマイルストーンB〜Eに着手するとき、stepBall / kickBall / resolvePlayerBall / decideAction / stepPlayer / advancePhase / stepMatch / Simulator.step などを実装するときに使う。
---

# スタブ実装の定型手順

## 1. 仕様を先に読む

コードを書き始める前に、対象マイルストーンに対応する仕様書を読む。**コードや型に現れない「なぜそうするか」がそこにある。**

| 対象 | 読む仕様書 |
|---|---|
| ボール物理・当たり判定（B） | `specification/features_2_ball_pitch.md` |
| 選手AI（C） | `specification/features_1_player_ai.md` |
| 試合ルール・進行（D） | `specification/features_3_match_rules.md` |
| 技術基盤・描画（F） | `specification/features_4_tech_roadmap.md` |

**仕様書が実装と食い違う既知の箇所**（実装が正）:
- `features_3` の「x軸方向にゴール・座標0〜100」→ 実装は原点中央・y軸方向にゴール
- `features_3` の「GK1人＋FP2人」→ GKは扱わない（`Role = FW|MF|DF`）

## 2. シグネチャは変えない

スタブの引数・戻り値は既に決まっている。**まず中身を埋める**。変更が必要だと判断したら、その理由を述べたうえで `docs/api.md` も同時に更新する。

`step*` 系（`stepBall` / `stepPlayer` / `stepMatch`）は**引数のオブジェクトを直接書き換え、戻り値を返さない**。新しいオブジェクトを返す方式と混ぜない。

## 3. 実装中に必ず守る制約

- **ゲームプレイ定数は `GameConfig` 経由**。マジックナンバーをロジックに書かない。新しい調整値が要るなら `src/types.ts` の `GameConfig` にキーを足し、`src/config/default.ts` にデフォルト値と単位のコメントを書く。
- **`Math.random()` を使わない**。確率判定は `src/game/random.ts` の `nextRandom(state)` / `chance(state, p)`（`GameState` がそのまま `RngHolder`）。再現性のため。
- **時間は秒**。1ターン = `config.physics.dt` 秒。位置更新は `pos += vel * dt`、摩擦は `vel *= Math.pow(config.ball.friction, dt)`（`friction` は**毎秒の**保持率）。ティック数を直接掛けない。
- **`src/game/*` は DOM/Canvas に触れない**し `src/renderer/*` を import しない。
- **座標系**: チームA は y = -length/2 のゴールを守り攻撃方向は +y、チームB は逆。`Pitch.isInGoalA()` は「チームAのゴールに入った」＝**チームBの得点**。
- **`Ball.possessorId`（現在の保持者）と `lastKickerId`（最終キック者）は別物**。奪取時に `possessorId` だけ変え、`lastKickerId` は蹴った時にのみ更新する。
- **スコアは `scoreLog` が単一の情報源**。カウンタを別に持たず `currentScore(state)` を使う。

## 4. テストを同じコミットで追加する

配置は `tests/<層>/<名前>.test.ts`（`src/` の構成をミラー）。`vitest.config.ts` の include は `tests/**/*.test.ts`。

```typescript
import { describe, it, expect } from "vitest";
import { defaultConfig } from "../../src/config/default";
```

観点:

- **物理は境界値を突く** — 停止閾値ちょうど、最高速度超過、ゴールライン上、ゴール幅の端、距離判定のちょうど境界。
- **確率的ロジックは固定シードで検証する** — `loadConfig({ random: { seed: 123 } })` か `state.rngSeed` を直接指定すれば決定的になる。「確率0で必ず失敗・確率1で必ず成功」と「多数回で期待値付近」の2種類を書く。
- **AI は壊れないことを確認する** — 最適解かどうかより、NaN・無限ループ・ピッチ外への逸脱が起きないこと。
- **ミューテーションを確認する** — `step*` が引数を書き換えていること、逆に純粋関数（`src/game/utils.ts`）が引数を変えていないこと。

## 5. 検証と後始末

`verify` スキルの手順で型チェック・テスト・ヘッドレス実行を通す。そのうえで:

- `TODO.md` の該当項目にチェックを入れ、**何をどのファイルで実装し、どのテストで検証したか**を1行で添える（既存の完了項目と同じ書式）。
- `docs/api.md` の該当関数から **(未実装)** を消す。
- 新しい `GameConfig` キーを足したなら `docs/api.md` の設定テーブルにも追記する。
