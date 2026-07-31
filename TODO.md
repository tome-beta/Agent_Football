# サッカーゲーム開発 TODOリスト

カルチョビット風・パラメータ駆動の自律サッカーゲーム。
第一ステップは **3対3・地上2次元** で「選手が自律的に動いて試合が成立する」ことを目指す。

各機能の詳細な検討内容は以下を参照:
- 選手AI・パラメータ … [`doc/features_1_player_ai.md`](doc/features_1_player_ai.md)
- ボール物理・ピッチ … [`doc/features_2_ball_pitch.md`](doc/features_2_ball_pitch.md)
- 試合ルール・進行 … [`doc/features_3_match_rules.md`](doc/features_3_match_rules.md)
- 技術基盤・描画・ロードマップ … [`doc/features_4_tech_roadmap.md`](doc/features_4_tech_roadmap.md)

---

## コードベース調査で見つかった課題（すべて対応済み）

2026-07-28 のプロジェクト全体調査で見つかった問題。マイルストーンB着手前に解消した。

- [x] **`npm run test` が現状必ず失敗する**: `tests/game/pitch.test.ts` を追加し解消。
- [x] **GK（ゴールキーパー）ロールの扱いを決める**: **FW/MF/DF のみで進める**と決定。`TODO.md` と `src/types.ts` の `Role` が一致しており、GK専用AIは本ドキュメントで明示的に第二ステップ送りにしているため。`specification/features_3_match_rules.md` の「GK1人＋FP2人」の記述が例外側。
- [x] **`docs/api.md` / `docs/development_guide.md` を実装に合わせて更新する**: 両ドキュメントを現在の関数型設計（`TeamSide = "A"|"B"` / `Vec2` / `GameConfig` 駆動）に沿って全面的に書き直した。
- [x] **`Pitch.goalWidth` のハードコードを解消する**: `GameConfig.pitch.goalWidth` を追加し、`src/config/default.ts` / `src/game/pitch.ts` を更新して解消。
- [x] **`index.html` の `<canvas>` に width/height を設定する**: 400×600px（8px/m）を設定。
- [x] **`Ball` に所持者IDが無い**: `possessorId` を追加。`lastKickerId`（最終キック者・再開権/得点者判定用）とは別物として型コメントで区別した。
- [x] **`GameConfig` にB〜Dで必要な調整値が無い**: `ball.stopThreshold` / `ai.trapDistance` / `ai.trapMaxBallSpeed` / `ai.tackleDistance` / `team`（役割別パラメータ・フォーメーション・戦術・チーム名）/ `match`（ハーフのターン数・各フェーズの滞在ターン数）/ `random.seed` を追加。
- [x] **`dt` と `friction` の単位が噛み合っていない**: 1ターン = 0.1秒（`physics.dt`）と定め、`friction` は「毎秒の速度保持率」と再定義（適用は `friction^dt` で dt 非依存）。`turnsPerHalf` は 900（=前半90秒）。
- [x] **乱数シードの置き場が無い**: `src/game/random.ts`（決定的な mulberry32）を追加し、乱数状態は `GameState.rngSeed` として保持。`Math.random()` は使わない方針を確定。
- [x] **`Team` / `MatchResult` が仕様に足りない**: `Team` に `name` と `tactics`（`aggressiveness` / `formationWidth`）、`MatchResult` に `durationTurns` を追加。スコアは `scoreLog` を単一の情報源とし `currentScore()` で集計する。
- [x] **座標系の記述が仕様書間で矛盾**: 実装（原点中央・y軸方向にゴール）を正とし、`docs/api.md` と `docs/development_guide.md` に明記。`GameConfig.pitch.height` は意味に合わせて `length` へ改名。ゴール総幅は 7.32m に修正（従来値 3.66 は判定 `|x| <= goalWidth/2` と組み合わさって実質半分の幅になっていた）。
- [x] **`createInitialState` が選手を配置しない**: `createTeam` / `formationPos` を追加し、両チーム FW/MF/DF 各1人を自陣の定位置に配置するようにした。`Player.homePos`（再開時に戻る基準位置）も追加。
- [x] **headless が canvasRenderer を巻き込む**: `src/headless.ts` は `src/renderer/nullRenderer` を直接 import するように変更。

---

## `specification/` と実装の既知の差分（意図的な簡略化・設計変更）

