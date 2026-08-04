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
    interceptDistance: 1.5, // パス/シュートの軌跡（線分）にインターセプトを試みる距離 [m]（速度制限なし）
    // 0.2/0.4/0.7/1.0 を20試合ずつ比較し、0.2が最も互角（勝敗8/6/6、総得点50-50）だった。
    // 0.4以上は守備側（特にB）が有利になりすぎる。詳細は TODO.md。
    interceptChance: 0.2, // 軌跡ちょうど上にいるときの成功確率上限（距離に応じて0まで減衰）
    passDistance: 15, // パス受け手候補として検討する距離 [m]
    shootDistance: 20, // シュートを検討し始める距離 [m]
    shootProbability: 0.3, // シュート成功率の基準係数（shootPower・aggressivenessと掛け合わせる）
    // features_1 §8.1 の視野距離レンジ(10〜25m)の中間よりやや広め。
    visionDistance: 22,
    passSpeed: 10, // パスの基準初速 [m/s]
    shootSpeed: 22, // シュートの基準初速上限 [m/s]（shootPowerを掛けて減衰させる）
    aimErrorMaxDeg: 12, // passAccuracy/shootPowerが0のときの最大キック角度誤差 [度]
    dribbleChanceBase: 0.15, // aggressiveness=0.5, vision=90度の選手が受け手ありでもドリブルを選ぶ基準確率
    dribbleChanceAggroSpread: 0.4, // aggressivenessの偏差1あたりの確率変化幅（高いほど自分で運びたがる）
    dribbleChanceVisionSpread: 0.3, // vision(/180)の偏差1あたりの確率変化幅（広いほど受け手を見つけやすくパスを選びやすい）
    moveStopThreshold: 0.1, // この距離未満まで近づいたら移動を止める [m]
    passSpeedDistanceFactor: 0.3, // パス距離1mあたりの初速上乗せ量 [m/s]
    markedRadiusFactor: 2, // パス候補のマーク判定距離 = tackleDistance * この倍率
    dribbleSpeedPenaltyMax: 0.3, // ドリブル中の最大減速率（passAccuracy=0で30%減速、1で減速なし）
    positioning: {
      ballPullWeight: 0.5, // home からの追従上限 = distance(home, ownGoal) * この係数
      repulsionWeight: 4, // 味方が近すぎるときに離れる力の強さ [m]
      minSpacing: 6, // この距離未満で反発が働く [m]
      // coverWeight/pressWeight/pressDistance はマイルストーンGの調整で引き上げた。
      // 元の値（0.6/0.8/12）だと守備が間に合わず、キックオフ〜ゴールのサイクルがほぼ
      // 確実に攻撃側の得点で終わり、先にキックオフするチームが全勝する結果になっていた
      // （20戦20勝を確認）。この値では20戦14勝4敗2分まで改善する。
      coverWeight: 1, // ボール-自ゴール線への吸着ブレンド率
      pressWeight: 2, // 敵ボール保持者への詰め寄りブレンド率（aggressivenessと掛け合わせる）
      pressDistance: 20, // この距離以内の敵保持者にのみ詰め寄る [m]
      surroundRadius: 2.5, // 複数人で詰め寄るとき、敵保持者を囲むリングの半径 [m]
      pressChanceBase: 0.5, // aggressiveness=0.5 の選手が毎ターン実際に詰め寄る確率
      pressChanceSpread: 1.0, // aggressiveness の偏差1あたりの確率変化幅
      receivingDistanceFactor: 0.6, // 受け手ポジションの距離 = passDistance * この係数
      markerAvoidRangeFactor: 0.5, // マーカー回避判定の範囲 = passDistance * この係数
      markerAvoidStepDistance: 3, // マーカー回避時に横へずれる距離 [m]
    },
    offside: {
      enabled: true,
      lineToleranceMeters: 0.5, // 同一ラインとみなす許容誤差 [m]
      pullWeight: 0.4, // オフサイドライン超過時にラインへ引き戻す強さ（ブレンド率）
      // 0.7/0.4/0.2/0.1 を20試合ずつ比較。無効時の平均得点5.00に対し0.7は3.65まで
      // 落ち込み偏りが強すぎたため、最も近い0.4を採用（4.60、勝敗分布も無効時に近い）。
      avoidChance: 0.4, // オフサイドポジションの候補をパス受け手から除外する確率
      // 0.05/0.1/0.15/0.2/0.3/0.5/0.6/0.8/1.0 を比較。0.2以下は逆に悪化する
      // （オフサイド率75%超・平均得点も低下）。0.3が最良の組み合わせ（自然な
      // オフサイド率68%・平均得点4.55、無効時5.10に近い）だったため採用。
      // 単独では目標(20%未満)に届かないが、団子化なしに95%→68%まで下げられた
      // （詳細: specification/features_positioning_redesign.md 方式A）。
      forwardReachFraction: 0.3, // 受け手の前進上限 = distance(ball, goal) * この係数
    },
  },
  team: {
    // features_1 §8.2 のサンプル選手データに準拠。
    roleParams: {
      FW: { speed: 7.2, passAccuracy: 0.7, shootPower: 0.9, vision: 100, aggressiveness: 0.85 },
      MF: { speed: 6.5, passAccuracy: 0.85, shootPower: 0.6, vision: 110, aggressiveness: 0.65 },
      DF: { speed: 6.0, passAccuracy: 0.6, shootPower: 0.4, vision: 90, aggressiveness: 0.4 },
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
    goalScoredTurns: 20,
    restartSetupTurns: 10,
    kickoffTurns: 5,
  },
  physics: {
    dt: 0.1,
  },
  random: {
    seed: 1,
  },
};
