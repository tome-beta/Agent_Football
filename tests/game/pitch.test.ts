import { describe, it, expect } from "vitest";
import { Pitch } from "../../src/game/pitch";
import { defaultConfig } from "../../src/config/default";

describe("Pitch", () => {
  const pitch = new Pitch(defaultConfig);

  it("exposes dimensions from config", () => {
    expect(pitch.width).toBe(defaultConfig.pitch.width);
    expect(pitch.length).toBe(defaultConfig.pitch.length);
    expect(pitch.goalWidth).toBe(defaultConfig.pitch.goalWidth);
  });

  describe("isInBounds", () => {
    it("is true at the center", () => {
      expect(pitch.isInBounds({ x: 0, y: 0 })).toBe(true);
    });

    it("is true exactly on the boundary", () => {
      expect(pitch.isInBounds({ x: pitch.width / 2, y: pitch.length / 2 })).toBe(true);
    });

    it("is false outside the touchline", () => {
      expect(pitch.isInBounds({ x: pitch.width / 2 + 1, y: 0 })).toBe(false);
    });

    it("is false outside the goal line", () => {
      expect(pitch.isInBounds({ x: 0, y: pitch.length / 2 + 1 })).toBe(false);
    });
  });

  describe("isInGoalA", () => {
    it("is true at the center of team A's goal line", () => {
      expect(pitch.isInGoalA({ x: 0, y: -pitch.length / 2 })).toBe(true);
    });

    it("is false when past the goal line but outside the goal width", () => {
      expect(pitch.isInGoalA({ x: pitch.goalWidth, y: -pitch.length / 2 })).toBe(false);
    });

    it("is false when within the goal width but not past the goal line", () => {
      expect(pitch.isInGoalA({ x: 0, y: 0 })).toBe(false);
    });

    it("is false at team B's goal line", () => {
      expect(pitch.isInGoalA({ x: 0, y: pitch.length / 2 })).toBe(false);
    });
  });

  describe("isInGoalB", () => {
    it("is true at the center of team B's goal line", () => {
      expect(pitch.isInGoalB({ x: 0, y: pitch.length / 2 })).toBe(true);
    });

    it("is false at team A's goal line", () => {
      expect(pitch.isInGoalB({ x: 0, y: -pitch.length / 2 })).toBe(false);
    });
  });
});
