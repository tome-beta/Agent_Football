import { describe, it, expect } from "vitest";
import { createInitialState } from "../../src/game/match";
import { decideAction, stepPlayer } from "../../src/game/player";
import { loadConfig } from "../../src/simulation/config";
import type { GameState } from "../../src/types";

function stateWithSeed(seed: number): GameState {
  const config = loadConfig({ random: { seed } });
  const state = createInitialState(config);
  return state;
}

describe("decideAction: possession", () => {
  it("shoots when close to goal and the shot roll succeeds", () => {
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const shooter = state.teams.A.players.find((p) => p.role === "FW")!;
    shooter.pos = { x: 0, y: config.pitch.length / 2 - 1 };
    state.ball.pos = { ...shooter.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = shooter.id;

    // 高いshootPower/aggressivenessに上書きしてシュート成立を確実にする
    shooter.params = { ...shooter.params, shootPower: 1, aggressiveness: 1 };
    config.ai.shootProbability = 1;

    decideAction(shooter, state, config);

    expect(shooter.state).toBe("Shooting");
    expect(state.ball.status).toBe("Free");
    expect(state.ball.possessorId).toBeNull();
    expect(state.ball.lastKickerId).toBe(shooter.id);
    // ゴール(+y方向)へ向けて蹴られている
    expect(state.ball.vel.y).toBeGreaterThan(0);
  });

  it("passes to a visible teammate when no shot is taken", () => {
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const passer = state.teams.A.players.find((p) => p.role === "MF")!;
    const receiver = state.teams.A.players.find((p) => p.role === "FW")!;

    passer.pos = { x: 0, y: 0 };
    receiver.pos = { x: 3, y: 5 };
    state.ball.pos = { ...passer.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = passer.id;

    config.ai.shootProbability = 0; // シュートさせない

    decideAction(passer, state, config);

    expect(passer.state).toBe("Passing");
    expect(state.ball.status).toBe("Free");
    expect(state.ball.lastKickerId).toBe(passer.id);
  });

  it("passes to a teammate beside/behind the carrier, not just ones straight ahead", () => {
    // 回帰テスト: パス判定は視野角(移動方向基準)で絞り込まず、距離だけで判定する。
    // ドリブル中は前方を向く(facingDirection=vel)ため、視野角チェックが残っていると
    // フォーメーション上よくある「横や後ろの味方」が常にパス候補から漏れてしまっていた。
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const passer = state.teams.A.players.find((p) => p.role === "MF")!;
    const receiver = state.teams.A.players.find((p) => p.role === "FW")!;

    passer.pos = { x: 0, y: 0 };
    passer.vel = { x: 0, y: 6 }; // +y(ゴール方向)へ直進中 = 真横の受け手は旧ロジックだと視野外
    receiver.pos = { x: 8, y: 1 }; // ほぼ真横（距離的にはパス圏内）
    state.ball.pos = { ...passer.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = passer.id;

    config.ai.shootProbability = 0;

    decideAction(passer, state, config);

    expect(passer.state).toBe("Passing");
    expect(state.ball.lastKickerId).toBe(passer.id);
  });

  it("dribbles toward the goal when no pass target or shot is available", () => {
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const carrier = state.teams.A.players.find((p) => p.role === "DF")!;
    // 他の味方を視野・パス圏外に飛ばす
    for (const p of state.teams.A.players) {
      if (p.id !== carrier.id) p.pos = { x: 1000, y: 1000 };
    }
    carrier.pos = { x: 0, y: -config.pitch.length / 2 + 5 };
    state.ball.pos = { ...carrier.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = carrier.id;
    config.ai.shootProbability = 0;

    decideAction(carrier, state, config);

    expect(carrier.state).toBe("Possession");
    expect(state.ball.status).toBe("Possessed");
    // ゴール(+y)方向へ向いている
    expect(carrier.vel.y).toBeGreaterThan(0);
  });
});

describe("decideAction: non-possessor", () => {
  it("marks the nearest opponent when the opponent team has the ball", () => {
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const defender = state.teams.A.players.find((p) => p.role === "DF")!;
    const opponent = state.teams.B.players.find((p) => p.role === "FW")!;
    opponent.pos = { x: 3, y: 3 };
    state.ball.pos = { ...opponent.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = opponent.id;

    decideAction(defender, state, config);

    expect(defender.state).toBe("Marking");
  });

  it("marks close enough to actually be able to tackle (within tackleDistance once reached)", () => {
    // 回帰テスト: マーク目標がタックル距離より遠いと、defender がそこへ到達しても
    // resolveBallPossession の奪取判定に絶対届かず、守備が機能しなくなる。
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const defender = state.teams.A.players.find((p) => p.role === "DF")!;
    const opponent = state.teams.B.players.find((p) => p.role === "FW")!;
    // 自ゴールから十分離れた位置に置き、goal-side オフセットが最大値に張り付くようにする。
    opponent.pos = { x: 0, y: 0 };
    state.ball.pos = { ...opponent.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = opponent.id;
    defender.pos = { ...opponent.pos };

    decideAction(defender, state, config);
    stepPlayer(defender, config);

    const distToOpponent = Math.hypot(defender.pos.x - opponent.pos.x, defender.pos.y - opponent.pos.y);
    expect(distToOpponent).toBeLessThanOrEqual(config.ai.tackleDistance);
  });

  it("moves to space when a teammate has the ball", () => {
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const supporter = state.teams.A.players.find((p) => p.role === "MF")!;
    const carrier = state.teams.A.players.find((p) => p.role === "FW")!;
    state.ball.pos = { ...carrier.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = carrier.id;

    decideAction(supporter, state, config);

    expect(supporter.state).toBe("MovingToSpace");
  });

  it("makes a forward run toward the attacking goal while supporting, not just drifting toward the ball", () => {
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const supporter = state.teams.A.players.find((p) => p.role === "MF")!;
    const carrier = state.teams.A.players.find((p) => p.role === "FW")!;
    // ボールをホームポジションのすぐ近くに置く。もし旧ロジック(ボール方向にしか寄らない)なら
    // 目標地点はほぼホームポジションのままで前進しないはず。
    state.ball.pos = { ...supporter.homePos };
    state.ball.status = "Possessed";
    state.ball.possessorId = carrier.id;

    decideAction(supporter, state, config);

    // チームAの攻撃方向は+y。ゴール方向への前進成分があるはず。
    expect(supporter.vel.y).toBeGreaterThan(0);
  });

  it("steers the receiving spot away from a marker sitting right on it, but ignores a distant one", () => {
    const config = loadConfig({ random: { seed: 1 } });

    function supporterVel(markerPos: { x: number; y: number }) {
      const state = createInitialState(config);
      const supporter = state.teams.A.players.find((p) => p.role === "MF")!;
      const carrier = state.teams.A.players.find((p) => p.role === "FW")!;
      state.ball.pos = { x: 0, y: 0 };
      state.ball.status = "Possessed";
      state.ball.possessorId = carrier.id;
      supporter.pos = { x: -20, y: -20 };
      // 敵は全員遠ざけたうえで、1人だけ狙った位置に置く。
      for (const o of state.teams.B.players) o.pos = { x: 1000, y: 1000 };
      state.teams.B.players[0].pos = markerPos;

      decideAction(supporter, state, config);
      return { ...supporter.vel };
    }

    const receivingDistance = config.ai.passDistance * 0.6;
    // 候補地点のすぐ近く（真上だと引く方向が定まらないので少しずらす）に置く。
    const onTargetSpot = supporterVel({ x: 0.5, y: receivingDistance });
    const farAway = supporterVel({ x: 1000, y: 1000 });

    // 受け手候補地点の真上にいる敵は回避対象になり、狙いが変わるはず。
    expect(onTargetSpot).not.toEqual(farAway);
  });

  it("tracks a free ball only if nearest, otherwise moves toward a supportive position (not literal home)", () => {
    // 回帰テスト: 以前は非最寄りの選手が formationPos ぴったりへ戻っていた。
    // パス/シュート後にボールが誰にも保持されていない時間は長く続くため、その都度
    // 定位置へ引き戻されると「受けるための動き」が起きる前に消えてしまう。
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const near = state.teams.A.players.find((p) => p.role === "FW")!;
    const far = state.teams.A.players.find((p) => p.role === "DF")!;
    state.ball.pos = { x: near.pos.x + 1, y: near.pos.y };
    state.ball.status = "Free";
    state.ball.possessorId = null;

    decideAction(near, state, config);
    decideAction(far, state, config);

    expect(near.state).toBe("BallTracking");
    expect(far.state).toBe("MovingToSpace");
    // チームAの攻撃方向は+y。定位置のままなら vel はほぼ0のはず。
    expect(far.vel.y).toBeGreaterThan(0);
  });
});

describe("decideAction: positioning force composition (milestone H)", () => {
  it("repels a defender away from a teammate standing right on top of them", () => {
    // teammateRepulsion: minSpacing 未満に味方がいると離れる方向の力が働く。
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const defender = state.teams.A.players.find((p) => p.role === "DF")!;
    const crowder = state.teams.A.players.find((p) => p.role === "MF")!;
    const opponent = state.teams.B.players.find((p) => p.role === "FW")!;

    defender.pos = { x: 0, y: -30 };
    crowder.pos = { x: 0.5, y: -30 }; // minSpacing(6m) よりずっと近い
    opponent.pos = { x: 0, y: 1000 }; // 自ゴールの正面(x=0)の延長線上遠くに置き、x方向の力を反発だけにする
    state.ball.pos = { ...opponent.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = opponent.id;

    decideAction(defender, state, config);

    // crowder は defender の +x 側にいるので、反発力は -x 方向に働くはず。
    expect(defender.vel.x).toBeLessThan(0);
  });

  it("presses harder toward the opponent ball carrier when aggressiveness is higher", () => {
    const config = loadConfig({ random: { seed: 1 } });

    function markingTargetDistanceAfterStep(aggressiveness: number): number {
      const state = createInitialState(config);
      const defender = state.teams.A.players.find((p) => p.role === "DF")!;
      const opponent = state.teams.B.players.find((p) => p.role === "FW")!;
      for (const p of state.teams.A.players) if (p.id !== defender.id) p.pos = { x: 1000, y: 1000 };

      defender.params = { ...defender.params, aggressiveness };
      defender.pos = { x: 5, y: -10 };
      opponent.pos = { x: 5, y: -5 };
      state.ball.pos = { ...opponent.pos };
      state.ball.status = "Possessed";
      state.ball.possessorId = opponent.id;

      decideAction(defender, state, config);
      stepPlayer(defender, config);
      return Math.hypot(defender.pos.x - opponent.pos.x, defender.pos.y - opponent.pos.y);
    }

    const lowPress = markingTargetDistanceAfterStep(0.1);
    const highPress = markingTargetDistanceAfterStep(1.0);

    // aggressiveness が高いほど、詰め寄る力が強く敵に近づくはず。
    expect(highPress).toBeLessThan(lowPress);
  });

  it("keeps a marker anchored on the ball-ownGoal line rather than drifting off it", () => {
    // coverBias: ボールが自ゴールの正面(x=0)にある限り、マーカーの目標もx=0付近に留まる。
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const defender = state.teams.A.players.find((p) => p.role === "DF")!;
    const opponent = state.teams.B.players.find((p) => p.role === "FW")!;
    for (const p of state.teams.A.players) if (p.id !== defender.id) p.pos = { x: 1000, y: 1000 };

    defender.pos = { x: 15, y: -10 }; // ゴール正面の線から大きく外れた位置からスタート
    opponent.pos = { x: 0, y: -5 };
    state.ball.pos = { ...opponent.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = opponent.id;

    decideAction(defender, state, config);

    // ボール-自ゴール線(x=0)へ寄る力が働くので、x方向の速度は負(=0へ近づく方向)のはず。
    expect(defender.vel.x).toBeLessThan(0);
  });
});

describe("stepPlayer", () => {
  it("moves the player by vel * dt and mutates in place", () => {
    const config = loadConfig();
    const state = stateWithSeed(1);
    const player = state.teams.A.players[0];
    player.pos = { x: 0, y: 0 };
    player.vel = { x: 3, y: 4 };

    stepPlayer(player, config);

    expect(player.pos.x).toBeCloseTo(3 * config.physics.dt);
    expect(player.pos.y).toBeCloseTo(4 * config.physics.dt);
  });

  it("clamps the player position to stay inside the pitch", () => {
    const config = loadConfig();
    const state = stateWithSeed(1);
    const player = state.teams.A.players[0];
    player.pos = { x: config.pitch.width / 2 - 0.05, y: config.pitch.length / 2 - 0.05 };
    player.vel = { x: 100, y: 100 };

    stepPlayer(player, config);

    expect(player.pos.x).toBeCloseTo(config.pitch.width / 2);
    expect(player.pos.y).toBeCloseTo(config.pitch.length / 2);
  });
});
