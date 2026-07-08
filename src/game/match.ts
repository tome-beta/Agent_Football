import type { GameState, GameConfig, MatchResult } from "../types";
import { createBall } from "./ball";

export function createInitialState(config: GameConfig): GameState {
  return {
    phase: "MATCH_START",
    turn: 0,
    half: 1,
    teams: {
      A: { side: "A", players: [] },
      B: { side: "B", players: [] },
    },
    ball: createBall(),
    scoreLog: [],
    result: null,
  };
}

export function advancePhase(state: GameState, config: GameConfig): void {
  throw new Error("not implemented");
}

export function stepMatch(state: GameState, config: GameConfig): void {
  throw new Error("not implemented");
}

export function finalizeResult(state: GameState): MatchResult {
  throw new Error("not implemented");
}
