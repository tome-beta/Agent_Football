import type { GameConfig } from "../types";

/**
 * ゲームプレイ定数はすべてここに集約する（ロジック側でのハードコード禁止）。
 *
 * 単位系: 距離 = メートル、速度 = m/s、時間 = 秒。
 * 1ターン = physics.dt 秒として扱い、ボール摩擦も dt に依存しない形で適用する。
 */
export const defaultConfig: GameConfig = {
  pitch: {
    width: 50,
    length: 75,
    // ゴールの総幅（features_2 §2.1 の 7.32m）。判定は |x| <= goalWidth / 2。
    goalWidth: 7.32,
  },
  player: {
    maxSpeed: 7,
    radius: 0.5,
  },
  ball: {
    radius: 0.11,
    // 毎秒あたりの速度保持率。0.55 は転がるボールの速度が約1.2秒で半減する程度の減速。
    friction: 0.55,
    stopThreshold: 0.05,
    maxSpeed: 30,
  },
  ai: {
    ballControlDistance: 1.5, // キック可能と判定する選手-ボール距離 [m]
    trapDistance: 2.0, // トラップして保持に移れる距離 [m]（キック距離より広め）
    trapMaxBallSpeed: 5, // この速度[m/s]を超えるボールはトラップ失敗
    tackleDistance: 1.0, // 相手保持者からボールを奪える距離 [m]
    tackleSuccessChanceBase: 0.6, // technique=0.5の守備者がタックルを試みたときの成功確率
    tackleSuccessTechniqueSpread: 0.4, // techniqueの偏差1あたりの成功率変化幅（高いほど奪いやすい）
    possessorStunTurns: 5, // 奪われた側が止まるターン数（5ターン=0.5秒）
    defenderStunTurns: 5, // かわされた守備者が止まるターン数
    interceptDistance: 1.5, // パス/シュートの軌跡（線分）にインターセプトを試みる距離 [m]（速度制限なし）
    // 0.2/0.4/0.7/1.0 を20試合ずつ比較し、0.2が最も互角（勝敗8/6/6、総得点50-50）だった。
    // 0.4以上は守備側（特にB）が有利になりすぎる。詳細は TODO.md。
    interceptChance: 0.2, // 軌跡ちょうど上にいるときの成功確率上限（距離に応じて0まで減衰）
    passDistance: 15, // パス受け手候補として検討する距離 [m]
    shootDistance: 20, // シュートを検討し始める距離 [m]
    shootProbability: 0.3, // シュート成功率の基準係数（shootPower・mentalと掛け合わせる）
    // features_1 §8.1 の視野距離レンジ(10〜25m)の中間よりやや広め。
    visionDistance: 22,
    passSpeed: 10, // パスの基準初速 [m/s]
    shootSpeed: 22, // シュートの基準初速上限 [m/s]（shootPowerを掛けて減衰させる）
    aimErrorMaxDeg: 12, // passAccuracy/shootPowerが0のときの最大キック角度誤差 [度]
    dribbleChanceBase: 0.15, // mental=0.5, vision=90度の選手が受け手ありでもドリブルを選ぶ基準確率
    dribbleChanceMentalSpread: 0.4, // mentalの偏差1あたりの確率変化幅（高いほど自分で運びたがる）
    dribbleChanceVisionSpread: 0.3, // vision(/180)の偏差1あたりの確率変化幅（広いほど受け手を見つけやすくパスを選びやすい）
    // 選んだ受け手がオフサイドの場合に「そもそも試みるか」を判定する独立の確率。
    // mentalが高い選手ほど試みやすく、低い選手ほど諦めてドリブルへ回る。base=0なので
    // mental<=0.5の選手（DFなど）は実質0%（一切試みない）、mental=0.65(MF)で約2%、
    // mental=0.85(FW)で約5%という滑らかな階調になる。20〜40シードのbalance-check
    // （3つの独立したシード範囲で確認）で、反則有効時に平均得点3.8〜4.05/試合
    // （無効時4.60）・反則3.6〜3.7件/試合という安定した中間点になることを確認した
    // （2026-08-16）。base/spreadをさらに上げると反則が急増して得点が崩壊し、下げすぎると
    // 反則が0件になり「AIが選択肢を放棄しているだけ」の不自然な状態に戻ってしまう。
    offsideRiskAttemptChanceBase: 0, // mental=0.5のときの基準値
    offsideRiskAttemptChanceMentalSpread: 0.15, // mentalの偏差1あたりどれだけ上げるか
    keepDribbleEvasionBase: 0.5, // マークされている孤立時ドリブルの回避方向ブレンド率の基準値
    keepDribbleEvasionMentalSpread: 0.6, // mentalの偏差1あたりの変化幅（高いほど回避せずゴール優先）
    keepDribbleEvasionTechniqueSpread: 0.4, // techniqueの偏差1あたりの変化幅（高いほど回避に頼らずゴール優先＝打開力）
    minHoldTurnsBase: 4, // mental=0.5の選手が最低ドリブル継続する保持ターン数（4ターン=0.4秒）
    minHoldTurnsMentalSpread: 4, // mentalの偏差1あたりの変化幅（高いほど長く持ち運ぶ）
    moveStopThreshold: 0.1, // この距離未満まで近づいたら移動を止める [m]
    passSpeedDistanceFactor: 0.3, // パス距離1mあたりの初速上乗せ量 [m/s]
    markedRadiusFactor: 2, // パス候補のマーク判定距離 = tackleDistance * この倍率
    dribbleSpeedPenaltyMax: 0.3, // ドリブル中の最大減速率（passAccuracy=0で30%減速、1で減速なし）
    // balance-checkで0/0.2/0.3/0.4/0.5/0.7/1.0を比較（2026-08-08）。過去のポジショニング系の
    // 変更と違い全域で平均得点4.75〜5.35と非線形な崩壊は見られなかった（無効時5.20）。
    // 視覚的な効果とバランスの安定性を見て0.5を採用（平均得点5.10）。
    soloDribbleSpeedFactor: 0.5, // 前方に味方がいないときの追加減速率
    soloDribbleSupportMargin: 2, // 「前方に味方がいる」とみなす最小の前進差 [m]
    positioning: {
      ballPullWeight: 0.5, // home からの追従上限 = distance(home, ownGoal) * この係数
      repulsionWeight: 4, // 味方が近すぎるときに離れる力の強さ [m]
      minSpacing: 6, // この距離未満で反発が働く [m]
      // balance-checkで0/1/2/3を比較予定の暫定値。mental差1(0〜1レンジ)あたりminSpacingを
      // どれだけ振るか。2なら差0.45(既定パラメータの実質最大差)でminSpacing 6±0.9m程度になる。
      minSpacingMentalSpread: 2,
      // coverWeight/pressWeight/pressDistance はマイルストーンGの調整で引き上げた。
      // 元の値（0.6/0.8/12）だと守備が間に合わず、キックオフ〜ゴールのサイクルがほぼ
      // 確実に攻撃側の得点で終わり、先にキックオフするチームが全勝する結果になっていた
      // （20戦20勝を確認）。この値では20戦14勝4敗2分まで改善する。
      coverWeight: 1, // ボール-自ゴール線への吸着ブレンド率
      pressWeight: 2, // 敵ボール保持者への詰め寄りブレンド率（mentalと掛け合わせる）
      pressDistance: 20, // この距離以内の敵保持者にのみ詰め寄る [m]
      surroundRadius: 2.5, // 複数人で詰め寄るとき、敵保持者を囲むリングの半径 [m]
      pressChanceBase: 0.5, // mental=0.5 の選手が毎ターン実際に詰め寄る確率
      pressChanceSpread: 1.0, // mental の偏差1あたりの確率変化幅
      lastManPressSuppression: 0.2, // 最終ライン（自ゴールに最も近い選手）のpressChanceに掛ける係数
      goalCoverDangerDistance: 20, // この距離[m]以内でゴール前カバーの横方向オフセットが効き始める
      goalMouthSpreadDistance: 3, // 危険ゾーン内でhome.xの符号方向へずらす最大距離[m]（goalWidth 7.32の半分弱）
      goalRecallWeight: 0.6, // 危険ゾーン内でtarget.yをown.yへ直接引き寄せる強さ（dangerと掛け合わせる）
      receivingDistanceFactor: 0.6, // 受け手ポジションの距離 = passDistance * この係数
      receivingDistanceMentalSpread: 0.15, // mentalの偏差1あたりreceivingDistanceFactorをどれだけ振るか（高いほど遠くへ飛び出す）
      markerAvoidRangeFactor: 0.5, // マーカー回避判定の範囲 = passDistance * この係数
      markerAvoidStepDistance: 3, // マーカー回避時に横へずれる距離 [m]
      // 0/0.05/0.1/0.15/0.2/0.3/0.5 を20試合ずつ比較（balance-check、2026-08-08）。
      // 0.2までは平均得点5.10前後を維持するが、0.3で0.55、0.5で0.00（全試合引き分け）まで
      // 急落する非線形な閾値を発見した。安全マージンを見て閾値からやや離れた0.15を採用
      // （平均得点5.20、勝敗分布も無効時に近い）。
      receivingHomeBlendY: 0.15, // 受け手ポジションのyをhomePos.yとブレンドする比率
      backSupportChanceBase: 0.15, // mental=0.5の選手が毎ターンバックサポートを選ぶ基準確率
      backSupportMentalSpread: 0.5, // mentalの偏差1あたりの確率変化幅（低いほど後方支援に回りやすい）
      backSupportDistanceFactor: 0.5, // バックサポート位置の距離 = passDistance * この係数
      backSupportDistanceMentalSpread: 0.15, // mentalの偏差1あたりbackSupportDistanceFactorをどれだけ振るか（低いほど深く下がる）
      lateralSupportChanceBase: 0.25, // vision=90度の選手が毎ターン横サポートを選ぶ基準確率
      lateralSupportVisionSpread: 0.5, // visionの偏差1あたりの確率変化幅（広いほど選びやすい）
      lateralSupportDistanceFactor: 0.6, // 横サポート位置の距離 = passDistance * この係数
      lateralSupportDistanceVisionSpread: 0.15, // visionの偏差1あたりlateralSupportDistanceFactorをどれだけ振るか（広いほど大きく開く）
    },
    offside: {
      // ステップ1（AI回避）。過去（2026-08-08）に avoidanceEnabled=true が平均得点0.00まで
      // 崩壊した原因は、scoreReceivingSpot の overshoot（オフサイドライン超過量）が
      // メートル単位の非正規化値のまま advanced（0〜1の無次元値）と加減算されていたバグ
      // だったと判明（デバッグ調査、2026-08-16）。forwardReachFraction=0.3 で前進報酬の
      // 上限が0.3程度に抑えられている状態でメートル単位のペナルティを足すと、重み0.25程度
      // でもすぐ前進報酬を消し飛ばし、崩壊が起きていた。overshoot を remaining（ボールから
      // ゴールまでの残り距離）で正規化し advanced と同じ無次元スケールに揃えたところ、
      // 崩壊は「非線形の崖」から「滑らかなトレードオフ」に変わった。forwardReachFraction=0.7・
      // offsideOvershootWeight=0.5（正規化後の値）の組み合わせで20シードのbalance-check
      // 平均得点5.10（無効時6.05に近い）まで回復したため、ステップ1を正式に有効化する。
      avoidanceEnabled: true,
      // ステップ2（反則としてのターンオーバー処理、Ball.offsideOffenderId/handleOffside）。
      // 「反則率を下げれば安全」という前提で offsideOvershootWeight/forwardReachFraction を
      // 何度調整しても、団子化と自然な反則率の高止まりの間に許容できる中間点が見つからない
      // という状態が続いていた（TODO_ARCHIVE.mdマイルストーンJ〜O）。2026-08-16、方針を
      // 「反則を限りなくゼロに近づける」から「mentalが高い（積極的な）選手だけがオフサイド
      // 覚悟で裏へ抜けるパスを低頻度で試み、時には成功し時には反則になる」という許容に
      // 転換した（ユーザー判断）。offsideRiskAttemptChanceBase/MentalSpread で「そもそも
      // 試みるか」を選手のmentalに応じた独立の確率にし、selectPassReceiver自体はオンサイドを
      // 絶対優先しない（多少オフサイド気味の候補を選ぶのは「判断ミス」として許容）設計に
      // 変えたところ、複数シード範囲のbalance-checkで平均得点3.8〜4.05/試合（無効時4.60）・
      // 反則3.6〜3.7件/試合という安定した中間点が得られたため、正式に有効化する。
      enforcementEnabled: true,
      lineToleranceMeters: 0.5, // 同一ラインとみなす許容誤差 [m]
      // 受け手の前進上限 = distance(ball, goal) * この係数。0.3→0.7に拡大（2026-08-16、
      // overshoot正規化後の再チューニング。0.3のままだと前進報酬の上限が低すぎ、正規化後も
      // 得点が伸び悩んだ）。
      forwardReachFraction: 0.7,
      arrivalSafetyMarginSeconds: 0, // 到達時間比較の余裕[秒]
      arrivalSampleSteps: 8, // 前進距離のサンプリング段階数
      // 方式E（統一スコアリング）。selectPassReceiver/computeTargetPositionが共有する
      // scoreReceivingSpot の重み。advanced/overshoot/markingPressure はいずれも
      // 無次元（0〜1程度）または残り距離に対する比率として揃えてあるため、重みは
      // 概ね同スケールで比較できる。
      kpp: {
        forwardWeight: 1, // 前進度（0〜1）への報酬
        // computeTargetPosition（受け手の位置取り）用。オフサイドライン超過量（残り距離に
        // 対する比率）へのペナルティ。2→0.5に変更（2026-08-16、overshootの正規化に伴う
        // 再チューニング。旧2はメートル単位の超過量にかけていた値で、正規化後にそのまま
        // 使うと団子化する。弱めに保つことで団子化を避ける）。
        offsideOvershootWeight: 0.5,
        // selectPassReceiver（誰にパスするか）用。当初 offsideOvershootWeight とは別に強めの
        // 値（2）を試したが、重みを1.0→1.25の間で非線形にチーム全体の前進が止まる崩壊
        // （団子化と同系統の現象）が再発した。「同程度の位置なら必ずオンサイドを選ぶ」という
        // 強い保証は追求せず、多少オフサイド気味の候補を選んでしまうことは「選手の判断ミス」
        // として許容する方針に転換（ユーザー判断、2026-08-16）。実際にそのリスキーな候補へ
        // パスを試みるかどうかは offsideRiskAttemptChance（mental駆動）側で制御するため、
        // ここは offsideOvershootWeight と同じ値に戻す。
        receiverOvershootWeight: 0.5,
        arrivalDeficitWeight: 1, // 到達時間の遅れ1秒あたりのペナルティ（computeTargetPositionのみ）
        markingWeight: 1, // マーク（敵接近）1mあたりのペナルティ
      },
    },
    collision: {
      // physical差1（0〜1レンジ、例: DF 0.7 vs FW 0.6 の差0.1）あたり配分比を0.5から
      // どれだけ振るか。0.3なら差0.1で0.53/0.47、差0.5(理論上の最大)で0.65/0.35程度の
      // 緩やかな差になる。役割分岐ではなくphysicalの値そのものが効くようにする狙い。
      physicalSpread: 0.3,
      // 配分比を[0.15, 0.85]に収める。physical差が理論上の最大でも一方が動かなくなる
      // （ロックする）ことがないようにする安全マージン。
      minPushRatio: 0.15,
    },
    intent: {
      // フリーボールを最寄りとして追い始めてから、追いつけなくても強制的に再判断する
      // までのターン数（マイルストーンN-1）。ball.status==="Free" が続く限り毎ターン
      // decideFreeBallAction が呼ばれるため、これがないと追いつけない間ずっと
      // ChaseLooseBall のままになり得る。visionDistance圏内からの追跡なので、
      // 通常はこれより先にボールへ追いつくか、他選手が拾って"Free"でなくなる想定。
      chaseLooseBallMaxDurationTurns: 5, // 5ターン=0.5秒
      // 検討メモ（specification/選手思考の状態遷移を検討.md）の目安 0.4〜1.2秒 を
      // dt=0.1秒換算した値。balance-checkで統計的同等性を確認済み（マイルストーンN-2）。
      supportMinDurationTurns: 4, // 4ターン=0.4秒
      supportMaxDurationTurns: 12, // 12ターン=1.2秒
      coverMinDurationTurns: 4, // 4ターン=0.4秒（Support系と同じ水準）
      coverMaxDurationTurns: 12, // 12ターン=1.2秒
      pressMinDurationTurns: 1, // 1ターン=0.1秒
      pressMaxDurationTurns: 3, // 3ターン=0.3秒
    },
  },
  team: {
    // features_1 §8.2 のサンプル選手データに準拠。
    roleParams: {
      // technique/stamina/physical/jump は型のみの追加パラメータ（現状挙動未反映、Phase 2で実装予定）。
      FW: {
        speed: 7.2,
        passAccuracy: 0.7,
        shootPower: 0.9,
        vision: 100,
        mental: 0.85,
        technique: 0.45,
        stamina: 0.7,
        physical: 0.6,
        jump: 0.6,
      },
      MF: {
        speed: 6.5,
        passAccuracy: 0.85,
        shootPower: 0.6,
        vision: 110,
        mental: 0.65,
        technique: 0.6,
        stamina: 0.8,
        physical: 0.6,
        jump: 0.6,
      },
      DF: {
        speed: 6.0,
        passAccuracy: 0.6,
        shootPower: 0.4,
        vision: 90,
        mental: 0.4,
        technique: 0.75,
        stamina: 0.7,
        physical: 0.7,
        jump: 0.6,
      },
    },
    // 自陣を基準にした比率。y = -1 が自ゴール、+1 が敵ゴール。
    formation: {
      DF: { x: 0, y: -0.6 },
      MF: { x: -0.35, y: -0.25 },
      FW: { x: 0.35, y: -0.05 },
    },
    tactics: {
      A: { aggressiveness: 0.6, formationWidth: 0.5 },
      B: { aggressiveness: 0.6, formationWidth: 0.5 },
    },
    names: {
      A: "Team A",
      B: "Team B",
    },
  },
  match: {
    // dt = 0.1s なので 900ターン = 前半90秒。
    turnsPerHalf: 900,
    // GOAL_SCORED/OFFSIDE_STOP/OFFSIDE_RESUME の実際の表示時間は、シミュレーションの
    // ターン数ではなく main.ts 側で現実時間（壁時計）5秒として管理する
    // （ユーザー指摘：試合速度やspeedMultiplierに応じて表示時間が変わってしまうのは望ましくない）。
    // ここでの値は「フェーズを1回のstepMatch呼び出しで抜けられる」ための最小値でよい。
    goalScoredTurns: 1,
    restartSetupTurns: 10,
    kickoffTurns: 5,
    offsideStopTurns: 1,
    offsideResumeTurns: 1,
  },
  physics: {
    dt: 0.1,
  },
  random: {
    seed: 1,
  },
};
