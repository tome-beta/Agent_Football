import type { GameConfig, GameState, Renderer } from "../types";
import type { Logger } from "./logger";
import { createInitialState, stepMatch } from "../game";

export class Simulator {
  readonly state: GameState;
  private renderer: Renderer;
  private logger?: Logger;

  constructor(config: GameConfig, renderer: Renderer, logger?: Logger) {
    this.renderer = renderer;
    this.logger = logger;
    this.state = createInitialState(config);
  }

  step(): void {
    throw new Error("not implemented");
  }

  run(): GameState {
    throw new Error("not implemented");
  }
}
