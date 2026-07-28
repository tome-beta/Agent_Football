import { describe, it, expect } from "vitest";
import { createInitialState, currentScore, finalizeResult } from "../../src/game/match";
import { Pitch } from "../../src/game/pitch";
import { defaultConfig } from "../../src/config/default";
import type { GameState } from "../../src/types";

describe("createInitialState", () => {
  const state = createInitialState(defaultConfig);
  const pitch = new Pitch(defaultConfig);

  it("starts at MATCH_START in the first half with team A kicking off", () => {
    expect(state.phase).toBe("MATCH_START");
    expect(state.turn).toBe(0);
    expect(state.phaseTurn).toBe(0);
    expect(state.half).toBe(1);
    expect(state.kickoffSide).toBe("A");
    expect(state.result).toBeNull();
  });

  it("seeds the rng from the config", () => {
    expect(state.rngSeed).toBe(defaultConfig.random.seed);
  });

  it("creates 3 players per team with unique ids and one of each role", () => {
    for (const side of ["A", "B"] as const) {
      const players = state.teams[side].players;
      expect(players).toHaveLength(3);
      expect(players.map((p) => p.role).sort()).toEqual(["DF", "FW", "MF"]);
      expect(new Set(players.map((p) => p.id)).size).toBe(3);
      expect(players.every((p) => p.team === side)).toBe(true);
    }
  });

  it("places every player in bounds and in their own half", () => {
    for (const side of ["A", "B"] as const) {
      for (const p of state.teams[side].players) {
        expect(pitch.isInBounds(p.pos)).toBe(true);
        // A は y < 0 側、B は y > 0 側の自陣に配置される。
        expect(p.pos.y * (side === "A" ? -1 : 1)).toBeGreaterThan(0);
      }
    }
  });

  it("starts each player at their home position, at rest and Idle", () => {
    for (const p of [...state.teams.A.players, ...state.teams.B.players]) {
      expect(p.pos).toEqual(p.homePos);
      expect(p.pos).not.toBe(p.homePos); // 同一参照ではなくコピー
      expect(p.vel).toEqual({ x: 0, y: 0 });
      expect(p.state).toBe("Idle");
    }
  });

  it("mirrors the two teams' formations", () => {
    const a = state.teams.A.players.find((p) => p.role === "FW")!;
    const b = state.teams.B.players.find((p) => p.role === "FW")!;
    expect(b.homePos.x).toBeCloseTo(-a.homePos.x);
    expect(b.homePos.y).toBeCloseTo(-a.homePos.y);
  });

  it("carries team names and tactics from the config", () => {
    expect(state.teams.A.name).toBe(defaultConfig.team.names.A);
    expect(state.teams.B.tactics).toEqual(defaultConfig.team.tactics.B);
  });

  it("starts with a free ball at the center spot", () => {
    expect(state.ball.pos).toEqual({ x: 0, y: 0 });
    expect(state.ball.status).toBe("Free");
    expect(state.ball.possessorId).toBeNull();
    expect(state.ball.lastKickerId).toBeNull();
  });
});

function stateWithGoals(goals: Array<"A" | "B">, turn = 100): GameState {
  const state = createInitialState(defaultConfig);
  state.turn = turn;
  state.scoreLog = goals.map((team, i) => ({ team, playerId: `${team}-FW`, turn: i }));
  return state;
}

describe("currentScore", () => {
  it("counts goals per team from the score log", () => {
    expect(currentScore(stateWithGoals(["A", "B", "A"]))).toEqual({ A: 2, B: 1 });
  });

  it("is 0-0 with an empty log", () => {
    expect(currentScore(stateWithGoals([]))).toEqual({ A: 0, B: 0 });
  });
});

describe("finalizeResult", () => {
  it("declares the higher score the winner", () => {
    expect(finalizeResult(stateWithGoals(["A", "B", "A"])).winner).toBe("A");
    expect(finalizeResult(stateWithGoals(["B"])).winner).toBe("B");
  });

  it("declares a draw on equal scores", () => {
    expect(finalizeResult(stateWithGoals(["A", "B"])).winner).toBe("Draw");
    expect(finalizeResult(stateWithGoals([])).winner).toBe("Draw");
  });

  it("reports the final score and duration", () => {
    const result = finalizeResult(stateWithGoals(["A", "A", "B"], 180));
    expect(result.scoreA).toBe(2);
    expect(result.scoreB).toBe(1);
    expect(result.durationTurns).toBe(180);
  });
});
