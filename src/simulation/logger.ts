import type { GameState, ScoreLogEntry } from "../types";

export interface Logger {
  logTurn(state: GameState): void;
  logGoal(entry: ScoreLogEntry): void;
  logResult(state: GameState): void;
}

export class ConsoleLogger implements Logger {
  logTurn(state: GameState): void {
    console.log(`Turn ${state.turn}, Phase: ${state.phase}`);
  }

  logGoal(entry: ScoreLogEntry): void {
    console.log(`Goal! Team ${entry.team} scored at turn ${entry.turn}`);
  }

  logResult(state: GameState): void {
    if (state.result) {
      console.log(`Match result: Team A ${state.result.scoreA} - ${state.result.scoreB} Team B (Winner: ${state.result.winner})`);
    }
  }
}
