import type { Renderer, GameConfig, Player, Ball, GameState } from "../types";

export class CanvasRenderer implements Renderer {
  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    throw new Error("not implemented");
  }

  init(): void {
    throw new Error("not implemented");
  }

  clear(): void {
    throw new Error("not implemented");
  }

  drawPitch(config: GameConfig): void {
    throw new Error("not implemented");
  }

  drawPlayers(players: Player[]): void {
    throw new Error("not implemented");
  }

  drawBall(ball: Ball): void {
    throw new Error("not implemented");
  }

  drawHud(state: GameState): void {
    throw new Error("not implemented");
  }
}
