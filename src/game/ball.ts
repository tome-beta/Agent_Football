import type { Ball, GameConfig, Vec2 } from "../types";

export function createBall(): Ball {
  return {
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    status: "Free",
    lastKickerId: null,
  };
}

export function stepBall(ball: Ball, config: GameConfig): void {
  throw new Error("not implemented");
}

export function kickBall(ball: Ball, dir: Vec2, power: number, kickerId: string): void {
  throw new Error("not implemented");
}
