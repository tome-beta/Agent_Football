import { describe, it, expect } from "vitest";
import {
  canKick,
  resolvePlayerBall,
  resolveBallPossession,
  resolvePlayerPlayer,
} from "../../src/game/collision";
import { createBall } from "../../src/game/ball";
import { createPlayer } from "../../src/game/player";
import { loadConfig } from "../../src/simulation/config";
import type { Ball, GameConfig, Player, Role, TeamSide, Vec2 } from "../../src/types";
import type { RngHolder } from "../../src/game/random";

const config = loadConfig();

function playerAt(id: string, team: TeamSide, pos: Vec2, role: Role = "FW"): Player {
  return createPlayer(id, team, role, config.team.roleParams[role], pos);
}

function ballAt(pos: Vec2, vel: Vec2 = { x: 0, y: 0 }): Ball {
  return { ...createBall(), pos, vel };
}

function rng(seed = 1): RngHolder {
  return { rngSeed: seed };
}

/**
 * `resolveBallPossession` の簡易ラッパー。デフォルトではボールの軌跡（前フレーム位置）を
 * 今の位置と同じ点として呼ぶ（＝旧シグネチャと同じ「点」判定になる）。インターセプトの
 * 確率・軌跡をテストしたい場合だけ `opts` で上書きする。
 */
function resolve(
  players: Player[],
  ball: Ball,
  opts: { prevBallPos?: Vec2; config?: GameConfig } = {}
): void {
  const cfg = opts.config ?? config;
  const prevBallPos = opts.prevBallPos ?? ball.pos;
  resolveBallPossession(players, ball, cfg, prevBallPos, rng());
}

describe("canKick", () => {
  it("is true inside the kick distance", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    expect(canKick(player, ballAt({ x: 1, y: 0 }), config)).toBe(true);
  });

  it("is true exactly at the kick distance", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    const ball = ballAt({ x: config.ai.ballControlDistance, y: 0 });
    expect(canKick(player, ball, config)).toBe(true);
  });

  it("is false beyond the kick distance", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    const ball = ballAt({ x: config.ai.ballControlDistance + 0.01, y: 0 });
    expect(canKick(player, ball, config)).toBe(false);
  });

  it("is narrower than the trap distance", () => {
    expect(config.ai.ballControlDistance).toBeLessThan(config.ai.trapDistance);
  });

  it("is false for an out-of-bounds ball", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    const ball: Ball = { ...ballAt({ x: 0, y: 0 }), status: "OutOfBounds" };
    expect(canKick(player, ball, config)).toBe(false);
  });
});

