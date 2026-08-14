# 選手AI: 意図（Intent）ベースの状態遷移設計

`選手思考の状態遷移を検討.md`（会話ログ）で出た「常時最適化ではなく、意図の継続＋割り込みで動かす」という方向性を、現行コード（`src/game/player.ts` / `src/types.ts`）に落とし込める粒度まで詰めた設計。**この文書は設計のみで、まだ実装されていない。**

## 背景・課題

現行の `decideAction`（`src/game/player.ts:694`）は、`ball.possessorId` の状態でその都度4分岐し、非保持時の移動先も `computeTargetPosition`（同ファイル `:502`）が**毎ターンゼロから**計算し直す。特に `computeTargetPosition` 内の `Support`/`BackSupport`/`LateralSupport` 選択は `chance()` を毎ターン独立に振っているため、境界値付近の選手は行き先がターンごとに反転しうる（＝フラフラの原因）。

またオフサイド対策（`scoreReceivingSpot` による連続ペナルティ、`TODO.md` マイルストーンK/L）も、この「常時最適化」の枠内での対症療法であり、「裏へ抜ける」と「裏に居座る」という質的に異なる2つの状態を区別できていない。

## 単位系

継続時間は**秒ではなくターン数**で持たせる（`config.physics.dt` 固定のターンベース物理、既存の `Player.stunTurns` と一貫させるため）。

```
minDurationTurns: number
maxDurationTurns: number
```

## 型設計

```ts
type PlayerIntentType =
  | "Idle"
  | "Support"          // 現行 computeTargetPosition の受け手ポジション（縦）
  | "BackSupport"       // 現行 computeBackSupportTarget
  | "LateralSupport"    // 現行 computeLateralSupportTarget
  | "WaitOnside"        // 新設: オフサイドライン手前で待機
  | "RunBehind"         // 新設: 裏へ抜ける
  | "Press"             // 現行 pressChance / computeApproachPoint
  | "Cover"             // 現行 coverWeight による吸着
  | "ChaseLooseBall";   // 現行 decideFreeBallAction の nearestTeammate 分岐

interface PlayerIntent {
  type: PlayerIntentType;
  startedAtTurn: number;
  minDurationTurns: number;
  maxDurationTurns: number;
}
```

`Player` に `intent: PlayerIntent` を追加。既存の `state: PlayerActionState`（描画・デバッグ用のラベル）は残し、`intent.type` から導出する従属物として扱う。`decidePossessionAction`（自分がボール保持中のシュート/パス/ドリブル判断）は毎ターン即断即決が本質のため、**intent機構の対象外のまま残す**。intentの対象は非保持時の移動（`decideDefensiveAction`/`decideSupportAction`/`decideFreeBallAction`）に絞る。

### `target` は `PlayerIntent` に持たせない（重要な設計判断）

`Support`/`BackSupport`/`LateralSupport`/`Cover`/`Press`/`ChaseLooseBall` の目標地点は、いずれも `ball.pos` や `carrier.pos`（敵ボール保持者の現在地）という**動くもの**を基準に算出される。intent 選択時点の座標を `PlayerIntent.target` としてスナップショット固定すると、`minDurationTurns` の数ターンの間にボールが動いた分だけ target が古くなり、「もう受けられない位置」を目指し続ける不自然な動きになる。

そこで、**固定するのは `intent.type`（＝「今なにをしようとしているか」）だけ**とし、実際の座標は `moveToward` を呼ぶ直前に毎ターン `computeTargetForIntent(player.intent.type, player, state, config)` のような関数で再計算する。この関数は既存の `computeBackSupportTarget`/`computeLateralSupportTarget`/`computeApproachPoint` 等をそのまま `type` ごとに呼び分けるだけの薄いディスパッチになる。

「フラフラ防止」の効果は、座標を固定することでなく、**種別選択そのものを低頻度化する**（`Support` にするか `BackSupport` にするかを毎ターン振り直さない）ことで担保する。座標がボールに正しく追従しつつ、種別のジグザグ切り替えだけを抑える設計。

## 意図選択と意図実行の分離

- **意図選択（低頻度）**: `chooseIntent(player, state, config)` が intent **種別**を決めて `player.intent` にセットする。`chance()` の呼び出しはここに集約する。
- **意図実行（毎ターン）**: `computeTargetForIntent(player.intent.type, player, state, config)` で現在の target 座標を算出し、`moveToward(player, target, config, speedFactor)` を呼ぶ。target算出ロジック自体（`computeBackSupportTarget` 等）はそのまま流用できる。

