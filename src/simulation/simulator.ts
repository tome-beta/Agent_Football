import type { GameConfig, GameState, Player, Renderer } from "../types";
import type { Logger } from "./logger";
import {
  createInitialState,
  stepMatch,
  decideAction,
  stepPlayer,
  stepBall,
  resolveBallPossession,
  resolveAllPlayerCollisions,
} from "../game";

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
   *   1. AI判定（decideAction） 2. 選手移動（stepPlayer） 3. 選手同士の衝突解決
   *      （resolveAllPlayerCollisions） 4. ボール更新（stepBall） 5. 当たり判定
   *      （resolveBallPossession） 6. 状態更新（stepMatch） 7. 描画
   *
   * KICKOFF/PLAYING 以外（GOAL_SCORED/RESTART_SETUP/HALF_TIME/OFFSIDE_STOP/OFFSIDE_RESUME）は選手・ボールを止め、
   * `stepMatch` によるフェーズ進行のみ行う。
   */
  step(): void {
    const { state, config } = this;
    if (state.phase === "MATCH_END") return;

    const players = this.allPlayers();

    if (ACTIVE_PHASES.includes(state.phase)) {
      const logger = this.logger;
      const onIntentChange = logger
        ? (playerId: string, from: Player["intent"]["type"], to: Player["intent"]["type"]) =>
            logger.logIntentChange(playerId, from, to, state.turn)
        : undefined;
      for (const player of players) decideAction(player, state, config, onIntentChange);
      for (const player of players) stepPlayer(player, config);
      resolveAllPlayerCollisions(players, config);
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
