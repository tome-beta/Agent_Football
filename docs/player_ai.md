# 選手AIの思考ロジック（現状まとめ）

`src/game/player.ts` の `decideAction` が毎ターン・全選手に対して呼ばれ、`player.state` と `player.vel` を更新する。位置の反映は `stepPlayer` が別途行う（`decideAction` 自体は選手を動かさない）。

`specification/features_1_player_ai.md` が設計意図（なぜこうするか）、このドキュメントは「今の実装が実際に何をしているか」を対応させたもの。実装が変わったらここも更新すること。

---

## 1. 全体の分岐（`decideAction`）

毎ターン、ボールの保持状況で4つに分岐する。分岐条件は `state.ball.possessorId` を見るだけで、選手自身の視野は関係しない（＝保持状況そのものは全員が把握している前提）。

```
自分がボールを保持している？
  → yes: decidePossessionAction（2章）
  → no:
      敵チームが保持している？
        → yes: decideDefensiveAction（3章）
        → no:
            味方が保持している？
              → yes: decideSupportAction（4章）
              → no （フリーボール）: decideFreeBallAction（5章）
```

---

## 2. ボール保持中：`decidePossessionAction`

優先順位は **シュート → パス → ドリブル継続** の順で、最初に成立した行動をとる。

1. **シュート判定**
   - 自分の位置から攻撃ゴール（`x=0, y=±length/2`）までの距離が `config.ai.shootDistance`（既定20m）以内なら検討する。
   - 成功確率 = `shootProbability × shootPower × aggressiveness`（0〜1にクランプ）。この確率で `chance()`（決定的乱数）が成立したらシュート実行。
   - 実行時: `state = "Shooting"`、方向はゴール方向に `applyAimError`（`shootPower` が低いほど角度がブレる）を適用、初速は `shootSpeed × shootPower`。
   - **角度・GKの遮蔽は考慮しない**（距離のみ）。仕様書は角度判定を必須としているが未実装（既知のギャップ）。

2. **パス判定**（シュートが成立しなかった場合）
   - `selectPassReceiver` で受け手を選ぶ:
     - 候補: 同チームの他選手のうち、距離が `passDistance`（既定15m）以内の全員（**視野角によるフィルタはしない** — キャリアーは周囲を見渡せる想定のため）。
     - スコアリング: 相手選手が `tackleDistance × 2` 以内にいる候補は大きく減点（-1000）、それ以外はゴールに近いほど高評価。最もスコアの高い候補を選ぶ。
   - 受け手がいれば: `state = "Passing"`、方向は受け手へ向けて `applyAimError`（`passAccuracy` が低いほどブレる）、初速は `passSpeed + 距離×0.3`（遠いほど強く蹴る、`ball.maxSpeed` で頭打ち）。

3. **ドリブル継続**（シュートもパスも成立しなかった場合）
   - `state = "Possession"` のまま、ゴール方向へ `moveToward`。ボールは保持者に追従するので、これがそのまま「ドリブル」になる。

---

## 3. 敵がボール保持中：`decideDefensiveAction`

- `nearestOpponent` で、視野内（`visionDistance` × `vision` 角度）の敵から最も近い1人を選ぶ。視野内に誰もいなければ視野を無視して全敵から最も近い1人を選ぶ（＝マーク対象が必ず1人は決まる）。
- マーク位置は「対象の位置」そのものではなく、そこから**自ゴール方向へ `tackleDistance × 0.5`（既定0.5m）だけ寄せた点**。
  - これは意図的な調整: 以前はもっと大きく（2m）ゴール側にオフセットしていたが、`tackleDistance`（奪取判定距離、既定1.0m）より遠いままだと、狙い通りの位置に到達しても**絶対に奪取判定に届かない**バグがあった（2026-07-30 に修正）。
- `state = "Marking"`、そのマーク位置へ `moveToward`。

---

## 4. 味方がボール保持中／5. フリーボール：`decideSupportAction` / `decideFreeBallAction`

両方とも同じ `supportPosition`（受け手ポジション計算）を使う。異なるのはフリーボール時の「自分が味方の中で最もボールに近いか」の分岐だけ。

### 5.1 フリーボール時の分岐（`decideFreeBallAction`）
- 自チーム内でボールに最も近い選手を探す。
- 自分がその最寄り選手 **かつ** ボールが `visionDistance` 以内 → `state = "BallTracking"`、ボールへ直進。
- それ以外（最寄りでない、または視野外）→ `state = "MovingToSpace"`、`supportPosition` へ移動。
  - 2026-08-01 に修正: 以前はここが定位置（`formationPos`）そのものだった。パス/シュート直後にボールが誰にも保持されていない時間は長く続くため、その都度定位置へ引き戻され「受けるための動き」が起きる前に消えてしまっていた。

### 5.2 味方保持時（`decideSupportAction`）
- 常に `state = "MovingToSpace"`、`supportPosition` へ移動（最寄り判定はしない＝ボール保持者以外の全員が対象）。

### 5.3 `supportPosition` の計算（受けるためのポジション、2026-08-01 導入）

1. **基準点**: ボールの現在位置から攻撃ゴール方向へ `passDistance × 0.6`（既定9m）進んだ地点。パスが届く距離を保ちつつ前進する。
2. **マーク回避**: 基準点から `passDistance × 0.5`（既定7.5m）以内に敵がいれば、その敵から離れる方向へ3mずらす。遠い敵には反応しない（無関係な敵のたびに揺れないように距離で足切りしている）。
3. **レーン維持**: 最終的な x 座標は、上記の x と**自分の定位置の x** を平均した値にする。y はそのまま。これにより FW/MF/DF が同じ地点に集まらず、役割ごとの横方向のレーンをある程度保つ。

この関数はボール保持者が味方かフリーボールかを区別しない（どちらの状況でも同じ「受けやすい場所」を目指す）。

---

## 6. 補助関数

| 関数 | 役割 |
|---|---|
| `effectiveSpeed` | `min(player.params.speed, config.player.maxSpeed)`。役割別速度と全体上限の小さい方 |
| `facingDirection` | 選手の「向き」。動いていれば直近の速度方向、静止時は攻撃方向 |
| `isVisible` | 対象が「視野距離(`visionDistance`) × 視野角(`params.vision`)」内にあるか。**パス受け手選定・フリーボール追跡には使わない**（周囲を見渡せる想定）。**マーク対象の一次候補選定**にのみ使用 |
| `applyAimError` | キック方向に、精度パラメータ（0で最大 `aimErrorMaxDeg`、1で誤差0）に応じた角度誤差を乗せる |
| `moveToward` | 目標地点へ `effectiveSpeed` で向かう `vel` を設定。目標まで0.1m未満なら停止 |
| `nearestOpponent` | 視野内（無ければ全体）から最も近い敵選手を返す。マーク対象選定に使用 |
| `nearestPosTo` | 任意の点から見て最も近い選手の座標を返す。`supportPosition` のマーク回避に使用 |

---

## 7. 既知の未実装・簡略化ポイント

- シュートの角度判定・GKの遮蔽（`features_1` §3.2 は必須としているが未実装）
- スタミナ・ドリブル能力・トラップ精度などの技術/メンタルパラメータ（`features_1` は「第一ステップは簡易でよい」としている項目、そもそも未導入）
- オフサイド判定（`features_1` §4.1 に記載があるが、`TODO.md` で明示的に第一ステップ対象外）
- パス/マークの意思決定に確率的なブレはない（成功判定・キック誤差は確率的だが、「誰をマークするか」「誰にパスするか」自体は決定的なスコアリングで一意に決まる）
