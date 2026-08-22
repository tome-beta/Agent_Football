import { describe, it, expect } from "vitest";
import { Simulator } from "../../src/simulation/simulator";
import { loadConfig } from "../../src/simulation/config";
import { NullRenderer } from "../../src/renderer/nullRenderer";
import { distance } from "../../src/game/utils";
import type { Logger } from "../../src/simulation/logger";
import type { GameState, ScoreLogEntry } from "../../src/types";

function fastConfig() {
  return loadConfig({
    match: {
      turnsPerHalf: 30,
      goalScoredTurns: 2,
      restartSetupTurns: 2,
      kickoffTurns: 2,
      offsideStopTurns: 2,
      offsideResumeTurns: 2,
    },
  });
}

describe("Simulator.step", () => {
  it("advances the turn counter and mutates state in place", () => {
    const sim = new Simulator(fastConfig(), new NullRenderer());
    const { state } = sim;
    sim.step();
    expect(state.turn).toBe(1);
    expect(sim.state).toBe(state);
  });

  it("moves players away from their kickoff homes once PLAYING starts", () => {
    const config = fastConfig();
    const sim = new Simulator(config, new NullRenderer());
    for (let i = 0; i < config.match.kickoffTurns + 5; i++) sim.step();

    expect(sim.state.phase).toBe("PLAYING");
    const moved = [...sim.state.teams.A.players, ...sim.state.teams.B.players].some(
      (p) => p.pos.x !== p.homePos.x || p.pos.y !== p.homePos.y
    );
    expect(moved).toBe(true);
  });

  it("does nothing once MATCH_END is reached", () => {
    const sim = new Simulator(fastConfig(), new NullRenderer());
    while (sim.state.phase !== "MATCH_END") sim.step();
    const turnAtEnd = sim.state.turn;

    sim.step();

    expect(sim.state.turn).toBe(turnAtEnd);
  });
});

describe("Simulator.run", () => {
  it("plays a full headless match to MATCH_END without throwing", () => {
    const sim = new Simulator(fastConfig(), new NullRenderer());
    const result = sim.run();

    expect(result.phase).toBe("MATCH_END");
    expect(result.result).not.toBeNull();
    expect(result.result!.durationTurns).toBe(result.turn);
  });

  it("keeps every player and the ball inside the pitch throughout", () => {
    const config = fastConfig();
    const sim = new Simulator(config, new NullRenderer());
    const halfWidth = config.pitch.width / 2;
    const halfLength = config.pitch.length / 2;

    while (sim.state.phase !== "MATCH_END") {
      sim.step();
      for (const p of [...sim.state.teams.A.players, ...sim.state.teams.B.players]) {
        expect(Number.isFinite(p.pos.x)).toBe(true);
        expect(Number.isFinite(p.pos.y)).toBe(true);
        expect(Math.abs(p.pos.x)).toBeLessThanOrEqual(halfWidth + 1e-6);
        expect(Math.abs(p.pos.y)).toBeLessThanOrEqual(halfLength + 1e-6);
      }
      expect(Number.isFinite(sim.state.ball.pos.x)).toBe(true);
      expect(Number.isFinite(sim.state.ball.pos.y)).toBe(true);
    }
  });

  it("never lets two players overlap beyond the collision radius", () => {
    const config = fastConfig();
    const sim = new Simulator(config, new NullRenderer());
    const minDist = config.player.radius * 2;

    while (sim.state.phase !== "MATCH_END") {
      sim.step();
      const players = [...sim.state.teams.A.players, ...sim.state.teams.B.players];
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          expect(distance(players[i].pos, players[j].pos)).toBeGreaterThanOrEqual(minDist - 1e-3);
        }
      }
    }
  });

  it("reports goals and the final result through the logger", () => {
    const logged: { goals: ScoreLogEntry[]; results: GameState[] } = { goals: [], results: [] };
    const logger: Logger = {
      logTurn: () => {},
      logGoal: (entry) => logged.goals.push(entry),
      logResult: (state) => logged.results.push(state),
      logIntentChange: () => {},
    };

    const sim = new Simulator(fastConfig(), new NullRenderer(), logger);
    const result = sim.run();

    expect(logged.results).toHaveLength(1);
    expect(logged.goals).toHaveLength(result.scoreLog.length);
  });
});
