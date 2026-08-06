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

### マイルストーンF: 可視化（Canvas 2D）✅ 完了
- [x] 描画抽象インターフェースと NullRenderer（描画なし切替） `renderer` — `Renderer`（`src/types.ts`）と `NullRenderer`（マイルストーンAで実装済み）
- [x] ピッチ描画（矩形・ライン・ゴール） `renderer` — `CanvasRenderer.drawPitch`（緑地・白線・センターサークル・両ゴール黄色ハイライト）。表示は横向き（ゴールが左右）にするため `toCanvas` でゲーム座標のx/yを入れ替えている（ゲームロジックの座標系自体は不変）
- [x] 選手描画（チーム色・番号・向き）／ボール描画 `renderer` — `CanvasRenderer.drawPlayers`（チーム色の円＋役割ラベル）/`drawBall`（白丸）。番号・向き矢印は省略し役割ラベルで代替
- [x] HUD（スコア・時間・ボール所有チーム）表示 `renderer` — `CanvasRenderer.drawHud`（スコア・ターン・フェーズ・前後半をテキスト表示）。ボール所有チームの専用ハイライトは省略（選手の色で判別可能）
- [x] デバッグオーバーレイ（目標位置・速度ベクトル・AI状態）※任意 `renderer` — 選手の視野範囲（`visionDistance`×`vision`角度の扇形）をON/OFFできるデバッグ表示のみ実装（`CanvasRenderer.setDebugVision`、`index.html`のチェックボックス）。目標位置・速度ベクトル・AI状態のテキスト表示は範囲を絞って見送り
- [x] `index.html` に試合開始ボタンを追加（シミュレーション開始/一時停止トリガー） — 一時停止/再開トグルボタンと再スタートボタンを実装。`requestAnimationFrame` の連鎖は止めず `running` フラグで `step()` 呼び出しだけを止める設計（連鎖を都度張り直す実装はタイミング問題があり不採用）
- [x] `index.html` に選手パラメータ設定UI（`PlayerParams` の speed / passAccuracy / shootPower / vision / aggressiveness をスライダー等で調整）を追加 — 役割別（FW/MF/DF）スライダー。再スタートボタンで反映した `GameConfig` から新しい `Simulator` を生成する
- [x] リアルタイムで試合を閲覧できることを確認（**MVP v0.2**） — `npm run dev` でブラウザ上で試合が自動再生されることを確認済み
- [x] 表示サイズの調整（2026-08-01、視認性向上のためユーザー依頼） — `CanvasRenderer` の `SCALE`（8→11px/m）でピッチ全体を拡大し、選手マーカー（`PLAYER_MARKER_SCALE=2`）・ボール（`BALL_MARKER_SCALE=2`、最小半径6px）を実際の物理サイズより大きく描画するよう変更（当たり判定の半径自体は変更なし）

### マイルストーンG: テスト・調整 ✅ 完了
- [x] 各モジュールのユニットテスト（ボール物理・当たり判定・ゴール判定・AI） — 既存118件（`tests/game/*`・`tests/simulation/*`）で網羅済みと確認
- [x] パラメータ調整（設定ファイル経由で速度・摩擦・パス/シュート判定距離などを調整） `config` — 下記の安定性確認で「キックオフ側がほぼ確実に得点する」問題を発見し、`GameConfig.ai.positioning` の `coverWeight`（0.6→1）/`pressWeight`（0.8→2）/`pressDistance`（12→20）を引き上げて対処。`src/config/default.ts` にコメントで根拠を明記
- [x] 複数試合連続実行の安定性確認・毎回異なる展開になるか（**Release v1.0**） — 20シード連続実行で例外・NaN・無限ループなしを確認。ただし調整前は**A/B/引き分け = 20/0/0（キックオフ側が全勝、ほぼ交互に規則的なタイミングで得点）**という強い偏りを発見。原因はキックオフ権を持つ側の攻撃をほぼ止められない守備の弱さと判明（キックオフ側をBに強制しても同様にB全勝することで確認）。上記のパラメータ調整により **14/4/2** まで改善（先攻側にわずかな有利が残るのは実際のサッカーのキックオフ権と同程度で許容範囲と判断）

### マイルストーンH: ポジショニング刷新（力の合成モデル）✅ 完了

