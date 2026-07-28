import type { GameConfig, Vec2 } from "../types";

// 座標系: 原点はピッチ中央。x はタッチライン方向（±width/2）、y はゴールライン方向（±length/2）。
// チームA は y = -length/2 側のゴールを守り、チームB は y = +length/2 側のゴールを守る。
export class Pitch {
  readonly width: number;
  readonly length: number;
  readonly goalWidth: number;

  constructor(config: GameConfig) {
    this.width = config.pitch.width;
    this.length = config.pitch.height;
    this.goalWidth = config.pitch.goalWidth;
  }

  isInBounds(pos: Vec2): boolean {
    return (
      pos.x >= -this.width / 2 &&
      pos.x <= this.width / 2 &&
      pos.y >= -this.length / 2 &&
      pos.y <= this.length / 2
    );
  }

  isInGoalA(pos: Vec2): boolean {
    return pos.y <= -this.length / 2 && Math.abs(pos.x) <= this.goalWidth / 2;
  }

  isInGoalB(pos: Vec2): boolean {
    return pos.y >= this.length / 2 && Math.abs(pos.x) <= this.goalWidth / 2;
  }
}
