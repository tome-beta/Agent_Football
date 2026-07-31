import type { GameState, ScoreLogEntry } from "../types";

/**
 * 試合の進行をログ出力するためのインターフェース。`Simulator.step` が
 * ターンごと・ゴール発生時・試合終了時に呼び出す（呼び出しは任意、`logger` は省略可能）。
 */
export interface Logger {
  logTurn(state: GameState): void;
  logGoal(entry: ScoreLogEntry): void;
  logResult(state: GameState): void;
}

/** `console.log` に出力するデフォルトの `Logger` 実装。ヘッドレス実行・ブラウザ実行の両方で使う。 */
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