2026-08-01 の設計議論より。現状の非保持時ポジショニング（`decideDefensiveAction` が単純に「最も近い敵」をマークする）は、3人全員が同じ相手（大抵ボール保持者）に吸い寄せられ「団子状に集まる」挙動になりやすい。役割（FW/MF/DF）で分岐ロジックを書き分けるのではなく、**全選手が同じ力学式に自分の `homePos`/`params` を代入する**ことで結果的に役割らしさがにじみ出る設計に置き換える。詳細な力の定義は会話ログ参照、要点は以下。

- [x] `GameConfig.ai` に `positioning`（`ballPullWeight` / `repulsionWeight` / `minSpacing` / `coverWeight` / `pressWeight` / `pressDistance`）を追加し `src/config/default.ts` にデフォルト値を設定する `config` — `src/types.ts` の `GameConfig.ai.positioning` と `src/config/default.ts` に追加
- [x] Step 1: `teammateRepulsion`（味方同士が `minSpacing` 未満に近づくと反発する力）を既存の非保持ロジックに追加 `player` — `computeTargetPosition` の末尾で全ケース共通に適用
- [x] Step 2: `decideDefensiveAction` の「最も近い敵をマーク」を撤去し、`coverBias`（ボール-自ゴール間の線上に、ボールへの近さに応じた強さで吸着する力）に置き換える `player` — `nearestOpponent` を削除し `computeTargetPosition` 内でボール-自ゴール線への射影ブレンドとして実装
- [x] Step 3: `ballAttraction`（`home` からの理想距離を保ちつつボールに引かれる力。理想距離は `distance(home, ownGoal)` に比例）と `pressure`（敵ボール保持者への詰め寄り。強さは `player.params.aggressiveness` に比例）を追加 `player`
- [x] `decideDefensiveAction` / `decideSupportAction` / `supportPosition` / `decideFreeBallAction` の非追従分岐を、共通関数 `computeTargetPosition(player, state, config)` に統合（呼び出し元は `player.state` の名乗り分けだけ残す） `player` — 敵保持中は ballAttraction+coverBias+pressure、非敵保持中は従来の受け手ポジション計算を内部分岐し、teammateRepulsion は共通適用
- [x] ヘッドレス実行で挙動を確認 — `npm run headless` 相当のコマンドが例外なく `MATCH_END` まで到達（Team A 6 - 4 Team B）。既存の `decideAction` 系テスト12件は無改修のまま全通過（力の合成後も観測可能な挙動が保たれていることを確認）
- [x] 力の合成ロジックのユニットテストを追加 `tests/game/player.test.ts` — 「味方が近すぎると反発が働く」「aggressivenessが高いほど強く詰め寄る」「coverBiasでボール-自ゴール線に寄る」の3件を追加

#### 追加調整（2026-08-01、実試合を見ての改善）

- [x] **複数人で囲む動きがない問題を解消** — 従来は複数の守備者が同じ相手ボール保持者へ同じ方向（自ゴール寄り）から近づくため、囲むのではなく団子状に重なっていた。`computeApproachPoint`（`src/game/player.ts`）を追加し、`pressDistance` 以内にいる味方を id 順に並べて円周上のスロットに割り当て、各人が異なる角度（半径 `positioning.surroundRadius`、既定2.5m）から接近するようにした
- [x] **プレス判断の確率化（意思決定のばらつき）** — 「同じ場面でも選手の判断が毎回変わって見える」ようにするため、pressure（詰め寄り）を無条件実行から `chance()` ベースの確率判定に変更。確率は `positioning.pressChanceBase`/`pressChanceSpread` と `player.params.aggressiveness` から決まり、役割による分岐は書かず aggressiveness の値だけで傾向が変わる（`specification/開発メモ.md` の設計原則に沿う）
- [x] **マジックナンバーの解消** — `player.ts` にハードコードされていた `moveToward` の停止距離(0.1m)・パス初速の距離係数(0.3)・マーク判定距離の倍率(2倍)・受け手ポジションの距離係数(0.6)・マーカー回避判定範囲の係数(0.5)・回避時の横ずれ距離(3m) を `GameConfig.ai`/`ai.positioning` の新規キー（`moveStopThreshold`/`passSpeedDistanceFactor`/`markedRadiusFactor`/`receivingDistanceFactor`/`markerAvoidRangeFactor`/`markerAvoidStepDistance`）に切り出した。数値は変更前と同じなので挙動は変わらない
- [x] balance-check（20シード）で確認 — クラッシュ・NaNなし。プレス確率化後は18勝1敗1分（調整前は16勝1敗3分）で、既存の「キックオフ側優位」傾向から大きく外れていないことを確認

