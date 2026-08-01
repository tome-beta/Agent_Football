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

## 3〜5. 非保持時の共通ロジック：`computeTargetPosition`（マイルストーンH、2026-08-01 導入）

以前は `decideDefensiveAction`（マーク）/ `decideSupportAction`（受け手）/ `decideFreeBallAction`（フリーボール）がそれぞれ役割別の分岐ロジックを個別に持っていたが、3人全員が同じ相手（大抵ボール保持者）に吸い寄せられ「団子状に集まる」挙動になりやすかった。現在はこの3つとも、非追従時の目標位置計算を共通関数 `computeTargetPosition(player, state, config)` に委譲し、呼び出し元は `player.state` のラベル分けだけを残している。役割（FW/MF/DF）による if 分岐は書かず、**全選手が同じ力学式に自分の `homePos`/`params` を代入する**ことで結果的に役割らしさがにじみ出る設計。

`computeTargetPosition` は敵がボールを持っているかどうかで内部分岐する:

### 3.1 敵がボールを持っている場合（`decideDefensiveAction` から呼ばれる）

3つの力を順に合成する（`config.ai.positioning` の重みを使用）:

1. **ballAttraction**: `home` からボール方向へ、`distance(home, ownGoal) × ballPullWeight`（既定0.5）を上限に追従する。`home` が自ゴールから遠い（＝FW寄りの）選手ほど大きく前に出て、DF寄りの選手はあまり動かない——役割分岐なしに間合いの違いが出る。
2. **coverBias**: 現在の目標位置を、ボールと自ゴールを結ぶ線上へ `coverWeight`（既定1、フルスナップ）の比率で吸着させる。
3. **pressure**: `pressDistance`（既定20m）以内に敵ボール保持者がいれば、`pressWeight × player.params.aggressiveness` の比率でその選手へ詰め寄る。

### 3.2 敵がボールを持っていない場合（味方保持 or フリーボール、`decideSupportAction`/`decideFreeBallAction` から呼ばれる）

旧 `supportPosition` と同じ「受け手ポジション」計算:

1. **基準点**: ボールの現在位置から攻撃ゴール方向へ `passDistance × 0.6`（既定9m）進んだ地点。パスが届く距離を保ちつつ前進する。
2. **マーク回避**: 基準点から `passDistance × 0.5`（既定7.5m）以内に敵がいれば、その敵から離れる方向へ3mずらす。遠い敵には反応しない。
3. **レーン維持**: 最終的な x 座標は、上記の x と**自分の定位置の x** を平均した値にする。y はそのまま。

### 3.3 共通の後処理：teammateRepulsion

どちらの分岐でも最後に、`minSpacing`（既定6m）未満に味方がいれば、その味方から離れる方向へ `repulsionWeight`（既定4）分だけ目標位置をずらす。これが「団子化」対策の core。

### 3.4 各呼び出し元の役割

| 呼び出し元 | `player.state` | 使う分岐 |
|---|---|---|
| `decideDefensiveAction`（敵保持中） | `"Marking"` | 3.1（敵がボールを持っている） |
| `decideSupportAction`（味方保持中） | `"MovingToSpace"` | 3.2（受け手ポジション） |
| `decideFreeBallAction`（フリーボール・自分が最寄りかつ視野内） | `"BallTracking"` | なし（ボールへ直進） |
| `decideFreeBallAction`（フリーボール・それ以外） | `"MovingToSpace"` | 3.2（受け手ポジション） |

`decideFreeBallAction` は自チーム内でボールに最も近い選手を探し、自分がその最寄り選手 **かつ** ボールが `visionDistance` 以内なら `"BallTracking"` でボールへ直進、それ以外は `computeTargetPosition` へ委譲する。パス/シュート直後にボールが誰にも保持されていない時間は長く続くため、最寄りでない選手を定位置（`formationPos`）そのままへ戻すと「受けるための動き」が起きる前に消えてしまう——これを避けるための設計（2026-08-01 導入、H以前から変更なし）。

---

## 6. 補助関数

| 関数 | 役割 |
|---|---|
| `effectiveSpeed` | `min(player.params.speed, config.player.maxSpeed)`。役割別速度と全体上限の小さい方 |
| `facingDirection` | 選手の「向き」。動いていれば直近の速度方向、静止時は攻撃方向。デバッグ描画（視野コーン表示）でも使用 |
| `applyAimError` | キック方向に、精度パラメータ（0で最大 `aimErrorMaxDeg`、1で誤差0）に応じた角度誤差を乗せる |
| `moveToward` | 目標地点へ `effectiveSpeed` で向かう `vel` を設定。目標まで0.1m未満なら停止 |
| `nearestPosTo` | 任意の点から見て最も近い選手の座標を返す。`computeTargetPosition`（3.2 分岐）のマーク回避に使用 |
| `computeTargetPosition` | 非保持時の目標位置を力の合成で決める（本章の主題） |

`isVisible`（視野角チェック）と `nearestOpponent`（視野内最近接の敵選手）はマイルストーンHで削除した。前者はマーク対象選定にのみ使われていたが、マーク自体が coverBias ベースに変わったため不要になった。パス受け手選定（`selectPassReceiver`）はもともと視野角を見ない設計なので影響なし。

---

## 7. 既知の未実装・簡略化ポイント

- シュートの角度判定・GKの遮蔽（`features_1` §3.2 は必須としているが未実装）
- スタミナ・ドリブル能力・トラップ精度などの技術/メンタルパラメータ（`features_1` は「第一ステップは簡易でよい」としている項目、そもそも未導入）
- オフサイド判定（`features_1` §4.1 に記載があるが、`TODO.md` で明示的に第一ステップ対象外）
- パス/マークの意思決定に確率的なブレはない（成功判定・キック誤差は確率的だが、「誰にパスするか」自体は決定的なスコアリングで一意に決まる。「誰をマークするか」という概念自体は coverBias 化でなくなった）
- `computeTargetPosition` の力の合成は簡易な逐次ブレンドであり、物理的な力の重ね合わせ（ベクトル加算）ではない箇所がある（coverBias・pressure は「現在target→目標点」への線形補間）。挙動のチューニングは `config.ai.positioning` の重みで行う（`docs/api.md` §2 参照）