describe("resolvePlayerBall", () => {
  it("traps a slow free ball within the trap distance", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    const ball = ballAt({ x: config.ai.trapDistance - 0.1, y: 0 }, { x: 1, y: 0 });

    expect(resolvePlayerBall(player, ball, config)).toBe(true);
    expect(ball.status).toBe("Possessed");
    expect(ball.possessorId).toBe("A-FW");
    expect(ball.pos).toEqual(player.pos);
  });

  it("traps at exactly the trap distance", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    const ball = ballAt({ x: config.ai.trapDistance, y: 0 });
    expect(resolvePlayerBall(player, ball, config)).toBe(true);
  });

  it("does not trap beyond the trap distance", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    const ball = ballAt({ x: config.ai.trapDistance + 0.01, y: 0 });

    expect(resolvePlayerBall(player, ball, config)).toBe(false);
    expect(ball.status).toBe("Free");
    expect(ball.possessorId).toBeNull();
  });

  it("traps a ball travelling at exactly trapMaxBallSpeed", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    const ball = ballAt({ x: 0.5, y: 0 }, { x: config.ai.trapMaxBallSpeed, y: 0 });
    expect(resolvePlayerBall(player, ball, config)).toBe(true);
  });

  it("fails to trap a ball travelling faster than trapMaxBallSpeed", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    const ball = ballAt({ x: 0.5, y: 0 }, { x: config.ai.trapMaxBallSpeed + 0.01, y: 0 });

    expect(resolvePlayerBall(player, ball, config)).toBe(false);
    expect(ball.status).toBe("Free");
  });

  it("does not change lastKickerId when trapping", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    const ball: Ball = { ...ballAt({ x: 0.5, y: 0 }), lastKickerId: "B-MF" };

    resolvePlayerBall(player, ball, config);
    expect(ball.lastKickerId).toBe("B-MF");
  });

  it("drags the ball along with its possessor", () => {
    const player = playerAt("A-FW", "A", { x: 10, y: -5 });
    player.vel = { x: 2, y: 1 };
    const ball: Ball = {
      ...ballAt({ x: 0, y: 0 }),
      status: "Possessed",
      possessorId: "A-FW",
    };

    expect(resolvePlayerBall(player, ball, config)).toBe(true);
    expect(ball.pos).toEqual({ x: 10, y: -5 });
    expect(ball.vel).toEqual({ x: 2, y: 1 });
    // 選手の座標オブジェクトをそのまま共有しないこと（後の移動でボールが勝手に動く）。
    expect(ball.pos).not.toBe(player.pos);
  });

  it("ignores a ball possessed by someone else", () => {
    const player = playerAt("B-DF", "B", { x: 0, y: 0 });
    const ball: Ball = { ...ballAt({ x: 0.1, y: 0 }), status: "Possessed", possessorId: "A-FW" };

    expect(resolvePlayerBall(player, ball, config)).toBe(false);
    expect(ball.possessorId).toBe("A-FW");
  });

  it("ignores an out-of-bounds ball", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    const ball: Ball = { ...ballAt({ x: 0, y: 0 }), status: "OutOfBounds" };

    expect(resolvePlayerBall(player, ball, config)).toBe(false);
    expect(ball.status).toBe("OutOfBounds");
  });
});