#### パス/ドリブル確率化と、そこから発覚した「パスがノーリスク」問題（2026-08-01）

- [x] **パス/ドリブル選択の確率化** — 受け手がいても `aggressiveness`/`vision` に応じた確率であえてドリブルを続けるようにした（`GameConfig.ai.dribbleChanceBase`/`dribbleChanceAggroSpread`/`dribbleChanceVisionSpread`、`decidePossessionAction`）。`aggressiveness` が高いほどドリブルを選びやすく、`vision` が広いほど受け手を見つけやすくパスを選びやすい。これまで描画デバッグにしか使われていなかった `vision` パラメータに初めて意思決定上の意味を持たせた
- [x] **根本原因の調査** — 計測用スクリプトで「パス/ドリブル/シュート回数」と「奪取（steal）回数」を20試合分計測した結果、**ドリブル確率化前は奪取が0回**（純パスは相手の届かない距離を一瞬で飛ぶため守備側が事実上手を出せない）と判明。ドリブル確率化を入れた途端に奪取69回・総得点ほぼ半減・勝敗分布が大幅に均衡（18/1/1→8/4/8）した。つまり **「パスはノーリスク、ドリブルだけハイリスク」という非対称性**がこれまでの偏りの根本原因だった
- [x] **パスのインターセプト判定を追加** — `resolveBallPossession`（`src/game/collision.ts`）に、フリーボール（パス/シュートで飛行中）を蹴った選手と別チームの選手が奪える処理を追加。トラップと違い `trapMaxBallSpeed` の速度制限を待たない
- [x] **点距離判定での閾値爆発を発見・回避** — 最初はボールの「現在位置」への点距離で判定していたところ、`interceptDistance` を0.8→1.2に上げただけで20試合の奪取回数が324→2901に急増する強い非線形性を発見（1ターンあたりのボール移動距離に対して判定半径が大きくなった途端、軌跡上のほぼ全区間が捕捉範囲に入ってしまうため）。判定を「このターンのボール移動軌跡（前フレーム位置→現在位置の線分）」への距離に変更し、かつ距離に応じた確率化（`GameConfig.ai.interceptChance`、軌跡上で最大・`interceptDistance`で0まで線形減衰）にすることでこの閾値現象を解消した。`resolveBallPossession` のシグネチャに `prevBallPos`/`rng` 引数を追加（呼び出し元は `Simulator.step` のみ）
- [x] パラメータ探索 — `interceptDistance=1.5` 固定で `interceptChance` を0.2/0.4/0.7/1.0で比較し、0.2が最も互角（20試合で勝敗8/6/6、総得点50-50）だったためデフォルト採用。0.4以上は守備側が有利になりすぎる
- [x] テスト追加 — `tests/game/collision.test.ts` にインターセプト成立/不成立/味方除外/距離境界のケースを追加（全122件）、typecheck・headless実行で確認

### マイルストーンI: オフサイド判定（ステップ1・AI回避のみ）✅ 完了

実試合を観察して「ボールより前方に味方が張り付く」「相手守備がゴール前に戻らない」という違和感の原因がオフサイドルール不在にあると判明（2026-08-01）。詳細設計は [`specification/features_offside.md`](specification/features_offside.md) を参照。反則としてのルール適用（ターンオーバー処理）は含めず、AIがオフサイドになる受け手選択・ポジショニングを避ける範囲に限定した。

- [x] `GameConfig.ai.offside`（`enabled`/`lineToleranceMeters`/`pullWeight`/`avoidChance`）を追加し `src/config/default.ts` にデフォルト値を設定する `config`
- [x] `isOffside(receiverPos, side, defendingTeam, ballPosAtKick, config)` と `lastDefenderLineY(side, defendingTeam, config)` を `src/game/offside.ts` に新規実装する `offside`
- [x] `selectPassReceiver`（`src/game/player.ts`）にオフサイド候補の除外を追加する `player` — **当初案（完全除外）は20試合の balance-check で平均得点が5.00→1.05まで急落したため、`avoidChance` による確率的な除外に変更**（0.7/0.4/0.2/0.1を比較し、無効時に最も近い0.4を採用。平均4.60）
- [x] `computeTargetPosition` の受け手ポジション算出（非敵保持時の分岐）をオフサイドラインで補正する `player` — **当初案（ハードクランプ）は両チームの選手とボールがオフサイドライン付近に団子状に固まって動けなくなり平均得点が0.00まで落ち込んだため、`pullWeight` によるソフトな引き戻し力に変更**（ただしpullWeight自体の得点への影響は小さいと判明。詳細は `specification/features_offside.md`「実装後の設計変更」）
- [x] `tests/game/offside.test.ts` を追加（`isOffside`/`lastDefenderLineY` の境界値・A/B攻撃方向反転を含む6件）
- [x] `tests/game/player.test.ts` に `selectPassReceiver` のオフサイド除外テストを追加（`avoidChance=1`で決定的に検証）
- [x] 導入前後で `balance-check`/`anomaly-hunt` の手法を用いて試合展開・勝敗分布を比較し、上記の設計変更に反映した

