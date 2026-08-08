import type { Ball, GameConfig, Vec2 } from "../types";
import { add, scale, length, normalize, clampMagnitude } from "./utils";

/** 中央・静止・フリー状態のボールを生成する。 */
export function createBall(): Ball {
  return {
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    status: "Free",
    possessorId: null,
    lastKickerId: null,
    offsideOffenderId: null,
    possessionTurns: 0,
  };
}

/**
 * ボールを1ターン分進める（features_2 §5.1 の処理順序）。
 *
 *   1. 位置更新 pos += vel * dt
 *   2. 摩擦     vel *= friction^dt   （friction は毎秒の保持率なので dt 乗する）
 *   3. 速度上限 |vel| <= maxSpeed
 *   4. 停止判定 |vel| < stopThreshold なら完全に停止させる
 *
 * 保持中（Possessed）は選手に追従するため、ここでは動かさない（追従は
 * collision.ts の resolvePlayerBall が担当する）。アウト中も再開処理待ちなので動かさない。
 */
export function stepBall(ball: Ball, config: GameConfig): void {
  if (ball.status !== "Free") return;

  const { dt } = config.physics;

  ball.pos = add(ball.pos, scale(ball.vel, dt));
  ball.vel = scale(ball.vel, Math.pow(config.ball.friction, dt));
  ball.vel = clampMagnitude(ball.vel, config.ball.maxSpeed);

  if (length(ball.vel) < config.ball.stopThreshold) {
    ball.vel = { x: 0, y: 0 };
  }
}

/**
 * 選手AIの指定した方向・強度をボール速度に変換する（features_2 §1.4）。
 *
 * `dir` は正規化して扱うので大きさは無視され、速さは `power` [m/s] が決める。
 * この関数自体は方向の誤差を乗せない（決定的）。誤差モデルは呼び出し側（選手AI、
 * `src/game/player.ts` の `applyAimError`）が `passAccuracy`/`shootPower` を使って
 * `dir` を事前に揺らしてから渡す形で実装している。
 *
 * キックするとボールは保持から解放される。`lastKickerId` はここでのみ更新する
 * （奪取では更新しない）。
 *
 * `config` を受け取らないため速度上限はここでは掛けない。上限は次の `stepBall`
 * が適用する（features_2 §5.1 の 3）。`dir` が零ベクトルなら速度0でボールを手放す。
 */
export function kickBall(ball: Ball, dir: Vec2, power: number, kickerId: string): void {
  ball.vel = scale(normalize(dir), power);
  ball.status = "Free";
  ball.possessorId = null;
  ball.lastKickerId = kickerId;
  ball.possessionTurns = 0;
}