## 割り込み（interrupt）検出

| 割り込み | 検出方法 |
|---|---|
| `HasBall` | `ball.possessorId === player.id`（既存） |
| `PossessionChanged` | 前ターンの `ball.possessorId` を新設フィールド（`GameState` 側に1個、選手ごとではない）で保存し比較 |
| `LooseBall` | `ball.status === "Free"` への遷移（同様に前ターン比較） |
| `PassStarted` | `ball.lastKickerId` が変わった、かつ `status === "Free"` |
| `IntentCompleted` | `distance(player.pos, intent.target) < config.ai.moveStopThreshold`（既存のしきい値を流用） |
| `IntentExpired` | `state.turn - intent.startedAtTurn >= intent.maxDurationTurns` |
| `RunBehindChance`（WaitOnside中） | 既存 `scoreReceivingSpot`/`isOffside` を使い「オンサイドかつ前進スコアが閾値超え」を判定 |
| `PassLaneClosed`（Support中） | 既存 `scoreReceivingSpot` 内のマーク圧力項が閾値超え |

## 優先順位

- **S（最優先・`minDurationTurns`無視）**: `HasBall`、`PossessionChanged`
- **A（強い割り込み・`minDurationTurns`無視）**: `LooseBall`、`PassStarted`
- **B（`minDurationTurns`経過後のみ有効）**: `RunBehindChance`、`PassLaneClosed`
- **C（受動的）**: `IntentCompleted`、`IntentExpired`

既存の `stunTurns > 0`（タックル直後の思考停止）はこの体系の外側・最上位に位置する「割り込みすら受け付けない状態」として自然に統合できる。

### エッジトリガ／レベルトリガの混在に注意

`PossessionChanged`/`PassStarted` は前ターンとの差分検出のため自然と1ターンしか真にならない（エッジトリガ）。一方 `LooseBall`（`ball.status === "Free"`）は誰も拾わない間ずっと真であり続ける（レベルトリガ）。この2つをどちらも「`minDurationTurns`無視」のまま扱うと、`LooseBall` が複数ターン真になり続けている間、`chooseIntent()` が毎ターン呼ばれ続け、実質的に「毎ターン最適化」に逆戻りしてしまう。

これを避けるため、**S/A級の割り込みであっても、`checkInterrupt` が返した割り込み種別に対応する intent に既に遷移済み（`player.intent.type` が対応する型と一致）なら `chooseIntent()` を再度呼ばない**というガードを `decideAction` 側に設ける（例: `LooseBall` 検出時、既に `intent.type === "ChaseLooseBall"` ならスキップ）。これにより検出方式自体は変えずに、同一intent継続中の無駄な再選択（＝実質的なフラフラ）を防ぐ。

## `decideAction` への統合順序

```
1. stunTurns > 0 なら従来通り即return（変更なし）
2. interrupt = checkInterrupt(player, state, config)
3. S/A級の割り込みは、対応する intent.type に既に遷移済みでなければ chooseIntent()
   （同一intent継続中の重複再選択を防ぐガード。上記「エッジ/レベルトリガの混在に注意」参照）
   B級は minDurationTurns 経過済みのときのみ chooseIntent()
   IntentCompleted / IntentExpired でも chooseIntent()
4. chooseIntent() 内部で今のボール保有状況（自分/味方/敵/フリー）に応じて
   intent.type の候補集合を絞り込み、既存のスコアリング/確率ロジックで選ぶ
5. moveToward(player, player.intent.target, config, speedFactorFor(intent.type))
```

## オフサイド対策との接続（`WaitOnside`/`RunBehind`）

現行の `scoreReceivingSpot` ＋ `selectReceivingDistance` を置き換えるのではなく、上位に状態を1枚被せる。

- `WaitOnside` の target = 受け手ロジックに「オフサイドライン超過をほぼゼロ許容」の制約を強めた地点（`offsideOvershootWeight` を一時的に強く効かせた版）。
- `RunBehind` の target = 逆に `forwardWeight` を強め、ライン超過ペナルティを緩めた地点（現行ロジックに近い）。
- 遷移条件（`WaitOnside → RunBehind`）は「ボール保持者が前を向いている」「自分がオンサイド」「マーク圧力が低い」の複合条件として `canRunBehind(player, state, config)` に切り出す。

### 対象選手の絞り込み

