import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/simulation/config";
import { defaultConfig } from "../../src/config/default";

describe("loadConfig", () => {
  it("returns the defaults when no override is given", () => {
    expect(loadConfig()).toEqual(defaultConfig);
  });

  it("overrides only the given keys within a section", () => {
    const config = loadConfig({ pitch: { width: 40 } as never });
    expect(config.pitch.width).toBe(40);
    expect(config.pitch.length).toBe(defaultConfig.pitch.length);
    expect(config.pitch.goalWidth).toBe(defaultConfig.pitch.goalWidth);
  });

  it("keeps untouched sections at their defaults", () => {
    const config = loadConfig({ random: { seed: 99 } });
    expect(config.random.seed).toBe(99);
    expect(config.ball).toEqual(defaultConfig.ball);
    expect(config.match).toEqual(defaultConfig.match);
    expect(config.team).toEqual(defaultConfig.team);
  });

  it("merges the nested team section per key", () => {
    const config = loadConfig({
      team: { tactics: { A: { aggressiveness: 1, formationWidth: 1 } } } as never,
    });
    expect(config.team.tactics.A.aggressiveness).toBe(1);
    expect(config.team.tactics.B).toEqual(defaultConfig.team.tactics.B);
    expect(config.team.roleParams).toEqual(defaultConfig.team.roleParams);
    expect(config.team.names).toEqual(defaultConfig.team.names);
  });

  it("does not mutate the default config", () => {
    loadConfig({ pitch: { width: 1 } as never });
    expect(defaultConfig.pitch.width).toBe(50);
  });
});
