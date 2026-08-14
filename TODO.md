# サッカーゲーム開発 TODOリスト

カルチョビット風・パラメータ駆動の自律サッカーゲーム。
第一ステップは **3対3・地上2次元** で「選手が自律的に動いて試合が成立する」ことを目指す。

各機能の詳細な検討内容は以下を参照:
- 選手AI・パラメータ … [`doc/features_1_player_ai.md`](doc/features_1_player_ai.md)
- ボール物理・ピッチ … [`doc/features_2_ball_pitch.md`](doc/features_2_ball_pitch.md)
- 試合ルール・進行 … [`doc/features_3_match_rules.md`](doc/features_3_match_rules.md)
- 技術基盤・描画・ロードマップ … [`doc/features_4_tech_roadmap.md`](doc/features_4_tech_roadmap.md)

完了済み・撤回済みタスクの詳細な経緯は [`TODO_ARCHIVE.md`](TODO_ARCHIVE.md) に切り出してある。ここには**現在地と未完了タスクのみ**を残す。

---

## 全体方針

- **言語/描画**: TypeScript（ブラウザ）。まずは**描画なし（純ロジック、Node ヘッドレス実行）でシミュレーションを完成**させ、後から Canvas 2D で可視化する2段階アプローチ。両段階とも完了済み。
- **時間管理**: ターン制（1ターン = `config.physics.dt` = 0.1秒）。フレームレートに紐づかない離散シミュレーション。
- **設計原則**: ゲームロジック層（`game/`）は描画層に依存しない。パラメータはハードコードせず設定ファイル化。役割（FW/MF/DF）による分岐ロジックではなく、`PlayerParams` の値が確率/強度に効く式で行動を設計する（[[feedback_param_driven_behavior]]）。
- **想定モジュール構成**: `pitch`（フィールド定義）/ `ball`（物理）/ `player`（AI）/ `match`（ルール・状態）/ `simulator`（ループ）/ `renderer`（描画）。

---

## 現在の到達点

第一ステップ（マイルストーンA〜M）はすべて完了・決着済み（詳細は [`TODO_ARCHIVE.md`](TODO_ARCHIVE.md)）。要約:

- 基盤・物理・当たり判定・選手AI・試合ルール・シミュレーション統合・Canvas描画・テスト調整（マイルストーンA〜G）：完了、`npm run headless`/`dev` とも動作
- ポジショニング刷新（力の合成モデル、マイルストーンH）：完了
- オフサイド判定 ステップ1（AI回避のみ、マイルストーンI）：完了。`config.ai.offside.avoidanceEnabled` は使用可能
- オフサイド判定 ステップ2（反則としてのターンオーバー処理、マイルストーンJ〜M）：**複数回試みたが撤回**。反則有効化時に平均得点がほぼ0まで崩壊する問題が未解決。根本原因は「攻撃がほぼ縦パス依存で代替手段が弱い」構造的な脆さと推定（詳細は [`TODO_ARCHIVE.md`](TODO_ARCHIVE.md) マイルストーンM）。`config.ai.offside.enabled`/`enforcementEnabled` は `false` のまま維持

---

## 未完了タスク

### マイルストーンN: 選手AI 意図（Intent）ベース状態遷移の導入

現行の `decideAction`/`computeTargetPosition` は非保持時の移動先を毎ターンゼロから計算し直しており、境界値付近で選手の行き先がターンごとに反転する「フラフラ」の原因になっている。設計は [`specification/features_intent_state_machine.md`](specification/features_intent_state_machine.md) を参照（設計のみ・未着手）。ブランチ: `feature/player-intent-state-machine`。

- [x] N-1: `Player.intent` フィールド基盤（choose/execute分離）を導入し、`ChaseLooseBall` のみ intent 化する最小検証ステップ。受け入れ基準はbalance-checkでの統計的分布の同等性（完全一致は求めない）。20シード比較で総得点8.60→8.90、勝敗分布も既存のB優位傾向を維持したまま（同等と判断、`chaseLooseBallMaxDurationTurns=5`）
- [x] N-2: `decideSupportAction`/`decideFreeBallAction` が共有する `computeTargetPosition` 内の `Support`/`BackSupport`/`LateralSupport` 選択を intent 化（`resolveSupportIntentTarget`）。20シード比較で総得点8.65（N-1後8.90、導入前8.60）、勝敗分布もN-1直後にあったB偏り(6/13/1)が緩和(9/8/3)し同等と判断。`supportMinDurationTurns=4`/`supportMaxDurationTurns=12`
- [x] N-3: `WaitOnside`/`RunBehind` intentを新設し、既存オフサイドフラグとは別の `stateBasedWaitEnabled` で単独評価できるようにした。**既知の制約**: 20シードのbalance-checkで有効化すると平均得点0.00（全試合0-0）の崩壊を確認（原因はGK不在で守備ラインごと自陣深くまで下がる場面にWaitOnside/RunBehindが素朴に追従してしまうため。詳細は`src/config/default.ts`の`stateBasedWaitEnabled`コメント参照）。`avoidanceEnabled`で過去に確認された崩壊と同系統。デフォルトは無効のまま維持し、再挑戦は「オフサイド ステップ2 再挑戦（保留中）」と合わせて後日
- [x] N-4: 守備側（`decideDefensiveAction`。`Cover`/`Press` を含む）を intent 化。`Cover`は常にベース位置として計算し、`Press`はその上に詰め寄りブレンドを乗せる構造のため、Support系と異なり決定論的な複合分岐ではなく「ベース＋オプション」の形でintent化した。20シード比較で総得点8.70（N-3時8.65）、勝敗9/10/1（N-3時9/8/3）と同等。`pressMinDurationTurns=1`/`pressMaxDurationTurns=3`（当初2/6で試したが14/20とB偏りが出たため短縮）

これでマイルストーンNの4段階すべて完了。設計は[`specification/features_intent_state_machine.md`](specification/features_intent_state_machine.md)参照。

### オフサイド ステップ2 再挑戦（保留中）

- [ ] 受け手ポジショニング側の改善はマイルストーンKで打ち切り。再挑戦するなら以下のいずれかが必要:
  - 攻撃側の選択肢強化（ドリブル・短いパス等の代替ルート）
  - 反則発生率を一桁台まで下げる別アプローチ
  - 守備をゾーンディフェンスからマンマーク寄りに変更し、数的優位実験の傾向を明確化する軽量な実験（マイルストーンMで示唆されたが未着手）

### 第二ステップ以降（後回し・発展）

- [ ] スタミナ消耗・回復、トラップ精度、ドリブル、インターセプト高度化
- [ ] 選手同士の衝突処理
- [ ] オフサイド判定・反則・カード（ステップ2以降: 反則としてのターンオーバー処理、守備のオフサイドトラップ連携。`specification/features_offside.md` 参照）
- [ ] スローイン/コーナー/ゴールキックの厳密化、ゴール線判定の精密化
- [ ] ボールの高さ（3D）・スピン・浮き球・ヘディング
- [ ] ゴールキーパー専用AI
- [ ] 試合中の戦術変更・役割の動的切替、延長戦/PK
- [ ] AI学習（強化学習）による個性化、リーグ戦・ランキング
