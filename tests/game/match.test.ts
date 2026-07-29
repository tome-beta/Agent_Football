import { describe, it, expect } from "vitest";
import { createInitialState, currentScore, finalizeResult, advancePhase, stepMatch } from "../../src/game/match";
import { Pitch } from "../../src/game/pitch";
import { loadConfig } from "../../src/simulation/config";
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

describe("advancePhase", () => {
  it("moves MATCH_START straight to KICKOFF and sets up the kickoff", () => {
    const config = defaultConfig;
    const state = createInitialState(config);
    advancePhase(state, config);

    expect(state.phase).toBe("KICKOFF");
    expect(state.phaseTurn).toBe(0);
    expect(state.ball.pos).toEqual({ x: 0, y: 0 });
    expect(state.ball.status).toBe("Possessed");
    expect(state.teams.A.players.some((p) => p.id === state.ball.possessorId)).toBe(true);
    for (const p of [...state.teams.A.players, ...state.teams.B.players]) {
      expect(p.pos).toEqual(p.homePos);
    }
  });

  it("stays in KICKOFF until kickoffTurns elapse, then moves to PLAYING", () => {
    const config = loadConfig({ match: { ...defaultConfig.match, kickoffTurns: 3 } });
    const state = createInitialState(config);
    state.phase = "KICKOFF";
    state.phaseTurn = 2;

    advancePhase(state, config);
    expect(state.phase).toBe("KICKOFF");

    state.phaseTurn = 3;
    advancePhase(state, config);
    expect(state.phase).toBe("PLAYING");
    expect(state.phaseTurn).toBe(0);
  });

  it("moves GOAL_SCORED to RESTART_SETUP after goalScoredTurns", () => {
    const config = loadConfig({ match: { ...defaultConfig.match, goalScoredTurns: 2 } });
    const state = createInitialState(config);
    state.phase = "GOAL_SCORED";
    state.phaseTurn = 2;

    advancePhase(state, config);
    expect(state.phase).toBe("RESTART_SETUP");
    expect(state.phaseTurn).toBe(0);
  });

  it("moves RESTART_SETUP to KICKOFF after restartSetupTurns and resets the ball centrally", () => {
    const config = loadConfig({ match: { ...defaultConfig.match, restartSetupTurns: 1 } });
    const state = createInitialState(config);
    state.phase = "RESTART_SETUP";
    state.phaseTurn = 1;

    advancePhase(state, config);
    expect(state.phase).toBe("KICKOFF");
    expect(state.ball.pos).toEqual({ x: 0, y: 0 });
  });

  it("swaps kickoff side and half when leaving HALF_TIME", () => {
    const config = defaultConfig;
    const state = createInitialState(config);
    state.phase = "HALF_TIME";
    state.half = 1;
    state.kickoffSide = "A";

    advancePhase(state, config);

    expect(state.half).toBe(2);
    expect(state.kickoffSide).toBe("B");
    expect(state.phase).toBe("KICKOFF");
  });

  it("moves PLAYING to HALF_TIME at the end of the first half, and to MATCH_END at the end of the second", () => {
    const config = loadConfig({ match: { ...defaultConfig.match, turnsPerHalf: 10 } });

    const first = createInitialState(config);
    first.phase = "PLAYING";
    first.half = 1;
    first.turn = 10;
    advancePhase(first, config);
    expect(first.phase).toBe("HALF_TIME");

    const second = createInitialState(config);
    second.phase = "PLAYING";
    second.half = 2;
    second.turn = 20;
    advancePhase(second, config);
    expect(second.phase).toBe("MATCH_END");
    expect(second.result).not.toBeNull();
  });

  it("does nothing once MATCH_END is reached", () => {
    const config = defaultConfig;
    const state = createInitialState(config);
    state.phase = "MATCH_END";
    state.result = finalizeResult(state);
    const before = { ...state.result };

    advancePhase(state, config);

    expect(state.phase).toBe("MATCH_END");
    expect(state.result).toEqual(before);
  });
});