役割（FW/MF/DF）ではなく実位置で動的に判定する（`isLastManBack` と対称的な方針）。`offsideLineY(side, oppTeam, ball.pos, config)` との y座標差が閾値（新設: `config.ai.offside.frontLineProximityMeters` 想定）未満の選手を `WaitOnside`/`RunBehind` の候補対象とする。`isLastManBack` のように「1人だけに絞る」形は取らない——少人数サッカー（3対3）では前線に複数人が同時に並ぶ局面が普通にあり、1人限定にすると裏抜けの連携（同時に2人がオフサイドラインを意識する場面）を表現できなくなるため。閾値外の選手は従来通り `Support`/`BackSupport`/`LateralSupport` のみが候補。

既存の `offside.avoidanceEnabled`/`enforcementEnabled` とは独立した新フラグ（例: `offside.stateBasedWaitEnabled`）で切り替え可能にし、balance-checkで単独評価できるようにする。

## パラメータ接続（新規パラメータは増やさない方針）

`PlayerParams` は7分類に再設計されたばかりなので、`decision` のような新パラメータは足さず、既存パラメータへ意味的にマッピングする。

- 割り込み反応の速さ・`minDurationTurns`の長さ → **`mental`**。現行コードでは `mental`高＝ドリブル継続・自分で運びたがる、に寄っているので「固執しやすい＝minDuration長め」と定義するのが既存の意味と整合的。
- `RunBehindChance`の見つけやすさ → **`vision`**。既存の `lateralSupportChanceBase` が vision で振れているのと同じ方向性。
- `WaitOnside`地点の質（味方と被らない、ライン手前ギリギリ） → 独立パラメータは追加せず、スコア関数の重み（`config.ai.offside.kpp`）側で表現する。個人差は入れない。

## 段階的導入順（実装時のリスク最小化）

1. `Player.intent` フィールド基盤（choose/execute分離）を導入し、`ChaseLooseBall`（`decideFreeBallAction` 側）のみをintent化する最小検証ステップ。`Cover`/`Press` は `decideDefensiveAction` 側のロジックであり段階4とスコープが重複するため、ここには含めない。**受け入れ基準**: 完全なRNG消費順序一致までは求めず、balance-checkで実装前後の統計的分布（平均得点・勝敗分布等）が同等であることを確認する。ゼロベースの完全一致に固執すると実装の自由度が下がりすぎるため、統計的同等性を基準とする。
2. `decideSupportAction` 内の `Support`/`BackSupport`/`LateralSupport` を intent 化し `minDurationTurns` 導入 → ここで初めて「フラフラ削減」の効果をbalance-checkで測定できる
3. `WaitOnside`/`RunBehind` を新設し、既存オフサイドフラグとは別フラグで単独評価
4. 守備側（`decideDefensiveAction`。`Cover`/`Press` を含む）を intent 化

各段階を独立したTODOマイルストーンとし、balance-check/anomaly-huntで前後比較しながら進める（マイルストーンK/Lのオフサイド対策と同じ進め方）。

**最もリスクが高いのは3.（オフサイド状態化）**——既存の連続スコアリングとの二重管理になりやすい。2.のSupport系intent化を先に実測してから3.に進むのが安全。

## 状態遷移ログ（マイルストーンN-5）

`選手思考の状態遷移を検討.md` 第5段階「状態遷移ログを出す」に対応。`decideAction` に任意コールバック `onIntentChange?: IntentChangeCallback`（`types.ts`）を追加し、`Player.intent.type` が実際に切り替わるたびに呼ばれる。`game` 層は `types` 以外に依存しない制約があるため、`simulation/logger.ts` の `Logger` 型を直接参照せず関数型で疎結合にし、`Simulator.step()` 側で `Logger.logIntentChange` に橋渡しする。

**導入時に見つかった実バグ**: ログを見て初めて、`decideFreeBallAction` の再判定条件（`intent.type !== "ChaseLooseBall" || ...`）が緩すぎることが判明した。非追跡選手（intentが`Support`等）がフリーボール中にこの関数を通過するたび、無条件で`Idle`へ強制リセットされてから即座に再選択されており、`Support -> Idle -> Support` のような無意味な遷移が毎ターン発生していた。これはN-2で入れたはずの`minDurationTurns`/`maxDurationTurns`スティッキネスがフリーボール中だけ効いていなかったことを意味する。修正: `decideFreeBallAction` は自分がChaseLooseBallに入る/出るときだけ`intent`を書き換え、それ以外（既にSupport系intentを持っている非追跡選手）には一切触れないようにした。ログという観測手段を追加したことで、挙動を変えたつもりのないリファクタが実際には副作用を持っていたことが可視化された一例。
