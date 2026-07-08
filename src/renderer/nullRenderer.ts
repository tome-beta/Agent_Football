import type { Renderer, GameConfig, Player, Ball, GameState } from "../types";

export class NullRenderer implements Renderer {
  init(): void {}

  clear(): void {}

  drawPitch(config: GameConfig): void {}

  drawPlayers(players: Player[]): void {}

  drawBall(ball: Ball): void {}

  drawHud(state: GameState): void {}
}
