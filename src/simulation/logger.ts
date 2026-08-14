import type { GameState, PlayerIntentType, ScoreLogEntry } from "../types";

/**
 * 試合の進行をログ出力するためのインターフェース。`Simulator.step` が
 * ターンごと・ゴール発生時・試合終了時に呼び出す（呼び出しは任意、`logger` は省略可能）。
 */
export interface Logger {
  logTurn(state: GameState): void;
  logGoal(entry: ScoreLogEntry): void;
  logResult(state: GameState): void;
  /**
   * 選手の意図（`Player.intent.type`）が切り替わるたびに呼ばれる
   * （`specification/選手思考の状態遷移を検討.md` 第5段階: 状態遷移ログ）。
   */
  logIntentChange(playerId: string, from: PlayerIntentType, to: PlayerIntentType, turn: number): void;
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

  logIntentChange(playerId: string, from: PlayerIntentType, to: PlayerIntentType, turn: number): void {
    console.log(`Turn ${turn}: ${playerId} ${from} -> ${to}`);
  }
}