2026-07-31 に `specification/features_*.md` を通読して確認した、ドキュメント化されていなかった差分。いずれもバグではなく、`TODO.md` の「第一ステップは簡略化」方針に沿った意図的な選択。

- **アウトオブバウンズの再開位置**: `features_2_ball_pitch.md` §3.2〜3.4 はスローイン（出た地点のy座標）／コーナー（コーナー付近）／ゴールキック（ゴールエリア内）で再開位置を区別しているが、実装（`handleOutOfBounds` in `src/game/match.ts`）は理由を問わず**中央付近へ戻す**簡易版に一本化している。マイルストーンDの該当項目に「簡易再開」と明記済みの通り。
- **シュート角度判定が未実装**: `features_1_player_ai.md` §3.2 は角度判定を優先度「高・◎」としているが、`decidePossessionAction`（`src/game/player.ts`）は `shootDistance` の距離のみでシュート可否を判定しており、ゴールに対する角度・GKの遮蔽は考慮していない。
- **ゲームループの駆動方式**: `features_4_tech_roadmap.md` §3.3 は「60FPS + `requestAnimationFrame` の accumulator で複数ティック処理」を想定していたが、実装は `CLAUDE.md` に明記の通り「1ターン = `config.physics.dt`(0.1秒) のターン制」で、フレームレートに紐づかない離散シミュレーション。`Simulator.step()` は1回の呼び出しで1ターンだけ進める。

---

## 全体方針

- **言語/描画**: TypeScript（ブラウザ）。まずは**描画なし（純ロジック、Node ヘッドレス実行）でシミュレーションを完成**させ、後から Canvas 2D で可視化する2段階アプローチ。
- **時間管理**: ターン制で開始（選手AIの自律動作と同期しやすい）。可視化フェーズで実時間ループへ拡張。
- **設計原則**: ゲームロジック層（`game/`）は描画層に依存しない。パラメータはハードコードせず設定ファイル化。
- **想定モジュール構成**: `pitch`（フィールド定義）/ `ball`（物理）/ `player`（AI）/ `match`（ルール・状態）/ `simulator`（ループ）/ `renderer`（描画・後発）。

---

## 第一ステップ（3対3・地上2D）— MVP

### マイルストーンA: 基盤とデータモデル ✅ 完了
- [x] ピッチ定義（寸法・座標系＝原点中央推奨・ゴール位置・各ライン）を定数化する `pitch` — `Pitch`（`isInBounds`/`isInGoalA`/`isInGoalB`）実装、`tests/game/pitch.test.ts` で検証
- [x] 選手データモデル（ID・チーム・役割・位置(x,y)・速度）を定義する `player` — `Player`型 + `createPlayer`
- [x] ボール状態モデル（位置・速度・状態フラグ〔フリー/所持/アウト〕・最終キック者ID）を定義する `ball` — `Ball`型 + `createBall`
- [x] ゲーム状態オブジェクト（状態名・ターン・スコア・両チーム・ボール）を定義する `match` — `GameState`型 + `createInitialState`
- [x] パラメータ設定ファイル（YAML等）と読み込み処理 `config` — `GameConfig`型 + `src/config/default.ts` + `loadConfig`
- [x] 役割別の初期フォーメーション配置 `player` — `createTeam` / `formationPos`、`tests/game/match.test.ts` で検証
- [x] 決定的乱数（シード付き）`random` — `src/game/random.ts`、`tests/game/random.test.ts` で検証

### マイルストーンB: ボール物理と当たり判定 ✅ 完了
- [x] ボール位置更新（毎ティック 位置 += 速度） `ball` — `stepBall`（`pos += vel * dt`）、`tests/game/ball.test.ts` で検証
- [x] 摩擦・減速（毎ティック 速度 ×= 摩擦係数、最小速度で停止） `ball` — `stepBall` で `vel *= friction^dt`（dt非依存）＋ `stopThreshold` 未満で完全停止
- [x] 最高速度制限（暴走防止の正規化） `ball` — `stepBall` で `clampMagnitude(vel, ball.maxSpeed)`。`kickBall` は `config` を持たないため上限は次の `stepBall` が適用する
- [x] キック初期化（選手AIの指定した方向・強度をボール速度に変換） `ball` — `kickBall`（方向は正規化、保持解除、`lastKickerId` 更新）
- [x] 選手-ボールのキック距離判定 `collision` — `canKick`（`ai.ballControlDistance`）、`tests/game/collision.test.ts` で検証
- [x] 選手-ボールのトラップ／ボール保持状態管理（所持中は選手に追従） `collision` — `resolvePlayerBall`（`ai.trapDistance` / `ai.trapMaxBallSpeed`、保持中は選手へ追従）
- [x] ボール奪取（タックル）判定＝距離ベース `collision` — `resolveBallPossession`（相手チームのみ・最近接優先・速度リセット。`lastKickerId` は変えない）

