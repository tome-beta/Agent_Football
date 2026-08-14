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
  target: Vec2;
  startedAtTurn: number;
  minDurationTurns: number;
  maxDurationTurns: number;
}
```

`Player` に `intent: PlayerIntent` を追加。既存の `state: PlayerActionState`（描画・デバッグ用のラベル）は残し、`intent.type` から導出する従属物として扱う。`decidePossessionAction`（自分がボール保持中のシュート/パス/ドリブル判断）は毎ターン即断即決が本質のため、**intent機構の対象外のまま残す**。intentの対象は非保持時の移動（`decideDefensiveAction`/`decideSupportAction`/`decideFreeBallAction`）に絞る。

## 意図選択と意図実行の分離

- **意図選択（低頻度）**: `chooseIntent(player, state, config)` が intent 種別と `target` を決めて `player.intent` にセットする。`chance()` の呼び出しはここに集約する。
- **意図実行（毎ターン）**: `moveToward(player, player.intent.target, config, speedFactor)` を呼ぶだけ。target算出ロジック自体（`computeBackSupportTarget` 等）は流用でき、「いつ呼ぶか」だけを変える。

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

## `decideAction` への統合順序

```
1. stunTurns > 0 なら従来通り即return（変更なし）
2. interrupt = checkInterrupt(player, state, config)
3. S/A級の割り込みは無条件で chooseIntent()
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

既存の `offside.avoidanceEnabled`/`enforcementEnabled` とは独立した新フラグ（例: `offside.stateBasedWaitEnabled`）で切り替え可能にし、balance-checkで単独評価できるようにする。

## パラメータ接続（新規パラメータは増やさない方針）

`PlayerParams` は7分類に再設計されたばかりなので、`decision` のような新パラメータは足さず、既存パラメータへ意味的にマッピングする。

- 割り込み反応の速さ・`minDurationTurns`の長さ → **`mental`**。現行コードでは `mental`高＝ドリブル継続・自分で運びたがる、に寄っているので「固執しやすい＝minDuration長め」と定義するのが既存の意味と整合的。
- `RunBehindChance`の見つけやすさ → **`vision`**。既存の `lateralSupportChanceBase` が vision で振れているのと同じ方向性。
- `WaitOnside`地点の質（味方と被らない、ライン手前ギリギリ） → 独立パラメータは追加せず、スコア関数の重み（`config.ai.offside.kpp`）側で表現する。個人差は入れない。

## 段階的導入順（実装時のリスク最小化）

1. `Player.intent` 追加＋`ChaseLooseBall`/`Cover`/`Press` をほぼ現状ロジックのまま intent 化（挙動を変えない検証ステップ）
2. `decideSupportAction` 内の `Support`/`BackSupport`/`LateralSupport` を intent 化し `minDurationTurns` 導入 → ここで初めて「フラフラ削減」の効果をbalance-checkで測定できる
3. `WaitOnside`/`RunBehind` を新設し、既存オフサイドフラグとは別フラグで単独評価
4. 守備側（`decideDefensiveAction`）を intent 化

各段階を独立したTODOマイルストーンとし、balance-check/anomaly-huntで前後比較しながら進める（マイルストーンK/Lのオフサイド対策と同じ進め方）。

**最もリスクが高いのは3.（オフサイド状態化）**——既存の連続スコアリングとの二重管理になりやすい。2.のSupport系intent化を先に実測してから3.に進むのが安全。
