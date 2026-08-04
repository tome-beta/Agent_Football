import { describe, it, expect } from "vitest";
import { isOffside, offsideLineY } from "../../src/game/offside";
import { createInitialState } from "../../src/game/match";
import { loadConfig } from "../../src/simulation/config";

describe("isOffside", () => {
  it("is onside when behind the defending team's last defender and the ball", () => {
    const config = loadConfig();
    const state = createInitialState(config);
    const defendingTeam = state.teams.B;
    for (const p of defendingTeam.players) p.pos = { x: 0, y: 10 }; // last defender advancement = 10

    const receiverPos = { x: 5, y: 5 }; // ボール(0)より前だが最終ライン(10)より後ろ
    expect(isOffside(receiverPos, "A", defendingTeam, { x: 0, y: 0 }, config)).toBe(false);
  });

  it("is offside when ahead of both the last defender and the ball", () => {
    const config = loadConfig();
    const state = createInitialState(config);
    const defendingTeam = state.teams.B;
    for (const p of defendingTeam.players) p.pos = { x: 0, y: 10 };

    const receiverPos = { x: 0, y: 12 };
    expect(isOffside(receiverPos, "A", defendingTeam, { x: 0, y: 0 }, config)).toBe(true);
  });

  it("uses the ball position as the line when it is more advanced than the last defender", () => {
    const config = loadConfig();
    const state = createInitialState(config);
    const defendingTeam = state.teams.B;
    for (const p of defendingTeam.players) p.pos = { x: 0, y: -5 }; // 最終ラインは深い

    const ballPosAtKick = { x: 0, y: 8 };
    const receiverPos = { x: 0, y: 9 }; // 最終ラインより前だがボールより前でもある
    expect(isOffside(receiverPos, "A", defendingTeam, ballPosAtKick, config)).toBe(true);
  });

  it("treats positions within the tolerance band as onside (boundary)", () => {
    const config = loadConfig();
    config.ai.offside.lineToleranceMeters = 0.5;
    const state = createInitialState(config);
    const defendingTeam = state.teams.B;
    for (const p of defendingTeam.players) p.pos = { x: 0, y: 10 };

    const receiverPos = { x: 0, y: 10.5 }; // ちょうど許容誤差の境界
    expect(isOffside(receiverPos, "A", defendingTeam, { x: 0, y: 0 }, config)).toBe(false);
  });

  it("flips the attacking direction correctly for team B", () => {
    const config = loadConfig();
    const state = createInitialState(config);
    const defendingTeam = state.teams.A;
    for (const p of defendingTeam.players) p.pos = { x: 0, y: -10 }; // Bの攻撃方向(-y)側の最終ライン

    const onsideReceiver = { x: 0, y: -5 };
    const offsideReceiver = { x: 0, y: -12 };
    expect(isOffside(onsideReceiver, "B", defendingTeam, { x: 0, y: 0 }, config)).toBe(false);
    expect(isOffside(offsideReceiver, "B", defendingTeam, { x: 0, y: 0 }, config)).toBe(true);
  });
});

describe("offsideLineY", () => {
  it("returns the defending team's most advanced player's y when the ball is deeper", () => {
    const config = loadConfig();
    const state = createInitialState(config);

    for (const p of state.teams.B.players) p.pos = { x: 0, y: 10 };
    expect(offsideLineY("A", state.teams.B, { x: 0, y: 0 }, config)).toBeCloseTo(10);

    for (const p of state.teams.A.players) p.pos = { x: 0, y: -10 };
    expect(offsideLineY("B", state.teams.A, { x: 0, y: 0 }, config)).toBeCloseTo(-10);
  });

  it("uses the ball's position when it is more advanced than the last defender", () => {
    const config = loadConfig();
    const state = createInitialState(config);

    for (const p of state.teams.B.players) p.pos = { x: 0, y: -5 };
    expect(offsideLineY("A", state.teams.B, { x: 0, y: 8 }, config)).toBeCloseTo(8);
  });
});