### マイルストーンJ: オフサイド判定 ステップ2（反則としてのターンオーバー処理）— ⏸ 実装を試みたが撤回

マイルストーンIで見逃した（`avoidChance` の確率で発生する）オフサイドパスを、実際の反則として処理しようとした。設計・実装後の顛末は [`specification/features_offside.md`](specification/features_offside.md)「ステップ2」を参照（2026-08-03）。

- [x] 設計どおり `Ball.offsideOffenderId`/`handleOffside` を実装してみたが、20シードの `balance-check` で平均得点が5.10→1.00へ急落。パスの95%が自然にオフサイドと判定される（受け手ポジショニングが常に相手最終ラインより前を狙う設計のため）ことが原因と判明
- [x] 受け手ポジションをラインへ引き戻す強さ（`pullWeight`）を1.0まで強めればオフサイド率は9%まで下がるが、代わりに当初のハードクランプと同じ「団子化して試合が止まる」不安定性が再発し平均得点0.05まで悪化。**団子化とオフサイド頻発の間に許容できる中間点がなく、ブレンド率の調整では解決不可能**と判断し実装を撤回
- [x] `Ball.offsideOffenderId`/`handleOffside`/関連テストはすべてリバート。ただし副産物の `offsideLineY`（オフサイドラインの計算にボール位置も含める整理）は正しさの改善として `src/game/offside.ts` にコミット済み
- [ ] （再挑戦の前提）受け手ポジショニング算出ロジック自体を「相手守備陣形との距離を継続的に考慮する」設計に作り直す。作り直した後、自然なオフサイド率が十分低い（目安20%未満）ことを確認してから反則化に再挑戦する

### マイルストーンK: 受け手ポジショニング再設計（方式A・C・D実装済み・目標未達のため一旦終了）

マイルストーンJの前提条件を満たすための受け手ポジショニング再設計。手法候補は [`specification/features_positioning_redesign.md`](specification/features_positioning_redesign.md) を参照。リスクの低い方式から段階的に組み込む（A→C→D）。

