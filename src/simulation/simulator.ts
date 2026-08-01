import type { GameConfig, GameState, Player, Renderer } from "../types";
import type { Logger } from "./logger";
import { createInitialState, stepMatch, decideAction, stepPlayer, stepBall, resolveBallPossession } from "../game";

/** AI・ボール物理を動かすフェーズ。得点直後や再開待ちの間は選手・ボールを止めておく。 */
const ACTIVE_PHASES: GameState["phase"][] = ["KICKOFF", "PLAYING"];

export class Simulator {
  readonly state: GameState;
  private config: GameConfig;
  private renderer: Renderer;
  private logger?: Logger;

  constructor(config: GameConfig, renderer: Renderer, logger?: Logger) {
    this.config = config;
    this.renderer = renderer;
    this.logger = logger;
    this.state = createInitialState(config);
  }

  private allPlayers(): Player[] {
    return [...this.state.teams.A.players, ...this.state.teams.B.players];
  }

  /**
   * 1ターン分の処理（features_3 §13）:
   *   1. AI判定（decideAction） 2. 選手移動（stepPlayer） 3. ボール更新（stepBall）
   *   4. 当たり判定（resolveBallPossession） 5. 状態更新（stepMatch） 6. 描画
   *
   * KICKOFF/PLAYING 以外（GOAL_SCORED/RESTART_SETUP/HALF_TIME）は選手・ボールを止め、
   * `stepMatch` によるフェーズ進行のみ行う。
   */
  step(): void {
    const { state, config } = this;
    if (state.phase === "MATCH_END") return;

    const players = this.allPlayers();

    if (ACTIVE_PHASES.includes(state.phase)) {
      for (const player of players) decideAction(player, state, config);
      for (const player of players) stepPlayer(player, config);
      const prevBallPos = { ...state.ball.pos };
      stepBall(state.ball, config);
      resolveBallPossession(players, state.ball, config, prevBallPos, state);
    }

    const goalsBefore = state.scoreLog.length;
    stepMatch(state, config);

    if (this.logger !== undefined) {
      if (state.scoreLog.length > goalsBefore) {
        this.logger.logGoal(state.scoreLog[state.scoreLog.length - 1]);
      }
      this.logger.logTurn(state);
      if ((state.phase as GameState["phase"]) === "MATCH_END") {
        this.logger.logResult(state);
      }
    }

    this.renderer.clear();
    this.renderer.drawPitch(config);
    this.renderer.drawPlayers(players);
    this.renderer.drawBall(state.ball);
    this.renderer.drawHud(state);
  }

  run(): GameState {
    this.renderer.init();
    while (this.state.phase !== "MATCH_END") {
      this.step();
    }
    return this.state;
  }
}
