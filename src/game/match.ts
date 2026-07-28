import type { GameState, GameConfig, MatchResult, TeamSide } from "../types";
import { createBall } from "./ball";
import { createTeam } from "./player";

export function createInitialState(config: GameConfig): GameState {
  return {
    phase: "MATCH_START",
    phaseTurn: 0,
    turn: 0,
    half: 1,
    kickoffSide: "A",
    teams: {
      A: createTeam("A", config),
      B: createTeam("B", config),
    },
    ball: createBall(),
    scoreLog: [],
    rngSeed: config.random.seed,
    result: null,
  };
}

/** scoreLog から現在のスコアを集計する（スコアは scoreLog を単一の情報源とする）。 */
export function currentScore(state: GameState): { A: number; B: number } {
  const score = { A: 0, B: 0 };
  for (const entry of state.scoreLog) {
    score[entry.team] += 1;
  }
  return score;
}

export function advancePhase(state: GameState, config: GameConfig): void {
  throw new Error("not implemented");
}

export function stepMatch(state: GameState, config: GameConfig): void {
  throw new Error("not implemented");
}

export function finalizeResult(state: GameState): MatchResult {
  const score = currentScore(state);
  let winner: TeamSide | "Draw" = "Draw";
  if (score.A > score.B) winner = "A";
  else if (score.B > score.A) winner = "B";

  return {
    scoreA: score.A,
    scoreB: score.B,
    winner,
    durationTurns: state.turn,
  };
}
