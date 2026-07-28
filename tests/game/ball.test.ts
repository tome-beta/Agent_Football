import { describe, it, expect } from "vitest";
import { createBall, stepBall, kickBall } from "../../src/game/ball";
import { loadConfig } from "../../src/simulation/config";
import { length } from "../../src/game/utils";
import type { Ball } from "../../src/types";

const config = loadConfig();
const { dt } = config.physics;

function freeBallAt(pos: { x: number; y: number }, vel: { x: number; y: number }): Ball {
  return { ...createBall(), pos, vel };
}

describe("createBall", () => {
  it("starts free and at rest on the center spot", () => {
    const ball = createBall();
    expect(ball.pos).toEqual({ x: 0, y: 0 });
    expect(ball.vel).toEqual({ x: 0, y: 0 });
    expect(ball.status).toBe("Free");
    expect(ball.possessorId).toBeNull();
    expect(ball.lastKickerId).toBeNull();
  });
});

describe("stepBall", () => {
  it("moves the ball by vel * dt", () => {
    const ball = freeBallAt({ x: 0, y: 0 }, { x: 10, y: -4 });
    stepBall(ball, config);
    expect(ball.pos.x).toBeCloseTo(10 * dt);
    expect(ball.pos.y).toBeCloseTo(-4 * dt);
  });

  it("applies friction as a per-second retention rate raised to dt", () => {
    const ball = freeBallAt({ x: 0, y: 0 }, { x: 10, y: 0 });
    stepBall(ball, config);
    expect(ball.vel.x).toBeCloseTo(10 * Math.pow(config.ball.friction, dt));
  });

  it("is frame-rate independent: 1 second of small steps ~= 1 second of one big step", () => {
    const many = freeBallAt({ x: 0, y: 0 }, { x: 10, y: 0 });
    const one = freeBallAt({ x: 0, y: 0 }, { x: 10, y: 0 });
    const coarse = loadConfig({ physics: { dt: 1 } });

    for (let i = 0; i < Math.round(1 / dt); i++) stepBall(many, config);
    stepBall(one, coarse);

    // 速度は厳密に一致する（減衰が指数関数のため）。位置は積分誤差の分だけずれる。
    expect(many.vel.x).toBeCloseTo(one.vel.x, 6);
  });

  it("mutates the ball in place and returns nothing", () => {
    const ball = freeBallAt({ x: 0, y: 0 }, { x: 5, y: 0 });
    expect(stepBall(ball, config)).toBeUndefined();
    expect(ball.pos.x).not.toBe(0);
  });

  it("caps the speed at maxSpeed", () => {
    const ball = freeBallAt({ x: 0, y: 0 }, { x: 1000, y: 1000 });
    stepBall(ball, config);
    expect(length(ball.vel)).toBeLessThanOrEqual(config.ball.maxSpeed + 1e-9);
  });

  it("stops the ball once it drops below stopThreshold", () => {
    const ball = freeBallAt({ x: 0, y: 0 }, { x: config.ball.stopThreshold * 0.99, y: 0 });
    stepBall(ball, config);
    expect(ball.vel).toEqual({ x: 0, y: 0 });
  });

  it("stops within the same turn from exactly stopThreshold", () => {
    // 停止判定は摩擦のあとに行うため、閾値ちょうどの速度は同じターンで閾値を下回り停止する。
    const ball = freeBallAt({ x: 0, y: 0 }, { x: config.ball.stopThreshold, y: 0 });
    stepBall(ball, config);
    expect(ball.vel).toEqual({ x: 0, y: 0 });
    // 停止しても、そのターン分の移動は済んでいる。
    expect(ball.pos.x).toBeCloseTo(config.ball.stopThreshold * dt);
  });

  it("keeps rolling while clearly above stopThreshold", () => {
    const ball = freeBallAt({ x: 0, y: 0 }, { x: config.ball.stopThreshold * 10, y: 0 });
    stepBall(ball, config);
    expect(ball.vel.x).toBeGreaterThan(0);
  });

  it("eventually comes to a complete stop", () => {
    const ball = freeBallAt({ x: 0, y: 0 }, { x: 20, y: 0 });
    for (let i = 0; i < 1000; i++) stepBall(ball, config);
    expect(ball.vel).toEqual({ x: 0, y: 0 });
    expect(Number.isFinite(ball.pos.x)).toBe(true);
  });

  it("does not move a possessed ball (the possessor drags it instead)", () => {
    const ball: Ball = {
      ...createBall(),
      pos: { x: 3, y: 4 },
      vel: { x: 9, y: 9 },
      status: "Possessed",
      possessorId: "A-FW",
    };
    stepBall(ball, config);
    expect(ball.pos).toEqual({ x: 3, y: 4 });
    expect(ball.vel).toEqual({ x: 9, y: 9 });
  });

  it("does not move an out-of-bounds ball (it waits for the restart)", () => {
    const ball: Ball = { ...createBall(), pos: { x: 30, y: 0 }, vel: { x: 5, y: 0 }, status: "OutOfBounds" };
    stepBall(ball, config);
    expect(ball.pos).toEqual({ x: 30, y: 0 });
  });
});

describe("kickBall", () => {
  it("sets the velocity to power in the given direction", () => {
    const ball = createBall();
    kickBall(ball, { x: 0, y: 1 }, 12, "A-FW");
    expect(ball.vel.x).toBeCloseTo(0);
    expect(ball.vel.y).toBeCloseTo(12);
  });

  it("normalizes the direction, so its magnitude does not affect the speed", () => {
    const unit = createBall();
    const long = createBall();
    kickBall(unit, { x: 1, y: 0 }, 8, "A-FW");
    kickBall(long, { x: 100, y: 0 }, 8, "A-FW");
    expect(long.vel).toEqual(unit.vel);
    expect(length(long.vel)).toBeCloseTo(8);
  });

  it("handles a diagonal direction", () => {
    const ball = createBall();
    kickBall(ball, { x: 3, y: 4 }, 10, "A-FW");
    expect(ball.vel.x).toBeCloseTo(6);
    expect(ball.vel.y).toBeCloseTo(8);
    expect(length(ball.vel)).toBeCloseTo(10);
  });

  it("releases possession and records the kicker", () => {
    const ball: Ball = { ...createBall(), status: "Possessed", possessorId: "A-FW" };
    kickBall(ball, { x: 0, y: 1 }, 10, "A-FW");
    expect(ball.status).toBe("Free");
    expect(ball.possessorId).toBeNull();
    expect(ball.lastKickerId).toBe("A-FW");
  });

  it("overwrites lastKickerId on the next kick", () => {
    const ball = createBall();
    kickBall(ball, { x: 0, y: 1 }, 10, "A-FW");
    kickBall(ball, { x: 0, y: -1 }, 10, "B-DF");
    expect(ball.lastKickerId).toBe("B-DF");
  });

  it("drops the ball at rest when kicked with a zero direction", () => {
    const ball: Ball = { ...createBall(), status: "Possessed", possessorId: "A-FW" };
    kickBall(ball, { x: 0, y: 0 }, 10, "A-FW");
    expect(ball.vel).toEqual({ x: 0, y: 0 });
    expect(ball.status).toBe("Free");
  });

  it("leaves the speed cap to the next stepBall", () => {
    const ball = createBall();
    kickBall(ball, { x: 0, y: 1 }, config.ball.maxSpeed * 10, "A-FW");
    expect(length(ball.vel)).toBeGreaterThan(config.ball.maxSpeed);

    stepBall(ball, config);
    expect(length(ball.vel)).toBeLessThanOrEqual(config.ball.maxSpeed + 1e-9);
  });
});