describe("resolveBallPossession", () => {
  it("gives a free ball to the nearest eligible player", () => {
    const near = playerAt("A-FW", "A", { x: 0.3, y: 0 });
    const far = playerAt("B-DF", "B", { x: 1.5, y: 0 });
    const ball = ballAt({ x: 0, y: 0 });

    resolve([far, near], ball);
    expect(ball.possessorId).toBe("A-FW");
  });

  it("leaves a free ball alone when nobody is close enough", () => {
    const player = playerAt("A-FW", "A", { x: 50, y: 50 });
    const ball = ballAt({ x: 0, y: 0 });

    resolve([player], ball);
    expect(ball.status).toBe("Free");
    expect(ball.possessorId).toBeNull();
  });

  it("leaves a fast free ball alone even with players nearby", () => {
    const player = playerAt("A-FW", "A", { x: 0.1, y: 0 });
    const ball = ballAt({ x: 0, y: 0 }, { x: config.ai.trapMaxBallSpeed + 1, y: 0 });

    resolve([player], ball);
    expect(ball.status).toBe("Free");
  });

  it("lets an opponent within the tackle distance steal the ball", () => {
    const holder = playerAt("A-FW", "A", { x: 0, y: 0 });
    const thief = playerAt("B-DF", "B", { x: config.ai.tackleDistance - 0.1, y: 0 });
    const ball: Ball = {
      ...ballAt({ x: 0, y: 0 }, { x: 1, y: 1 }),
      status: "Possessed",
      possessorId: "A-FW",
      lastKickerId: "A-FW",
    };

    resolve([holder, thief], ball);
    expect(ball.possessorId).toBe("B-DF");
    expect(ball.pos).toEqual(thief.pos);
    // 奪取ではボールを蹴っていないので lastKickerId は変わらない。
    expect(ball.lastKickerId).toBe("A-FW");
    // 奪取時は速度を0にして新しい保持者が操作を始める。
    expect(ball.vel).toEqual({ x: 0, y: 0 });
  });

  it("steals at exactly the tackle distance", () => {
    const holder = playerAt("A-FW", "A", { x: 0, y: 0 });
    const thief = playerAt("B-DF", "B", { x: config.ai.tackleDistance, y: 0 });
    const ball: Ball = { ...ballAt({ x: 0, y: 0 }), status: "Possessed", possessorId: "A-FW" };

    resolve([holder, thief], ball);
    expect(ball.possessorId).toBe("B-DF");
  });

  it("does not steal from beyond the tackle distance", () => {
    const holder = playerAt("A-FW", "A", { x: 0, y: 0 });
    const thief = playerAt("B-DF", "B", { x: config.ai.tackleDistance + 0.01, y: 0 });
    const ball: Ball = { ...ballAt({ x: 0, y: 0 }), status: "Possessed", possessorId: "A-FW" };

    resolve([holder, thief], ball);
    expect(ball.possessorId).toBe("A-FW");
  });

  it("never steals from a team-mate", () => {
    const holder = playerAt("A-FW", "A", { x: 0, y: 0 });
    const mate = playerAt("A-MF", "A", { x: 0.05, y: 0 }, "MF");
    const ball: Ball = { ...ballAt({ x: 0, y: 0 }), status: "Possessed", possessorId: "A-FW" };

    resolve([holder, mate], ball);
    expect(ball.possessorId).toBe("A-FW");
  });

  it("picks the nearest opponent when several can tackle", () => {
    const holder = playerAt("A-FW", "A", { x: 0, y: 0 });
    const nearThief = playerAt("B-DF", "B", { x: 0.2, y: 0 });
    const farThief = playerAt("B-MF", "B", { x: 0.8, y: 0 }, "MF");
    const ball: Ball = { ...ballAt({ x: 0, y: 0 }), status: "Possessed", possessorId: "A-FW" };

    resolve([holder, farThief, nearThief], ball);
    expect(ball.possessorId).toBe("B-DF");
  });

  it("keeps the ball glued to its possessor when nobody tackles", () => {
    const holder = playerAt("A-FW", "A", { x: 7, y: 2 });
    holder.vel = { x: 1, y: 0 };
    const ball: Ball = { ...ballAt({ x: 0, y: 0 }), status: "Possessed", possessorId: "A-FW" };

    resolve([holder], ball);
    expect(ball.pos).toEqual({ x: 7, y: 2 });
    expect(ball.vel).toEqual({ x: 1, y: 0 });
  });

  it("recovers when the possessor is missing from the player list", () => {
    const player = playerAt("A-FW", "A", { x: 50, y: 50 });
    const ball: Ball = { ...ballAt({ x: 0, y: 0 }), status: "Possessed", possessorId: "ghost" };

    resolve([player], ball);
    expect(ball.status).toBe("Free");
    expect(ball.possessorId).toBeNull();
  });

  it("does nothing for an out-of-bounds ball", () => {
    const player = playerAt("A-FW", "A", { x: 0, y: 0 });
    const ball: Ball = { ...ballAt({ x: 0, y: 0 }), status: "OutOfBounds" };

    resolve([player], ball);
    expect(ball.status).toBe("OutOfBounds");
    expect(ball.possessorId).toBeNull();
  });

  it("lets an opponent exactly on the ball's trajectory intercept a fast pass when interceptChance is 1", () => {
    const kicker = playerAt("A-FW", "A", { x: -10, y: 0 });
    // 軌跡（prevBallPos→ball.pos）ちょうど上（距離0）に置き、proximity=1にする。
    const opponent = playerAt("B-DF", "B", { x: 0, y: 0 });
    const ball: Ball = {
      ...ballAt({ x: 0, y: 0 }, { x: config.ai.trapMaxBallSpeed + 5, y: 0 }),
      lastKickerId: "A-FW",
    };
    const fullChanceConfig = loadConfig({ ai: { interceptChance: 1 } as GameConfig["ai"] });

    resolve([kicker, opponent], ball, { prevBallPos: { x: 0, y: 0 }, config: fullChanceConfig });
    expect(ball.status).toBe("Possessed");
    expect(ball.possessorId).toBe("B-DF");
    expect(ball.vel).toEqual({ x: 0, y: 0 });
  });

  it("does not let a team-mate of the kicker intercept a pass", () => {
    const kicker = playerAt("A-FW", "A", { x: -10, y: 0 });
    const teammate = playerAt("A-MF", "A", { x: 0, y: 0 }, "MF");
    const ball: Ball = {
      ...ballAt({ x: 0, y: 0 }, { x: config.ai.trapMaxBallSpeed + 5, y: 0 }),
      lastKickerId: "A-FW",
    };
    const fullChanceConfig = loadConfig({ ai: { interceptChance: 1 } as GameConfig["ai"] });

    resolve([kicker, teammate], ball, { prevBallPos: { x: 0, y: 0 }, config: fullChanceConfig });
    expect(ball.status).toBe("Free");
    expect(ball.possessorId).toBeNull();
  });

  it("does not intercept beyond interceptDistance even when interceptChance is 1", () => {
    const kicker = playerAt("A-FW", "A", { x: -10, y: 0 });
    const opponent = playerAt("B-DF", "B", { x: config.ai.interceptDistance + 0.01, y: 0 });
    const ball: Ball = {
      ...ballAt({ x: 0, y: 0 }, { x: config.ai.trapMaxBallSpeed + 5, y: 0 }),
      lastKickerId: "A-FW",
    };
    const fullChanceConfig = loadConfig({ ai: { interceptChance: 1 } as GameConfig["ai"] });

    resolve([kicker, opponent], ball, { prevBallPos: { x: 0, y: 0 }, config: fullChanceConfig });
    expect(ball.status).toBe("Free");
  });

  it("never intercepts at the very edge of interceptDistance (proximity is 0)", () => {
    const kicker = playerAt("A-FW", "A", { x: -10, y: 0 });
    const opponent = playerAt("B-DF", "B", { x: config.ai.interceptDistance, y: 0 });
    const ball: Ball = {
      ...ballAt({ x: 0, y: 0 }, { x: config.ai.trapMaxBallSpeed + 5, y: 0 }),
      lastKickerId: "A-FW",
    };
    const fullChanceConfig = loadConfig({ ai: { interceptChance: 1 } as GameConfig["ai"] });

    resolve([kicker, opponent], ball, { prevBallPos: { x: 0, y: 0 }, config: fullChanceConfig });
    expect(ball.status).toBe("Free");
  });

  it("is stable when called repeatedly with the same standoff", () => {
    const holder = playerAt("A-FW", "A", { x: 0, y: 0 });
    const thief = playerAt("B-DF", "B", { x: 0.5, y: 0 });
    const ball: Ball = { ...ballAt({ x: 0, y: 0 }), status: "Possessed", possessorId: "A-FW" };

    // 保持者が入れ替わり続ける（毎ターン奪い合う）のは許容だが、状態は壊れないこと。
    for (let i = 0; i < 50; i++) resolve([holder, thief], ball);
    expect(ball.status).toBe("Possessed");
    expect(["A-FW", "B-DF"]).toContain(ball.possessorId);
  });
});

describe("resolvePlayerPlayer", () => {
  it("does nothing: players pass through each other in step 1", () => {
    const a = playerAt("A-FW", "A", { x: 0, y: 0 });
    const b = playerAt("B-DF", "B", { x: 0, y: 0 });
    a.vel = { x: 1, y: 1 };

    resolvePlayerPlayer(a, b, config);

    expect(a.pos).toEqual({ x: 0, y: 0 });
    expect(b.pos).toEqual({ x: 0, y: 0 });
    expect(a.vel).toEqual({ x: 1, y: 1 });
  });
});
