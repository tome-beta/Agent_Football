import type { Player, Ball, GameConfig, Vec2 } from "../types";
import { distance, distanceToSegment, length } from "./utils";
import { chance } from "./random";
import type { RngHolder } from "./random";

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
    ball.possessionTurns += 1;
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
  ball.possessionTurns = 0;
  return true;
}

/**
 * 全選手を見てボールの保持者を決める。毎ターン1回、選手の移動後に呼ぶ。
 *
 *   - 保持者がいる場合 … 相手チームの選手が奪取距離内にいれば奪う（features_2 §4.3）。
 *     複数いれば最も近い選手。奪取時はボール速度を0にし、lastKickerId は変えない
 *     （蹴っていないため）。奪われなければ保持者に追従させる。
 *   - フリーボールで、直前のキッカーと別チームの選手が「このターンにボールが移動した
 *     軌跡（`prevBallPos`→`ball.pos`の線分）」から interceptDistance 以内にいる場合 …
 *     軌跡までの距離が近いほど高い確率でインターセプトする（`config.ai.interceptChance`
 *     を上限に、距離に応じて線形に減衰）。ボールの速度に関わらず判定するため、トラップ
 *     （下記）と違い trapMaxBallSpeed の速度制限を待たない。
 *     単純にボールの「現在位置」への点距離で判定すると、1ターンあたりのボール移動距離
 *     （dt×速度）に対して判定半径が大きくなった途端、軌跡上のほぼ全区間が捕捉範囲に
 *     入ってしまい奪取回数が急増する非線形な閾値現象が起きる（2026-08-01 balance-check
 *     で確認: interceptDistance 0.8→1.2 で20試合の奪取回数が324→2901に急増）。
 *     軌跡＝線分への距離で判定することでこの標本化の粗さに依存する問題を避ける。
 *   - フリーボールの場合 … トラップできる選手のうち最も近い1人が保持する（§4.1）。
 *
 * 保持者が players に含まれていない想定外の状態では、フリーボールに戻して復帰させる。
 *
 * @param prevBallPos このターンの `stepBall` 呼び出し前のボール位置（軌跡の始点）。
 * @param rng 確率判定用の乱数状態（`GameState` を渡せばよい。`rngSeed` を持つオブジェクトなら何でも可）。
 */
export function resolveBallPossession(
  players: Player[],
  ball: Ball,
  config: GameConfig,
  prevBallPos: Vec2,
  rng: RngHolder
): void {
  if (ball.status === "OutOfBounds") return;

  const possessor =
    ball.possessorId === null ? undefined : players.find((p) => p.id === ball.possessorId);

  if (possessor === undefined && ball.status === "Possessed") {
    ball.status = "Free";
    ball.possessorId = null;
  }

  if (possessor !== undefined) {
    // スタン中（直前のタックルの成否で怯んでいる）選手はタックルを試みない。除外しないと、
    // 隣接した2人が動けないままお互いのスタンを毎ターン上書き延長し続け、位置が一切変わらない
    // まま何十〜何百ターンも重なって静止するループに陥っていた（ユーザー指摘、2026-08-08）。
    const stealer = nearestPlayer(
      players.filter(
        (p) =>
          p.team !== possessor.team &&
          p.stunTurns <= 0 &&
          distance(p.pos, ball.pos) <= config.ai.tackleDistance
      ),
      ball
    );

    if (stealer === undefined) {
      resolvePlayerBall(possessor, ball, config);
      return;
    }

    // タックルは必ず成功するわけではない。守備者の technique が高いほど成功率が上がる
    // （役割分岐ではなくパラメータの違いがそのまま確率の差ににじみ出るようにする）。
    const tackleSuccessChance = Math.max(
      0,
      Math.min(
        1,
        config.ai.tackleSuccessChanceBase +
          (stealer.params.technique - 0.5) * config.ai.tackleSuccessTechniqueSpread
      )
    );

    if (!chance(rng, tackleSuccessChance)) {
      // かわされた: 奪取は成立せず、挑んだ守備者だけがその場で怯む。保持者はそのまま持ち続ける。
      stealer.stunTurns = config.ai.defenderStunTurns;
      resolvePlayerBall(possessor, ball, config);
      return;
    }

    // 奪取: 保持者を差し替える。速度は一度0にし、新しい保持者が操作を始める（§4.3）。
    // 奪われた旧保持者はその場で怯む。
    possessor.stunTurns = config.ai.possessorStunTurns;
    ball.possessorId = stealer.id;
    ball.pos = { ...stealer.pos };
    ball.vel = { x: 0, y: 0 };
    ball.possessionTurns = 0;
    return;
  }

  // インターセプト: パス/シュートで飛んでいる最中のボールの軌跡に、蹴った選手と別チームの
  // 選手が interceptDistance 以内まで近づいていれば、距離に応じた確率で奪う。
  if (ball.lastKickerId !== null) {
    const kicker = players.find((p) => p.id === ball.lastKickerId);
    if (kicker !== undefined) {
      let interceptor: Player | undefined;
      let bestDist = Infinity;
      for (const p of players) {
        if (p.team === kicker.team) continue;
        const d = distanceToSegment(p.pos, prevBallPos, ball.pos);
        if (d <= config.ai.interceptDistance && d < bestDist) {
          bestDist = d;
          interceptor = p;
        }
      }

      if (interceptor !== undefined) {
        const proximity = 1 - bestDist / config.ai.interceptDistance;
        if (chance(rng, config.ai.interceptChance * proximity)) {
          ball.status = "Possessed";
          ball.possessorId = interceptor.id;
          ball.pos = { ...interceptor.pos };
          ball.vel = { x: 0, y: 0 };
          ball.possessionTurns = 0;
          return;
        }
      }
    }
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
