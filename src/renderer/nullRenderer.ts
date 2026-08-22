import type { Renderer, GameConfig, Player, Ball, GameState } from "../types";

/**
 * 何も描画しない `Renderer` 実装。ヘッドレス実行（`src/headless.ts`）とテストで使う。
 * `Simulator` は描画層の有無を意識せず同じコードパスで動けるため、`CanvasRenderer` と
 * 差し替え可能な形にしてある。
 */
export class NullRenderer implements Renderer {
  init(): void {}

  clear(): void {}

  drawPitch(config: GameConfig): void {}

  drawOffsideLines(state: GameState, config: GameConfig): void {}

  drawPlayers(players: Player[]): void {}

  drawBall(ball: Ball): void {}

  drawHud(state: GameState): void {}
}
