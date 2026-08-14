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

    // 高いshootPower/mentalに上書きしてシュート成立を確実にする
    shooter.params = { ...shooter.params, shootPower: 1, mental: 1 };
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
    state.ball.possessionTurns = 999;

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
    state.ball.possessionTurns = 999;

    config.ai.shootProbability = 0;

    decideAction(passer, state, config);

    expect(passer.state).toBe("Passing");
    expect(state.ball.lastKickerId).toBe(passer.id);
  });

  it("prefers an onside teammate over an offside one (方式E: 統一スコアリング)", () => {
    const config = loadConfig();
    config.ai.offside.avoidanceEnabled = true; // デフォルトは無効化しているため個別テストで有効化する
    config.ai.shootProbability = 0;
    // ドリブル継続を選ばせず必ずパスさせる（確率0を保証するため偏差項も0にする）。
    config.ai.dribbleChanceBase = 0;
    config.ai.dribbleChanceMentalSpread = 0;
    config.ai.dribbleChanceVisionSpread = 0;
    const state = createInitialState(config);
    const passer = state.teams.A.players.find((p) => p.role === "MF")!;
    const onsideReceiver = state.teams.A.players.find((p) => p.role === "DF")!;
    const offsideReceiver = state.teams.A.players.find((p) => p.role === "FW")!;

    passer.pos = { x: 0, y: 0 };
    // 相手最終ライン(y=5付近)より手前/前にそれぞれ候補を置く。両方ともパス射程内。
    onsideReceiver.pos = { x: 0, y: 4 };
    offsideReceiver.pos = { x: 0, y: 10 };
    for (const o of state.teams.B.players) o.pos = { x: 20, y: 5 };
    state.ball.pos = { ...passer.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = passer.id;
    state.ball.possessionTurns = 999;

    decideAction(passer, state, config);

    // オフサイド候補は前進度の報酬より超過ペナルティが上回るため、オンサイドの候補が選ばれる
    // （= フラグが立たない）。marked/distToGoal だけの旧式スコアでは反映されなかった判断。
    expect(passer.state).toBe("Passing");
    expect(state.ball.offsideOffenderId).toBeNull();
  });

  it("still passes to the sole candidate even when it is offside (ソフトペナルティであり完全排除ではない)", () => {
    const config = loadConfig();
    config.ai.offside.avoidanceEnabled = true; // デフォルトは無効化しているため個別テストで有効化する
    config.ai.shootProbability = 0;
    // ドリブル継続を選ばせず必ずパスさせる（確率0を保証するため偏差項も0にする）。
    config.ai.dribbleChanceBase = 0;
    config.ai.dribbleChanceMentalSpread = 0;
    config.ai.dribbleChanceVisionSpread = 0;
    const state = createInitialState(config);
    const passer = state.teams.A.players.find((p) => p.role === "MF")!;
    const offsideReceiver = state.teams.A.players.find((p) => p.role === "FW")!;

    passer.pos = { x: 0, y: 0 };
    // 他の味方はパス圏外へ飛ばし、唯一の候補をオフサイドポジションに置く。
    for (const p of state.teams.A.players) {
      if (p.id !== passer.id && p.id !== offsideReceiver.id) p.pos = { x: 1000, y: 1000 };
    }
    for (const o of state.teams.B.players) o.pos = { x: 20, y: 5 };
    offsideReceiver.pos = { x: 3, y: 10 };
    state.ball.pos = { ...passer.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = passer.id;
    state.ball.possessionTurns = 999;

    decideAction(passer, state, config);

    // 他に選択肢がなければ、スコアが低くても唯一の候補へパスする（ハード除外ではない）。
    expect(passer.state).toBe("Passing");
    expect(state.ball.offsideOffenderId).toBe(offsideReceiver.id);
  });

  it("does not flag ball.offsideOffenderId when the receiver is onside", () => {
    const config = loadConfig({ random: { seed: 1 } });
    config.ai.offside.avoidanceEnabled = true; // デフォルトは無効化しているため個別テストで有効化する
    const state = createInitialState(config);
    const passer = state.teams.A.players.find((p) => p.role === "MF")!;
    const receiver = state.teams.A.players.find((p) => p.role === "FW")!;

    passer.pos = { x: 0, y: 0 };
    receiver.pos = { x: 3, y: 5 };
    state.ball.pos = { ...passer.pos };
    state.ball.status = "Possessed";
    state.ball.possessorId = passer.id;
    state.ball.possessionTurns = 999;

    config.ai.shootProbability = 0;

    decideAction(passer, state, config);

    expect(passer.state).toBe("Passing");
    expect(state.ball.offsideOffenderId).toBeNull();
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

  it("dribbles slower when isolated (no teammate ahead) than when a teammate offers forward support", () => {
    const config = loadConfig({ random: { seed: 1 } });

    function carrierSpeed(teammateAheadY: number) {
      const state = createInitialState(config);
      const carrier = state.teams.A.players.find((p) => p.role === "DF")!;
      carrier.pos = { x: 0, y: -config.pitch.length / 2 + 5 };
      // 他の味方は視野・パス圏外に飛ばしつつ、y座標だけ「前方かどうか」を制御する。
      for (const p of state.teams.A.players) {
        if (p.id !== carrier.id) p.pos = { x: 1000, y: teammateAheadY };
      }
      state.ball.pos = { ...carrier.pos };
      state.ball.status = "Possessed";
      state.ball.possessorId = carrier.id;
      config.ai.shootProbability = 0;

      decideAction(carrier, state, config);
      return Math.hypot(carrier.vel.x, carrier.vel.y);
    }

    // 味方が自分よりさらに後方（isolated）な場合と、十分前方（support あり）な場合を比較する。
    const isolatedSpeed = carrierSpeed(-config.pitch.length / 2);
    const supportedSpeed = carrierSpeed(config.pitch.length / 2);

    expect(isolatedSpeed).toBeLessThan(supportedSpeed);
  });

  it("dribbles slower than a non-possessing player when passAccuracy is low", () => {
    const config = loadConfig({ random: { seed: 1 } });

    function carrierSpeed(passAccuracy: number) {
      const state = createInitialState(config);
      const carrier = state.teams.A.players.find((p) => p.role === "DF")!;
      for (const p of state.teams.A.players) {
        if (p.id !== carrier.id) p.pos = { x: 1000, y: 1000 };
      }
      carrier.params = { ...carrier.params, passAccuracy };
      carrier.pos = { x: 0, y: -config.pitch.length / 2 + 5 };
      state.ball.pos = { ...carrier.pos };
      state.ball.status = "Possessed";
      state.ball.possessorId = carrier.id;
      config.ai.shootProbability = 0;

      decideAction(carrier, state, config);
      return Math.hypot(carrier.vel.x, carrier.vel.y);
    }

    const lowAccuracySpeed = carrierSpeed(0);
    const highAccuracySpeed = carrierSpeed(1);

    expect(lowAccuracySpeed).toBeLessThan(highAccuracySpeed);
    const carrierBaseSpeed = config.team.roleParams.DF.speed;
    expect(highAccuracySpeed).toBeCloseTo(Math.min(carrierBaseSpeed, config.player.maxSpeed), 5); // passAccuracy=1は減速なし
  });
});

describe("decideAction: stun", () => {
  it("stays put and counts down while stunned, regardless of ball state", () => {
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const player = state.teams.A.players.find((p) => p.role === "DF")!;
    player.stunTurns = 2;
    player.vel = { x: 3, y: 3 };

    decideAction(player, state, config);

    expect(player.stunTurns).toBe(1);
    expect(player.vel).toEqual({ x: 0, y: 0 });
    expect(player.state).toBe("Idle");
  });

  it("resumes normal decision-making once the stun expires", () => {
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const defender = state.teams.A.players.find((p) => p.role === "DF")!;
    const opponent = state.teams.B.players.find((p) => p.role === "FW")!;
    state.ball.status = "Possessed";
    state.ball.possessorId = opponent.id;
    defender.stunTurns = 1;

    decideAction(defender, state, config);
    expect(defender.stunTurns).toBe(0);
    expect(defender.vel).toEqual({ x: 0, y: 0 });

    decideAction(defender, state, config);
    expect(defender.state).toBe("Marking");
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
    // 横サポート（lateralSupportChanceBase/VisionSpread）は前進しない別分岐なので、この
    // テストの対象（前進した受け手ポジションへ向かうこと）を検証するために無効化する。
    const config = loadConfig({ random: { seed: 1 } });
    config.ai.positioning.lateralSupportChanceBase = 0;
    config.ai.positioning.lateralSupportVisionSpread = 0;
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
    // バックサポート/横サポート分岐に入ると受け手ポジション側のマーカー回避ロジックを
    // 通らなくなるため、このテストの対象（前進した受け手ポジションのマーカー回避）を
    // 検証するために両方無効化する。
    const config = loadConfig({ random: { seed: 1 } });
    config.ai.positioning.backSupportChanceBase = 0;
    config.ai.positioning.lateralSupportChanceBase = 0;
    config.ai.positioning.lateralSupportVisionSpread = 0;

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

  it("caps the receiving-position forward reach by remaining distance to goal (positioning redesign method A)", () => {
    const config = loadConfig({ random: { seed: 1 } });
    config.ai.offside.avoidanceEnabled = true; // デフォルトは無効化しているため個別テストで有効化する
    // マイルストーンN-2: Support/BackSupport/LateralSupportの選択はintentとして
    // 複数ターン固定される。ここではSupport（forwardReachFractionが効く経路）だけを
    // 検証したいので、他2種別が選ばれないよう確率を0にする。
    config.ai.positioning.backSupportChanceBase = 0;
    config.ai.positioning.backSupportMentalSpread = 0;
    config.ai.positioning.lateralSupportChanceBase = 0;
    config.ai.positioning.lateralSupportVisionSpread = 0;

    function settledSupporterY(forwardReachFraction: number): number {
      config.ai.offside.forwardReachFraction = forwardReachFraction;
      const state = createInitialState(config);
      const supporter = state.teams.A.players.find((p) => p.role === "MF")!;
      const carrier = state.teams.A.players.find((p) => p.role === "FW")!;
      // 敵はオフサイドラインの引き戻し（offsideLineY）が効かないよう遠くへ飛ばす。
      for (const o of state.teams.B.players) o.pos = { x: 1000, y: 1000 };

      // ボールをゴールまで残り5mの地点に固定する。
      const ballY = config.pitch.length / 2 - 5;
      state.ball.pos = { x: 0, y: ballY };
      state.ball.status = "Possessed";
      state.ball.possessorId = carrier.id;
      supporter.pos = { x: 0, y: 0 };

      for (let i = 0; i < 200; i++) {
        decideAction(supporter, state, config);
        stepPlayer(supporter, config);
      }
      return supporter.pos.y;
    }

    const cappedY = settledSupporterY(0.1); // 残り5m * 0.1 = 0.5mしか前進を許さない
    const uncappedY = settledSupporterY(1.0); // 残り5m * 1.0 = passDistance*0.6の方が効く（無効化に近い）

    // キャップが強いほど、支援ポジションはボールに近い（あまり前進しない）位置に留まるはず。
    expect(cappedY).toBeLessThan(uncappedY);
  });

  it("shortens the safe forward distance when a defender guards the receiving spot (positioning redesign method C)", () => {
    const config = loadConfig({ random: { seed: 1 } });
    config.ai.offside.avoidanceEnabled = true; // デフォルトは無効化しているため個別テストで有効化する
    config.ai.positioning.markerAvoidRangeFactor = 0; // マーカー回避を無効化し、方式Cの効果だけを見る
    config.ai.offside.forwardReachFraction = 1; // 方式Aの上限が効かないようにする
    // マイルストーンN-2: Support/BackSupport/LateralSupportの選択はintentとして
    // 複数ターン固定される。ここではSupport（方式Cの到達時間比較が効く経路）だけを
    // 検証したいので、他2種別が選ばれないよう確率を0にする。
    config.ai.positioning.backSupportChanceBase = 0;
    config.ai.positioning.backSupportMentalSpread = 0;
    config.ai.positioning.lateralSupportChanceBase = 0;
    config.ai.positioning.lateralSupportVisionSpread = 0;

    function settledSupporterY(defenderPos: { x: number; y: number }): number {
      const state = createInitialState(config);
      const supporter = state.teams.A.players.find((p) => p.role === "MF")!;
      const carrier = state.teams.A.players.find((p) => p.role === "FW")!;
      for (const o of state.teams.B.players) o.pos = { x: 1000, y: 1000 };
      state.teams.B.players[0].pos = defenderPos;

      state.ball.pos = { x: 0, y: 0 };
      state.ball.status = "Possessed";
      state.ball.possessorId = carrier.id;
      supporter.pos = { x: 0, y: -10 };

      for (let i = 0; i < 200; i++) {
        decideAction(supporter, state, config);
        stepPlayer(supporter, config);
      }
      return supporter.pos.y;
    }

    const receivingDistance = config.ai.passDistance * config.ai.positioning.receivingDistanceFactor;
    // 相手DFが受け手候補地点そのものを固めている場合と、遠くにいて無関係な場合を比較する。
    const guardedY = settledSupporterY({ x: 0, y: receivingDistance });
    const undefendedY = settledSupporterY({ x: 1000, y: 1000 });

    expect(guardedY).toBeLessThan(undefendedY);
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

  it("keeps ChaseLooseBall intent once committed even if another teammate briefly becomes nearer", () => {
    // マイルストーンN-1の回帰テスト: 最寄り判定を毎ターン素で振り直すと、拮抗した2人の
    // 間で「追う選手」がターンごとに入れ替わりうる（フラフラの一因）。intent化により、
    // 一度 ChaseLooseBall にコミットした選手は、ボールに追いつくか
    // chaseLooseBallMaxDurationTurns を超えるまで役割を保持し続けるべき。
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const chaser = state.teams.A.players.find((p) => p.role === "FW")!;
    const rival = state.teams.A.players.find((p) => p.role === "MF")!;

    state.ball.pos = { x: chaser.pos.x + 1, y: chaser.pos.y };
    state.ball.status = "Free";
    state.ball.possessorId = null;

    decideAction(chaser, state, config);
    expect(chaser.intent.type).toBe("ChaseLooseBall");

    // 次のターン、ライバルの方がボールにわずかに近くなっても、コミット済みのchaserは
    // 引き続きChaseLooseBallのままであるべき（ボールへ追いつく/期限切れまで）。
    rival.pos = { x: state.ball.pos.x + 0.01, y: state.ball.pos.y };
    state.turn += 1;

    decideAction(chaser, state, config);
    expect(chaser.intent.type).toBe("ChaseLooseBall");
    expect(chaser.state).toBe("BallTracking");
  });

  it("keeps a chosen Support/BackSupport/LateralSupport intent until supportMaxDurationTurns even if the choice would change", () => {
    // マイルストーンN-2の回帰テスト: 意図の「種別」だけを固定し、目標地点は毎ターン
    // 再計算する設計（specification/features_intent_state_machine.md）。ここでは種別が
    // supportMaxDurationTurns経過まで保持されることを確認する。
    const config = loadConfig({ random: { seed: 1 } });
    const state = createInitialState(config);
    const supporter = state.teams.A.players.find((p) => p.role === "MF")!;
    const carrier = state.teams.A.players.find((p) => p.role === "FW")!;

    state.ball.pos = { x: 0, y: 0 };
    state.ball.status = "Possessed";
    state.ball.possessorId = carrier.id;
    supporter.pos = { x: 5, y: -5 };

    // 最初の選択でBackSupportを確実に選ばせる。
    config.ai.positioning.backSupportChanceBase = 1;
    decideAction(supporter, state, config);
    expect(supporter.intent.type).toBe("BackSupport");

    // 以後は確率を0に変えても、supportMaxDurationTurns経過前は同じ意図を保持するはず。
    config.ai.positioning.backSupportChanceBase = 0;
    for (let i = 0; i < config.ai.intent.supportMaxDurationTurns - 1; i++) {
      state.turn += 1;
      decideAction(supporter, state, config);
      expect(supporter.intent.type).toBe("BackSupport");
    }

    // supportMaxDurationTurns経過後は再判断され、確率0のBackSupportはもう選ばれない。
    state.turn += 1;
    decideAction(supporter, state, config);
    expect(supporter.intent.type).not.toBe("BackSupport");
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

  it("presses harder toward the opponent ball carrier when mental is higher", () => {
    const config = loadConfig({ random: { seed: 1 } });

    function markingTargetDistanceAfterStep(mental: number): number {
      const state = createInitialState(config);
      const defender = state.teams.A.players.find((p) => p.role === "DF")!;
      const opponent = state.teams.B.players.find((p) => p.role === "FW")!;
      // defender 自身が最終ライン（自ゴールに最も近い選手）だと lastManPressSuppression が
      // 効いてプレス力そのものが潰れ、mental の差を見るこのテストの意図と衝突する。
      // 味方1人を defender よりさらに自ゴール寄りに置き、最終ライン判定から外す。
      let placedDeeper = false;
      for (const p of state.teams.A.players) {
        if (p.id === defender.id) continue;
        p.pos = placedDeeper ? { x: 1000, y: 1000 } : { x: -5, y: -30 };
        placedDeeper = true;
      }

      defender.params = { ...defender.params, mental };
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

    // mental が高いほど、詰め寄る力が強く敵に近づくはず。
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