> 補足: `resolvePlayerBall` は単一選手しか見えず、`Ball` は `possessorId` しか持たないため、「味方から奪わない」「複数選手が範囲内なら最近接が保持」（features_2 §4.1/§4.3）を単独では判定できない。そのため全選手を受け取る `resolveBallPossession(players, ball, config)` を追加し、全体の調停をそちらに寄せた。既存シグネチャは変更していない。
> `resolvePlayerPlayer` は features_2 §4.4 に従い**意図的に no-op**（第一ステップでは選手同士は通り抜ける）。

### マイルストーンC: 選手の自律行動AI ✅ 完了
- [x] 選手パラメータ（**速度・パス精度・シュート力・視野・積極性**の5つを必須）を実装 `player` — `PlayerParams`（マイルストーンAで型定義済み）を `decideAction` の意思決定で実際に使用
- [x] 役割定義（FW/MF/DF）と初期ポジション配置 `player` — マイルストーンAで実装済みの `createTeam`/`formationPos` を活用
- [x] 行動ステートマシン（Idle / BallTracking / Possession / Passing / Receiving / Shooting / Marking / MovingToSpace）を実装 `player` — `decideAction` がボール保持状況で4分岐し `player.state` を更新、`tests/game/player.test.ts` で検証
- [x] ボール保持者の意思決定: パス受け手選定・パス成功率評価・シュート可否/成功率評価 `player` — `decidePossessionAction`（`ai.shootDistance` 内で `shootProbability × shootPower × aggressiveness` の確率でシュート、それ以外は視野・パス射程内でマークが薄くゴールに近い味方を選んでパス、候補がなければドリブル）
- [x] ボール非保持者の意思決定: マーク・スペースへの移動・守備ポジション取り `player` — `decideDefensiveAction`（最近接の敵をゴール側からマーク）/ `decideSupportAction`（フォーメーション位置＋ボール寄り）/ `decideFreeBallAction`（最近接の味方だけがボールを追い、他はフォーメーション位置）
- [x] 攻守の切り替え（ボール保持権判定に連動したモード遷移） `player` — `decideAction` が `ball.possessorId` を毎ターン再評価して4分岐を切り替える
- [x] 意思決定の確率性（パス/シュート/奪取の成否を乱数＋パラメータで判定） `player` — シュート可否は `chance()`、パス/シュートの方向誤差は `nextRandomRange()` で `passAccuracy`/`shootPower` に応じてブレる（`ai.aimErrorMaxDeg`）

### マイルストーンD: 試合ルールと進行 ✅ 完了
- [x] 試合状態ステートマシン（MATCH_START → KICKOFF → PLAYING → GOAL_SCORED → RESTART_SETUP → (HALF_TIME) → MATCH_END） `match` — `advancePhase` が全遷移を実装、`tests/game/match.test.ts` で検証
- [x] ターン制タイマー（前後半・ターンカウンタ・状態ごとのタイムアウト） `match` — `stepMatch` が `turn`/`phaseTurn` を毎ターン加算、`advancePhase` が `config.match.kickoffTurns`/`goalScoredTurns`/`restartSetupTurns`/`turnsPerHalf` と比較
- [x] ゴール判定（ボールがゴール枠内でゴールラインを越えたか） `match` — `stepMatch` 内 `checkGoal` が `Pitch.isInGoalA`/`isInGoalB` で判定
- [x] スコア管理・得点履歴（得点者・ターン） `match` — `checkGoal` が `scoreLog` に `{team, playerId: lastKickerId, turn}` を追記（マイルストーンAの `currentScore`/`finalizeResult` は既存のものを流用）
- [x] キックオフ／得点後の再開シーケンス（中央リセット・キックオフ権） `match` — `setupKickoff`（全選手を定位置へ・ボール中央・`kickoffSide` の選手が保持）。ゴール時は失点側に `kickoffSide` を設定
- [x] アウトオブバウンズ判定と**簡易再開**（第一ステップは中央付近へ戻し＋相手ボール） `match`+`ball` — `stepMatch` 内 `handleOutOfBounds` が `Pitch.isInBounds` で判定し、最後のキッカーの相手チームで中央に最も近い選手に持たせる
- [x] チーム戦術パラメータ（aggressiveness 等2〜3個）の保持と参照 `match` — `TeamTactics`/`createTeam` はマイルストーンAで実装済み。マイルストーンDでは新規実装なし
- [x] 試合終了・勝敗判定（スコア比較、同点はDraw） `match` — `advancePhase` が後半終了ターンで `MATCH_END` に遷移し `finalizeResult`（マイルストーンAで実装済み）を呼ぶ

