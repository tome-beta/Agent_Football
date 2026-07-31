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
    passDistance: 15, // パス受け手候補として検討する距離 [m]
    shootDistance: 20, // シュートを検討し始める距離 [m]
    shootProbability: 0.3, // シュート成功率の基準係数（shootPower・aggressivenessと掛け合わせる）
    // features_1 §8.1 の視野距離レンジ(10〜25m)の中間よりやや広め。
    visionDistance: 22,
    passSpeed: 10, // パスの基準初速 [m/s]
    shootSpeed: 22, // シュートの基準初速上限 [m/s]（shootPowerを掛けて減衰させる）
    aimErrorMaxDeg: 12, // passAccuracy/shootPowerが0のときの最大キック角度誤差 [度]
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