describe("stepMatch", () => {
  it("increments turn and phaseTurn each call", () => {
    const config = defaultConfig;
    const state = createInitialState(config);
    stepMatch(state, config);
    expect(state.turn).toBe(1);
  });

  it("detects a goal in team B's net as a point for team A and resets for a B kickoff", () => {
    const config = defaultConfig;
    const state = createInitialState(config);
    state.phase = "PLAYING";
    state.phaseTurn = 0;
    const scorer = state.teams.A.players[0];
    state.ball.pos = { x: 0, y: config.pitch.length / 2 };
    state.ball.status = "Free";
    state.ball.lastKickerId = scorer.id;

    stepMatch(state, config);

    expect(currentScore(state)).toEqual({ A: 1, B: 0 });
    expect(state.phase).toBe("GOAL_SCORED");
    expect(state.kickoffSide).toBe("B");
    expect(state.ball.status).toBe("Free");
    expect(state.ball.possessorId).toBeNull();
  });

  it("credits the current possessor, not a stale lastKickerId, when the ball is dribbled in", () => {
    const config = defaultConfig;
    const state = createInitialState(config);
    state.phase = "PLAYING";
    const dribbler = state.teams.A.players[0];
    // lastKickerId は以前パスを出した別の選手のまま（ドリブル中はキックしていないので更新されない）。
    state.ball.pos = { x: 0, y: config.pitch.length / 2 };
    state.ball.status = "Possessed";
    state.ball.possessorId = dribbler.id;
    state.ball.lastKickerId = "A-someone-else";

    stepMatch(state, config);

    expect(state.scoreLog[0].playerId).toBe(dribbler.id);
  });

  it("detects an own-ish goal in team A's net as a point for team B", () => {
    const config = defaultConfig;
    const state = createInitialState(config);
    state.phase = "PLAYING";
    const kicker = state.teams.B.players[0];
    state.ball.pos = { x: 0, y: -config.pitch.length / 2 };
    state.ball.status = "Free";
    state.ball.lastKickerId = kicker.id;

    stepMatch(state, config);

    expect(currentScore(state)).toEqual({ A: 0, B: 1 });
    expect(state.kickoffSide).toBe("A");
  });

  it("resets an out-of-bounds ball to the center and awards it to the opposing team", () => {
    const config = defaultConfig;
    const state = createInitialState(config);
    state.phase = "PLAYING";
    const kicker = state.teams.A.players[0];
    state.ball.pos = { x: config.pitch.width, y: 0 };
    state.ball.status = "Free";
    state.ball.lastKickerId = kicker.id;

    stepMatch(state, config);

    expect(state.ball.status).toBe("Possessed");
    expect(state.teams.B.players.some((p) => p.id === state.ball.possessorId)).toBe(true);
    // ボールは受け手選手の位置へ移る（受け手は中央付近から選ばれる）。
    const receiver = state.teams.B.players.find((p) => p.id === state.ball.possessorId)!;
    expect(state.ball.pos).toEqual(receiver.pos);
  });

  it("leaves an in-bounds, non-scoring ball untouched", () => {
    const config = defaultConfig;
    const state = createInitialState(config);
    state.phase = "PLAYING";
    state.ball.pos = { x: 1, y: 1 };
    state.ball.vel = { x: 2, y: 3 };
    state.ball.status = "Free";

    stepMatch(state, config);

    expect(state.ball.pos).toEqual({ x: 1, y: 1 });
    expect(state.ball.vel).toEqual({ x: 2, y: 3 });
    expect(state.phase).toBe("PLAYING");
  });

  it("does nothing once the match has ended", () => {
    const config = defaultConfig;
    const state = createInitialState(config);
    state.phase = "MATCH_END";
    state.turn = 42;

    stepMatch(state, config);

    expect(state.turn).toBe(42);
  });

  it("runs a full match to completion without throwing", () => {
    const config = loadConfig({
      match: { turnsPerHalf: 20, goalScoredTurns: 2, restartSetupTurns: 2, kickoffTurns: 2 },
    });
    const state = createInitialState(config);
    let guard = 0;
    while (state.phase !== "MATCH_END" && guard < 10000) {
      stepMatch(state, config);
      guard++;
    }
    expect(state.phase).toBe("MATCH_END");
    expect(state.result).not.toBeNull();
    expect(guard).toBeLessThan(10000);
  });
});
