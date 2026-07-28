import { describe, it, expect } from "vitest";
import { nextRandom, nextRandomRange, chance } from "../../src/game/random";

describe("nextRandom", () => {
  it("returns values in [0, 1)", () => {
    const holder = { rngSeed: 1 };
    for (let i = 0; i < 1000; i++) {
      const v = nextRandom(holder);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = { rngSeed: 42 };
    const b = { rngSeed: 42 };
    const seqA = Array.from({ length: 20 }, () => nextRandom(a));
    const seqB = Array.from({ length: 20 }, () => nextRandom(b));
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = { rngSeed: 1 };
    const b = { rngSeed: 2 };
    expect(nextRandom(a)).not.toBe(nextRandom(b));
  });

  it("advances the holder state", () => {
    const holder = { rngSeed: 7 };
    nextRandom(holder);
    expect(holder.rngSeed).not.toBe(7);
  });
});

describe("nextRandomRange", () => {
  it("stays within the requested range", () => {
    const holder = { rngSeed: 3 };
    for (let i = 0; i < 500; i++) {
      const v = nextRandomRange(holder, -5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });
});

describe("chance", () => {
  it("always fails at p = 0 and always succeeds at p = 1", () => {
    const holder = { rngSeed: 9 };
    for (let i = 0; i < 100; i++) {
      expect(chance(holder, 0)).toBe(false);
      expect(chance(holder, 1)).toBe(true);
    }
  });

  it("roughly matches the requested probability", () => {
    const holder = { rngSeed: 123 };
    let hits = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      if (chance(holder, 0.3)) hits++;
    }
    expect(hits / n).toBeGreaterThan(0.27);
    expect(hits / n).toBeLessThan(0.33);
  });
});
