import type { GameConfig, Vec2 } from "../types";

export class Pitch {
  readonly width: number;
  readonly length: number;
  readonly goalWidth: number;

  constructor(config: GameConfig) {
    this.width = config.pitch.width;
    this.length = config.pitch.height;
    this.goalWidth = 3.66;
  }

  isInBounds(pos: Vec2): boolean {
    throw new Error("not implemented");
  }

  isInGoalA(pos: Vec2): boolean {
    throw new Error("not implemented");
  }

  isInGoalB(pos: Vec2): boolean {
    throw new Error("not implemented");
  }
}
