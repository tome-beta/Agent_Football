export interface Vec2 {
  x: number;
  y: number;
}

export type TeamSide = "A" | "B";

export type Role = "FW" | "MF" | "DF";

export type PlayerActionState =
  | "Idle"
  | "BallTracking"
  | "Possession"
  | "Passing"
  | "Receiving"
  | "Shooting"
  | "Marking"
  | "MovingToSpace";

export interface PlayerParams {
  speed: number;
  passAccuracy: number;
  shootPower: number;
  vision: number;
  aggressiveness: number;
}

export interface Player {
  id: string;
  team: TeamSide;
  role: Role;
  params: PlayerParams;
  /** キックオフ・再開時に戻る基準位置（フォーメーション上の定位置）。 */
  homePos: Vec2;
  pos: Vec2;
  vel: Vec2;
  state: PlayerActionState;
}

export type BallStatus = "Free" | "Possessed" | "OutOfBounds";

export interface Ball {
  pos: Vec2;
  vel: Vec2;
  status: BallStatus;
  /** 現在ボールを保持している選手ID。status !== "Possessed" のときは null。 */
  possessorId: string | null;
  /** 最後にボールを蹴った選手ID（アウト時の再開権・得点者判定に使う）。保持者とは別物。 */
  lastKickerId: string | null;
}

export type MatchPhase =
  | "MATCH_START"
  | "KICKOFF"
  | "PLAYING"
  | "GOAL_SCORED"
  | "RESTART_SETUP"
  | "HALF_TIME"
  | "MATCH_END";

export interface ScoreLogEntry {
  team: TeamSide;
  playerId: string;
  turn: number;
}

export interface MatchResult {
  scoreA: number;
  scoreB: number;
  winner: TeamSide | "Draw";
  durationTurns: number;
}

/** チーム全体の行動傾向。選手AIが意思決定の重み付けに参照する。 */
export interface TeamTactics {
  /** 0 = 守備的 / 1 = 攻撃的 */
  aggressiveness: number;
  /** 0 = 狭い / 1 = 広い（フォーメーションの横幅） */
  formationWidth: number;
}

export interface Team {
  side: TeamSide;
  name: string;
  tactics: TeamTactics;
  players: Player[];
}

export interface GameState {
  phase: MatchPhase;
  /** 現在のフェーズに入ってから経過したターン数（フェーズのタイムアウト判定用）。 */
  phaseTurn: number;
  turn: number;
  half: 1 | 2;
  /** 次のキックオフを行うチーム。 */
  kickoffSide: TeamSide;
  teams: { A: Team; B: Team };
  ball: Ball;
  scoreLog: ScoreLogEntry[];
  /** 決定的乱数の内部状態。nextRandom() が更新する（Math.random() は使わない）。 */
  rngSeed: number;
  result: MatchResult | null;
}

export interface GameConfig {
  pitch: {
    /** タッチライン方向（x軸）の幅 [m]。 */
    width: number;
    /** ゴールライン方向（y軸）の長さ [m]。 */
    length: number;
    goalWidth: number;
  };
  player: { maxSpeed: number; radius: number };
  ball: {
    radius: number;
    /** 毎秒の速度保持率（0〜1）。実際の適用は friction^dt で dt 非依存にする。 */
    friction: number;
    /** この速度 [m/s] を下回ったらボールを停止させる。 */
    stopThreshold: number;
    maxSpeed: number;
  };
  ai: {
    /** キック可能と判定する選手-ボール距離 [m]。 */
    ballControlDistance: number;
    /** トラップして保持状態に移れる距離 [m]。キック距離より広め。 */
    trapDistance: number;
    /** この速度 [m/s] を超えるボールはトラップ失敗。 */
    trapMaxBallSpeed: number;
    /** 相手保持者からボールを奪える距離 [m]。 */
    tackleDistance: number;
    passDistance: number;
    shootDistance: number;
    shootProbability: number;
    /** 選手がボール・味方・敵を認識できる距離 [m]（視野角は PlayerParams.vision）。 */
    visionDistance: number;
    /** パスの基準初速 [m/s]。実際の速度は距離に応じて多少増える。 */
    passSpeed: number;
    /** シュートの基準初速上限 [m/s]。実際は shootPower を掛けて減衰させる。 */
    shootSpeed: number;
    /** passAccuracy/shootPower が 0 のときの最大キック角度誤差 [度]。1 のとき誤差0。 */
    aimErrorMaxDeg: number;
  };
  team: {
    /** 役割ごとのデフォルト選手パラメータ。 */
    roleParams: Record<Role, PlayerParams>;
    /**
     * 役割ごとの定位置。自陣を基準にした比率で表す。
     * x: width/2 に対する比率（-1〜1）、y: length/2 に対する比率で -1 が自ゴール側、+1 が敵ゴール側。
     */
    formation: Record<Role, Vec2>;
    tactics: Record<TeamSide, TeamTactics>;
    names: Record<TeamSide, string>;
  };
  match: {
    /** 片方のハーフのターン数。前後半で合計 turnsPerHalf * 2 ターン。 */
    turnsPerHalf: number;
    /** GOAL_SCORED に留まるターン数。 */
    goalScoredTurns: number;
    /** RESTART_SETUP に留まるターン数。 */
    restartSetupTurns: number;
    /** KICKOFF に留まるターン数。 */
    kickoffTurns: number;
  };
  physics: {
    /** 1ターンの経過時間 [秒]。 */
    dt: number;
  };
  random: {
    /** 決定的シミュレーションのためのシード値。 */
    seed: number;
  };
}

export interface Renderer {
  init(): void;
  clear(): void;
  drawPitch(config: GameConfig): void;
  drawPlayers(players: Player[]): void;
  drawBall(ball: Ball): void;
  drawHud(state: GameState): void;
}