- [x] 方式A（前進距離の静的キャップ）を実装 `player` — `GameConfig.ai.offside.forwardReachFraction` を追加し、受け手ポジションの前進距離を「ボールからゴールまでの残り距離 × この係数」で頭打ちにする。相手の実位置を参照しないため団子化のフィードバックループが発生しない
- [x] `forwardReachFraction` を0.05〜1.0でbalance-check・自然なオフサイド率を計測し、0.3を採用（オフサイド率95%→68%、平均得点は無効時5.10に対し4.55を維持。団子化は全域で再発せず）
- [x] `tests/game/player.test.ts` に方式Aのキャップ挙動のテストを追加
- [x] 方式C（到達時間ベースの簡易Pitch Control）を方式Aの上に重ねて実装 `player` — `safeForwardDistance` を追加し、方式Aの上限内をサンプリングして「自分の到達時間 <= 相手DF最速到達者の到達時間 + `arrivalSafetyMarginSeconds`」を満たす最前進distanceを選ぶ。方式Aの上限内でのみ絞り込むため団子化の性質を壊さない
- [x] `arrivalSafetyMarginSeconds` を-0.5〜0.2でbalance-check・自然なオフサイド率を計測。以前のような非線形な完全崩壊はなく、なめらかなトレードオフ曲線と判明（-0.2で14%/1.25点、-0.15で33%/2.60点）。追加コストなしに改善する`margin=0`（59%/4.45点）を採用し、目標（20%未満）達成は保留とした
- [x] `tests/game/player.test.ts` に方式Cの安全距離短縮のテストを追加
- [x] 目標未達（59%）のまま方式D検討をスキップし、ステップ2（反則化）に再挑戦してみた — 結果はマイルストーンLに記載。「方式Dで20%未満まで下げてから」という前提を確認しないまま進めたため、想定どおり同じ破滅的偏りが再現した
- [x] マイルストーンLの結果を受け、方式D（KPP的な候補点スコアリング）を実装 `player` — `selectReceivingDistance` が候補地点ごとに「前進度」「オフサイドライン超過量」「相手DFとの到達時間差」を重み付き総和でスコアリングし argmax で選ぶ（`GameConfig.ai.offside.kpp`）。方式Cの閾値カットオフ・`pullWeight`の事後クランプを廃し単一のスコアリングに統合
- [x] `offsideOvershootWeight` を2〜32でbalance-check・自然なオフサイド率を計測 — 60%→51%で頭打ちになり方式A+C（59%）からほぼ改善せず。反則有効化時の平均得点も0.30〜0.40点/試合と同水準の壊滅的偏りのまま。ただしハードクランプ由来の団子化（0.00〜0.05まで崩壊）は全域で再発しなかった
- [x] 原因を分析 — `computeTargetPosition`（狙う位置の計算）をいくら精緻化しても、実際の受け手を選ぶ `selectPassReceiver` が完全に独立したロジック（マーク有無とゴール距離のみ）で動いており連動していないこと、選手が`speed`上限付きで目標を追いかけるため守備ラインの動きに追従が遅れることが根本原因と判断。詳細: `specification/features_positioning_redesign.md`「方式D 実装結果」
- [ ] 目標未達のまま2026-08-06時点で検証を打ち切り。再挑戦するなら `selectPassReceiver` と `computeTargetPosition` を統合する、より大掛かりな再設計が必要（`config.ai.offside.enabled` は `false` のまま）

### マイルストーンL: オフサイド判定 ステップ2 再挑戦（2026-08-05）— ⏸ 再度撤回、デフォルト無効化

マイルストーンKの目標（自然なオフサイド率20%未満）が未達（59%）のまま、ユーザーの指示でステップ2（反則化）に再挑戦した。設計は `specification/features_offside.md`「ステップ2」の設計をそのまま再実装。詳細は同ファイル末尾の追記を参照。

- [x] `Ball.offsideOffenderId` を再追加し `src/game/ball.ts`/`src/types.ts` に実装。`decidePossessionAction`（`player.ts`）のパス実行時にオフサイド判定済みの受け手ならフラグを立てる
- [x] `handleOffside(state, config)` を `src/game/match.ts` に実装し、`stepMatch` から `checkGoal`/`handleOutOfBounds` より先に呼ぶ。フラグの選手が実際に保持したら反則成立で相手ボール（ボールの現在地から再開）、他の選手が触れたら不成立でフラグだけ消える
- [x] `tests/game/match.test.ts`（`handleOffside` の反則成立/不成立/持ち越しの3件）・`tests/game/player.test.ts`（パス時のフラグ設定/非設定2件）を追加。全138件通過・typecheckも通過
- [x] 20シードの `balance-check` で確認 — **平均得点が4.6→0.45点/試合まで急落**（引き分け13/20）し、マイルストーンJ(2026-08-03)と同じ破滅的偏りが方式A・C導入後も再現することを確認した
- [x] `config.ai.offside.enabled` のデフォルトを `true` → `false` に変更し無効化した（`src/config/default.ts` にコメントで経緯を明記）。**今回はコード自体（`Ball.offsideOffenderId`/`handleOffside`/関連テスト）はリポジトリに残す**方針とした（マイルストーンJでは撤回時にコード自体を削除したが、今回はユーザー判断で温存）
- [ ] 再挑戦の前提条件（マイルストーンK: 自然なオフサイド率20%未満）を満たしてから `config.ai.offside.enabled` を再度 `true` に戻すこと。方式D等でポジショニングをさらに改善しない限り有効化しない

---

## 第二ステップ以降（後回し・発展）

- [ ] スタミナ消耗・回復、トラップ精度、ドリブル、インターセプト高度化
- [ ] 選手同士の衝突処理
- [ ] オフサイド判定・反則・カード（ステップ2以降: 反則としてのターンオーバー処理、守備のオフサイドトラップ連携。`specification/features_offside.md` 参照）
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
