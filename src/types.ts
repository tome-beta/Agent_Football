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
  pos: Vec2;
  vel: Vec2;
  state: PlayerActionState;
}

export type BallStatus = "Free" | "Possessed" | "OutOfBounds";

export interface Ball {
  pos: Vec2;
  vel: Vec2;
  status: BallStatus;
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
}

export interface Team {
  side: TeamSide;
  players: Player[];
}

export interface GameState {
  phase: MatchPhase;
  turn: number;
  half: 1 | 2;
  teams: { A: Team; B: Team };
  ball: Ball;
  scoreLog: ScoreLogEntry[];
  result: MatchResult | null;
}

export interface GameConfig {
  pitch: { width: number; height: number };
  player: { maxSpeed: number; radius: number };
  ball: { radius: number; friction: number; maxSpeed: number };
  ai: {
    ballControlDistance: number;
    passDistance: number;
    shootDistance: number;
    shootProbability: number;
  };
  physics: { dt: number };
}

export interface Renderer {
  init(): void;
  clear(): void;
  drawPitch(config: GameConfig): void;
  drawPlayers(players: Player[]): void;
  drawBall(ball: Ball): void;
  drawHud(state: GameState): void;
}
