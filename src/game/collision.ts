import type { Player, Ball, GameConfig } from "../types";
import { distance, length } from "./utils";

/**
 * 選手がボールを蹴れる距離にいるか（features_2 §4.1）。
 *
 * 選手AI が「蹴る」と決めたとき、実際にキックが成立するかの前提条件として使う。
 * トラップ距離（§4.2）より狭い。
 */
export function canKick(player: Player, ball: Ball, config: GameConfig): boolean {
  if (ball.status === "OutOfBounds") return false;
  return distance(player.pos, ball.pos) <= config.ai.ballControlDistance;
}

/**
 * 選手1人とボールの関係を解決する。戻り値は「解決後にこの選手がボールを保持しているか」。
 *
 * ここで扱うのは次の2つだけ:
 *   - 自分が保持中 … ボールを自分に追従させる（features_2 §3.5）
 *   - フリーボール … トラップ距離内かつボールが十分遅ければ保持する（§4.2）
 *
 * **他選手からの奪取はここでは扱わない。** 味方から奪ってはいけないので保持者の
 * チームを知る必要があるが、Ball は possessorId しか持たないため単独では判定できない。
 * 奪取と「複数選手が範囲内なら最も近い選手が保持」（§4.1）は resolveBallPossession が担当する。
 */
export function resolvePlayerBall(player: Player, ball: Ball, config: GameConfig): boolean {
  if (ball.status === "OutOfBounds") return false;

  // 保持中: ボールは選手に追従する。
  if (ball.possessorId === player.id) {
    ball.pos = { ...player.pos };
    ball.vel = { ...player.vel };
    return true;
  }

  // 他の選手が保持している場合はここでは何もしない（奪取は resolveBallPossession）。
  if (ball.status === "Possessed") return false;

  // フリーボールのトラップ。速すぎるボールは収められない。
  const inRange = distance(player.pos, ball.pos) <= config.ai.trapDistance;
  const slowEnough = length(ball.vel) <= config.ai.trapMaxBallSpeed;
  if (!inRange || !slowEnough) return false;

  ball.status = "Possessed";
  ball.possessorId = player.id;
  ball.pos = { ...player.pos };
  ball.vel = { ...player.vel };
  return true;
}

/**
 * 全選手を見てボールの保持者を決める。毎ターン1回、選手の移動後に呼ぶ。
 *
 *   - 保持者がいる場合 … 相手チームの選手が奪取距離内にいれば奪う（features_2 §4.3）。
 *     複数いれば最も近い選手。奪取時はボール速度を0にし、lastKickerId は変えない
 *     （蹴っていないため）。奪われなければ保持者に追従させる。
 *   - フリーボールの場合 … トラップできる選手のうち最も近い1人が保持する（§4.1）。
 *
 * 保持者が players に含まれていない想定外の状態では、フリーボールに戻して復帰させる。
 */
export function resolveBallPossession(players: Player[], ball: Ball, config: GameConfig): void {
  if (ball.status === "OutOfBounds") return;

  const possessor =
    ball.possessorId === null ? undefined : players.find((p) => p.id === ball.possessorId);

  if (possessor === undefined && ball.status === "Possessed") {
    ball.status = "Free";
    ball.possessorId = null;
  }

  if (possessor !== undefined) {
    const stealer = nearestPlayer(
      players.filter(
        (p) => p.team !== possessor.team && distance(p.pos, ball.pos) <= config.ai.tackleDistance
      ),
      ball
    );

    if (stealer === undefined) {
      resolvePlayerBall(possessor, ball, config);
      return;
    }

    // 奪取: 保持者を差し替える。速度は一度0にし、新しい保持者が操作を始める（§4.3）。
    ball.possessorId = stealer.id;
    ball.pos = { ...stealer.pos };
    ball.vel = { x: 0, y: 0 };
    return;
  }

  // フリーボール: トラップ条件を満たす選手のうち最も近い1人が収める。
  if (length(ball.vel) > config.ai.trapMaxBallSpeed) return;

  const trapper = nearestPlayer(
    players.filter((p) => distance(p.pos, ball.pos) <= config.ai.trapDistance),
    ball
  );
  if (trapper === undefined) return;

  resolvePlayerBall(trapper, ball, config);
}

function nearestPlayer(candidates: Player[], ball: Ball): Player | undefined {
  let nearest: Player | undefined;
  let nearestDistance = Infinity;
  for (const p of candidates) {
    const d = distance(p.pos, ball.pos);
    if (d < nearestDistance) {
      nearest = p;
      nearestDistance = d;
    }
  }
  return nearest;
}

/**
 * 選手同士の衝突（features_2 §4.4）。
 *
 * **第一ステップでは意図的に何もしない。** 3対3の小規模では選手が重なることを
 * 許容したほうが AI の移動判定が単純になるため、仕様で「衝突判定なし・通り抜け」と
 * 決めている。第二ステップで速度低下や押し出しを入れる余地としてこの関数を残す。
 */
export function resolvePlayerPlayer(_a: Player, _b: Player, _config: GameConfig): void {
  // 意図的に no-op。
}