### マイルストーンE: シミュレーション統合（初MVP） ✅ 完了
- [x] メインゲームループ（AI判定→選手移動→ボール更新→当たり判定→状態更新→次ターン） `simulator` — `Simulator.step`（`src/simulation/simulator.ts`）が `KICKOFF`/`PLAYING` 中のみ `decideAction`→`stepPlayer`→`stepBall`→`resolveBallPossession` を実行し、毎ターン `stepMatch` を呼ぶ。`tests/simulation/simulator.test.ts` で検証
- [x] ゲームイベントログのコンソール出力（キックオフ・パス・シュート・ゴール・試合結果） `logger` — 既存の `ConsoleLogger`（マイルストーンA以前に実装済み）を `Simulator.step` から呼び出すように配線。得点時 `logGoal`、毎ターン `logTurn`、`MATCH_END` 到達時 `logResult`。パス/シュート個別ログは第一ステップでは見送り（`player.state` の変化で代替観測可能）
- [x] 描画なしで1試合を完走できることを確認（**MVP v0.1**） — `npm run headless` が例外なく `MATCH_END` まで到達し、`Match result: Team A 9 - 8 Team B (Winner: A)` を出力することを確認済み

### マイルストーンF: 可視化（Canvas 2D）
- [ ] 描画抽象インターフェースと NullRenderer（描画なし切替） `renderer`
- [ ] ピッチ描画（矩形・ライン・ゴール） `renderer`
- [ ] 選手描画（チーム色・番号・向き）／ボール描画 `renderer`
- [ ] HUD（スコア・時間・ボール所有チーム）表示 `renderer`
- [ ] デバッグオーバーレイ（目標位置・速度ベクトル・AI状態）※任意 `renderer`
- [ ] `index.html` に試合開始ボタンを追加（シミュレーション開始/一時停止トリガー）
- [ ] `index.html` に選手パラメータ設定UI（`PlayerParams` の speed / passAccuracy / shootPower / vision / aggressiveness をスライダー等で調整）を追加
- [ ] リアルタイムで試合を閲覧できることを確認（**MVP v0.2**）

### マイルストーンG: テスト・調整
- [ ] 各モジュールのユニットテスト（ボール物理・当たり判定・ゴール判定・AI）
- [ ] パラメータ調整（設定ファイル経由で速度・摩擦・パス/シュート判定距離などを調整）
- [ ] 複数試合連続実行の安定性確認・毎回異なる展開になるか（**Release v1.0**）

---

## 第二ステップ以降（後回し・発展）

- [ ] スタミナ消耗・回復、トラップ精度、ドリブル、インターセプト高度化
- [ ] 選手同士の衝突処理
- [ ] オフサイド判定・反則・カード
- [ ] スローイン/コーナー/ゴールキックの厳密化、ゴール線判定の精密化
- [ ] ボールの高さ（3D）・スピン・浮き球・ヘディング
- [ ] ゴールキーパー専用AI
- [ ] 試合中の戦術変更・役割の動的切替、延長戦/PK
- [ ] AI学習（強化学習）による個性化、リーグ戦・ランキング

---

## 推奨着手順（サマリ）

1. マイルストーンA（基盤）→ B（ボール物理）を先に固める
2. C（選手AI）で「自律的に動く」核を作る ← 本ゲーム最大の肝
3. D（ルール）で試合として成立させる
4. E で描画なしMVPを完成（**ここで一度、試合が成立するか観察**）
5. F で可視化、G で調整
