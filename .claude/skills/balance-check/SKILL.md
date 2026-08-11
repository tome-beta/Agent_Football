---
name: balance-check
description: soccer-sim を複数シードで連続実行し、安定性（クラッシュ・NaN・無限ループなし）とスコアの偏り（どちらかのチームが勝ちすぎていないか）を確認する。パラメータ調整の前後比較にも使う。「安定性を確認して」「バランス調整して」「毎回違う展開になるか確認して」「パラメータを調整して試合結果を比較して」と言われたときに使う。
---

# シミュレーションの安定性・バランス確認

## いつ使うか

- 複数試合を連続実行してクラッシュ・NaN・無限ループがないか確認したいとき
- 「毎回異なる展開になるか」を確認したいとき（`TODO.md` マイルストーンGの観点）
- `GameConfig`（特に `ai.positioning` や `ai.shootProbability` など）を調整して、調整前後でスコアの偏りがどう変わるか比較したいとき

## 手順

1. **プロジェクトルート直下**に一時スクリプト（例: `scratch_balance.ts`）を書く。`src/` の中には置かない（コミット対象に混ざらないように）。
2. `loadConfig` + `createInitialState` + `decideAction`/`stepPlayer`/`stepBall`/`resolveBallPossession`/`stepMatch` を手動ループするか、`Simulator`（`NullRenderer` 使用）で複数シード（最低10、できれば20）を連続実行する。
3. 各試合について次を記録する:
   - 例外・NaN/Infinity 座標が出ていないか（安定性）
   - `state.result.scoreA` / `scoreB` / `winner`
   - 必要なら得点タイミング（`state.scoreLog` の `turn`）— 「規則的に交互に得点している」ような不自然なパターンの発見に有効
4. 集計する: 勝敗分布（A勝ち/B勝ち/引き分けの数）、平均得点数。**A/B勝ち数が極端に偏っていたら要調査**（座標系が対称なので、本来は互角に近いはず）。
5. パラメータ調整を試す場合は、`loadConfig({ ai: { ...overrides } })` や `{ ...base.ai, positioning: { ...base.ai.positioning, ...overrides } }` のように部分上書きし、調整前後で同じシード集合を使って比較する。
6. **確認が終わったら一時スクリプトを必ず削除する**（`rm` で消す。プロジェクトに残さない）。

## 実行コマンド

```bash
cd g:/Agent_Football && npx tsx scratch_balance.ts
```

（`npx` がPATH解決に失敗する環境に当たったら `./node_modules/.bin/tsx` を直接叩くか `PATH="$PATH:/c/Program Files/nodejs"` を前置きする）

## 過去に見つかった既知の偏り（参考値）

2026-08-01、マイルストーンG着手時に「キックオフ側がほぼ確実に得点し、20戦20勝になる」偏りを発見した。原因は非保持時の守備（`computeTargetPosition` の coverBias/pressure）が弱すぎて、キックオフから再度失点するまでのサイクルがほぼ確実に攻撃側の得点で終わっていたこと。`config.ai.positioning` の `coverWeight`（0.6→1）/`pressWeight`（0.8→2）/`pressDistance`（12→20）を引き上げて 20戦14勝4敗2分まで改善した（`src/config/default.ts` のコメント参照）。同様の「規則的すぎる」「一方的すぎる」パターンが出たら、まず `positioning` の重みを疑うとよい。

## 調整後の確認

パラメータを実際に変更したら、`verify` スキルで型チェック・テスト・ヘッドレス実行を必ず流す。バランス調整は既存テストの数値アサーション（特に `tests/game/player.test.ts` の力の合成テスト）に影響することがあるので注意する。
