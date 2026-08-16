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

  it("does not share nested ai.offside/ai.positioning objects with defaultConfig", () => {
    // 以前は ai セクションが1階層しか複製されず、ai.offside/ai.positioning は
    // defaultConfig のオブジェクトをそのまま共有参照していた。呼び出し側が
    // `config.ai.offside.avoidanceEnabled = true` のように直接書き換えると、
    // 以降の loadConfig() 呼び出しすべてに汚染が漏れていた（回帰防止）。
    const config = loadConfig({ random: { seed: 1 } });
    config.ai.offside.avoidanceEnabled = false;
    config.ai.offside.kpp.forwardWeight = 999;
    config.ai.positioning.pressWeight = 999;

    expect(defaultConfig.ai.offside.avoidanceEnabled).toBe(true);
    expect(defaultConfig.ai.offside.kpp.forwardWeight).not.toBe(999);
    expect(defaultConfig.ai.positioning.pressWeight).not.toBe(999);
  });

  it("no-arg call returns a fresh object each time, not the shared defaultConfig instance", () => {
    const a = loadConfig();
    const b = loadConfig();
    expect(a).not.toBe(defaultConfig);
    expect(a).not.toBe(b);
    expect(a).toEqual(defaultConfig);
  });
});
