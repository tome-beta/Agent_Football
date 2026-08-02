import type { Player, PlayerParams, Role, Team, TeamSide, Vec2, GameState, GameConfig } from "../types";
import { add, sub, scale, length, normalize, distance, clampMagnitude } from "./utils";
import { kickBall } from "./ball";
import { nextRandomRange, chance } from "./random";
import { isOffside, lastDefenderLineY } from "./offside";

/** `homePos` を初期位置として選手を1人生成する（`pos`/`homePos` は別オブジェクトとしてコピーする）。 */
export function createPlayer(
  id: string,
  team: TeamSide,
  role: Role,
  params: PlayerParams,
  homePos: Vec2
): Player {
  return {
    id,
    team,
    role,
    params,
    homePos: { ...homePos },
    pos: { ...homePos },
    vel: { x: 0, y: 0 },
    state: "Idle",
  };
}

/**
 * 役割ごとの定位置（config.team.formation の比率）を実座標に変換する。
 *
 * 比率は「自陣基準」で表現されており、y = -1 が自ゴール側。
 * チームA は y = -length/2 のゴールを守るのでそのまま、チームB は y を反転して使う。
 */
export function formationPos(side: TeamSide, role: Role, config: GameConfig): Vec2 {
  const ratio = config.team.formation[role];
  const sign = side === "A" ? 1 : -1;
  return {
    x: (sign * ratio.x * config.pitch.width) / 2,
    y: (sign * ratio.y * config.pitch.length) / 2,
  };
}

const ROLES: Role[] = ["DF", "MF", "FW"];

/** 1チーム分（FW/MF/DF 各1人）の選手を定位置に配置して生成する。 */
export function createTeam(side: TeamSide, config: GameConfig): Team {
  return {
    side,
    name: config.team.names[side],
    tactics: { ...config.team.tactics[side] },
    players: ROLES.map((role) =>
      createPlayer(
        `${side}-${role}`,
        side,
        role,
        { ...config.team.roleParams[role] },
        formationPos(side, role, config)
      )
    ),
  };
}

function opposite(side: TeamSide): TeamSide {
  return side === "A" ? "B" : "A";
}

/** side が攻撃するゴールの座標（y = ±length/2）。 */
function attackGoal(side: TeamSide, config: GameConfig): Vec2 {
  return { x: 0, y: side === "A" ? config.pitch.length / 2 : -config.pitch.length / 2 };
}

/** side が守るゴール（＝相手が攻撃するゴール）の座標。 */
function ownGoal(side: TeamSide, config: GameConfig): Vec2 {
  return attackGoal(opposite(side), config);
}

function effectiveSpeed(player: Player, config: GameConfig): number {
  return Math.min(player.params.speed, config.player.maxSpeed);
}

/** 選手の現在の向き。動いていれば進行方向、静止時は攻撃方向を向く。デバッグ描画（視野範囲の表示）でも使う。 */
export function facingDirection(player: Player): Vec2 {
  if (length(player.vel) > 1e-6) return player.vel;
  return { x: 0, y: player.team === "A" ? 1 : -1 };
}

/** キック方向に、精度パラメータ（0〜1、低いほどブレ大）に応じた角度誤差を加える。 */
function applyAimError(dir: Vec2, accuracy: number, state: GameState, config: GameConfig): Vec2 {
  const maxOffsetDeg = config.ai.aimErrorMaxDeg * (1 - Math.max(0, Math.min(1, accuracy)));
  const offsetDeg = nextRandomRange(state, -maxOffsetDeg, maxOffsetDeg);
  const rad = (offsetDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dir.x * cos - dir.y * sin, y: dir.x * sin + dir.y * cos };
}

/** target に向かって player.vel を設定する（十分近ければ停止）。 */
function moveToward(player: Player, target: Vec2, config: GameConfig): void {
  const toTarget = sub(target, player.pos);
  const dist = length(toTarget);
  if (dist < config.ai.moveStopThreshold) {
    player.vel = { x: 0, y: 0 };
    return;
  }
  player.vel = scale(normalize(toTarget), effectiveSpeed(player, config));
}

/**
 * パス射程内の味方から、敵にマークされていない/ゴールに近い順で受け手を選ぶ（features_1 §3.1）。
 *
 * `isVisible` の視野角チェックはここでは使わない。ボールを保持している選手は
 * 走りながら前だけを見ているわけではなく周囲を見渡せる想定なので、`facingDirection`
 * （＝直近の移動方向）を基準にした狭い視野角でパス候補を弾くと、フォーメーション上
 * 横や後ろにいる味方（実戦でもよくある）が常に候補から漏れてしまう。距離（`passDistance`）
 * だけで絞り込む。
 */
function selectPassReceiver(player: Player, state: GameState, config: GameConfig): Player | undefined {
  const myTeam = state.teams[player.team];
  const oppTeam = state.teams[opposite(player.team)];
  const goal = attackGoal(player.team, config);

  // オフサイドポジションの候補は avoidChance の確率で候補から除外する。完全除外（確率1.0固定）に
  // すると縦パスという崩し手段が丸ごと消え、得点数が導入前の約1/5まで落ち込む強い偏りが
  // 確認されたため、確率的な回避に留める（`specification/features_offside.md` ステップ1）。
  // ballPosAtKick は蹴り手（player）の現在位置＝保持中のボール位置と一致する。
  const candidates = myTeam.players.filter((p) => {
    if (p.id === player.id || distance(player.pos, p.pos) > config.ai.passDistance) return false;
    const offside = config.ai.offside.enabled && isOffside(p.pos, player.team, oppTeam, player.pos, config);
    return !(offside && chance(state, config.ai.offside.avoidChance));
  });
  if (candidates.length === 0) return undefined;

  let best: Player | undefined;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const marked = oppTeam.players.some(
      (o) => distance(o.pos, candidate.pos) <= config.ai.tackleDistance * config.ai.markedRadiusFactor
    );
    const distToGoal = distance(candidate.pos, goal);
    const score = (marked ? -1000 : 0) - distToGoal;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function decidePossessionAction(player: Player, state: GameState, config: GameConfig): void {
  const { ball } = state;
  const goal = attackGoal(player.team, config);
  const distToGoal = distance(player.pos, goal);

  if (distToGoal <= config.ai.shootDistance) {
    const successChance = Math.max(
      0,
      Math.min(1, config.ai.shootProbability * player.params.shootPower * player.params.aggressiveness)
    );
    if (chance(state, successChance)) {
      player.state = "Shooting";
      const dir = applyAimError(normalize(sub(goal, player.pos)), player.params.shootPower, state, config);
      const power = config.ai.shootSpeed * player.params.shootPower;
      kickBall(ball, dir, power, player.id);
      player.vel = { x: 0, y: 0 };
      return;
    }
  }

  const receiver = selectPassReceiver(player, state, config);
  if (receiver !== undefined) {
    // 受け手がいても、役割ではなく aggressiveness/vision に応じた確率であえてドリブルを選ぶことがある。
    // aggressiveness が高いほど自分で運びたがり、vision が広いほど受け手を見つけやすくパスを選びやすい。
    const dribbleChance = Math.max(
      0,
      Math.min(
        1,
        config.ai.dribbleChanceBase +
          (player.params.aggressiveness - 0.5) * config.ai.dribbleChanceAggroSpread -
          (player.params.vision / 180 - 0.5) * config.ai.dribbleChanceVisionSpread
      )
    );
    if (!chance(state, dribbleChance)) {
      player.state = "Passing";
      const dist = distance(player.pos, receiver.pos);
      const dir = applyAimError(normalize(sub(receiver.pos, player.pos)), player.params.passAccuracy, state, config);
      const power = Math.min(config.ball.maxSpeed, config.ai.passSpeed + dist * config.ai.passSpeedDistanceFactor);
      kickBall(ball, dir, power, player.id);
      player.vel = { x: 0, y: 0 };
      return;
    }
  }

  // パス相手もシュート機会もない、またはあえてドリブルを選んだ: ゴール方向へドリブル（保持継続）。
  player.state = "Possession";
  moveToward(player, goal, config);
}

/** candidates の中から point に最も近い選手の位置を返す。 */
function nearestPosTo(point: Vec2, candidates: Player[]): Vec2 | undefined {
  let nearest: Vec2 | undefined;
  let nearestDist = Infinity;
  for (const c of candidates) {
    const d = distance(point, c.pos);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = c.pos;
    }
  }
  return nearest;
}

/**
 * 敵ボール保持者を複数人で詰め寄るとき、全員が同じ方向（自ゴール寄り）から一直線に
 * 近づいてしまうと「囲む」形にならず団子状に重なるだけになる。ここでは pressDistance
 * 以内にいる味方（自分を含む）を id 順に並べて円周上のスロットに割り当て、各人が
 * carrier を中心とした異なる角度から接近するようにする。
 */
function computeApproachPoint(
  player: Player,
  carrier: Player,
  myTeam: Team,
  own: Vec2,
  p: GameConfig["ai"]["positioning"]
): Vec2 {
  const pressers = myTeam.players
    .filter((m) => distance(m.pos, carrier.pos) <= p.pressDistance)
    .sort((a, b) => a.id.localeCompare(b.id));
  const slot = pressers.findIndex((m) => m.id === player.id);
  const n = pressers.length;
  if (n <= 1) return carrier.pos;

  const baseAngle = Math.atan2(own.y - carrier.pos.y, own.x - carrier.pos.x);
  const angle = baseAngle + (2 * Math.PI * slot) / n;
  return {
    x: carrier.pos.x + Math.cos(angle) * p.surroundRadius,
    y: carrier.pos.y + Math.sin(angle) * p.surroundRadius,
  };
}

/**
 * 非保持の選手が目指す目標位置を、複数の「力」を合成して決める（マイルストーンH）。
 * 役割（FW/MF/DF）による分岐は書かず、`homePos`/`params` の違いが結果ににじみ出るようにする。
 *
 * 敵がボールを持っている場合:
 *   1. ballAttraction: home からボール方向へ、distance(home, ownGoal) * ballPullWeight を
 *      上限に追従する（home が自ゴールから遠い＝FW寄りの選手ほど大きく前に出る）
 *   2. coverBias: ボール-自ゴール間の線上へ coverWeight の比率で吸着する
 *   3. pressure: pressDistance 以内の敵ボール保持者へ、aggressiveness に応じて詰め寄る
 *
 * 敵がボールを持っていない場合（味方保持 or フリーボール）:
 *   ボールから攻撃ゴール方向へ passDistance の6割ほど進んだ「受け手ポジション」を狙い、
 *   近くの敵マーカーから離れる方向へずらす（features_1 §4.1）。
 *
 * 最後に、味方が minSpacing 未満に近づいていれば離れる方向へ補正する（teammateRepulsion）。
 */
function computeTargetPosition(player: Player, state: GameState, config: GameConfig): Vec2 {
  const home = formationPos(player.team, player.role, config);
  const own = ownGoal(player.team, config);
  const { ball } = state;
  const p = config.ai.positioning;
  const myTeam = state.teams[player.team];
  const oppTeam = state.teams[opposite(player.team)];
  const carrier = ball.possessorId !== null ? oppTeam.players.find((o) => o.id === ball.possessorId) : undefined;

  let target: Vec2;
  if (carrier !== undefined) {
    const idealFollowDist = distance(home, own) * p.ballPullWeight;
    target = add(home, clampMagnitude(sub(ball.pos, home), idealFollowDist));

    const lineVec = sub(ball.pos, own);
    const lineLenSq = lineVec.x * lineVec.x + lineVec.y * lineVec.y;
    if (lineLenSq > 1e-6) {
      const t = Math.max(0, Math.min(1, ((target.x - own.x) * lineVec.x + (target.y - own.y) * lineVec.y) / lineLenSq));
      const projected = add(own, scale(lineVec, t));
      target = add(target, scale(sub(projected, target), p.coverWeight));
    }

    const dCarrier = distance(player.pos, carrier.pos);
    if (dCarrier <= p.pressDistance) {
      // 詰め寄るかどうかは役割ではなく aggressiveness に応じた確率で毎ターン決める。
      // これにより同じ場面でも選手の反応が毎回変わり、かつ aggressiveness が高い選手ほど
      // 積極的に前へ出る傾向がにじみ出る（features_1/開発メモの「役割分岐にしない」方針に沿う）。
      const pressChance = Math.max(
        0,
        Math.min(1, p.pressChanceBase + (player.params.aggressiveness - 0.5) * p.pressChanceSpread)
      );
      if (chance(state, pressChance)) {
        const strength = p.pressWeight * player.params.aggressiveness;
        target = add(target, scale(sub(computeApproachPoint(player, carrier, myTeam, own, p), target), strength));
      }
    }
  } else {
    const goal = attackGoal(player.team, config);
    const towardGoalDir = normalize(sub(goal, ball.pos));
    const receivingDistance = config.ai.passDistance * p.receivingDistanceFactor;
    const base = length(towardGoalDir) < 1e-6 ? home : add(ball.pos, scale(towardGoalDir, receivingDistance));

    // 近くに敵がいるときだけ回避する（遠い敵に対してまで毎回markerAvoidStepDistanceずらすと無意味に揺れる）。
    const markerRange = config.ai.passDistance * p.markerAvoidRangeFactor;
    const marker = nearestPosTo(base, oppTeam.players);
    let openSpot = base;
    if (marker !== undefined && distance(base, marker) < markerRange) {
      const awayFromMarker = sub(base, marker);
      if (length(awayFromMarker) > 1e-6) {
        openSpot = add(base, scale(normalize(awayFromMarker), p.markerAvoidStepDistance));
      }
    }
    target = { x: (openSpot.x + home.x) / 2, y: openSpot.y };

    // 受け手ポジションが相手最終ラインより前に出ていたら、ソフトにラインへ引き戻す
    // （ハードクランプだと味方・敵双方が団子状に固まって動けなくなる不安定性が確認されたため、
    // ブレンド率での部分補正に留める。`specification/features_offside.md` 参照）。
    if (config.ai.offside.enabled) {
      const lineY = lastDefenderLineY(player.team, oppTeam, config);
      const beyondLine = player.team === "A" ? target.y > lineY : target.y < lineY;
      if (beyondLine) {
        target.y = target.y + (lineY - target.y) * config.ai.offside.pullWeight;
      }
    }
  }

  for (const mate of myTeam.players) {
    if (mate.id === player.id) continue;
    const d = distance(player.pos, mate.pos);
    if (d < p.minSpacing) {
      const away = sub(player.pos, mate.pos);
      if (length(away) > 1e-6) {
        const strength = ((p.minSpacing - d) / p.minSpacing) * p.repulsionWeight;
        target = add(target, scale(normalize(away), strength));
      }
    }
  }

  return target;
}

function decideDefensiveAction(player: Player, state: GameState, config: GameConfig): void {
  player.state = "Marking";
  moveToward(player, computeTargetPosition(player, state, config), config);
}

/** 味方がボールを持っている間の受け手ポジショニング。 */
function decideSupportAction(player: Player, state: GameState, config: GameConfig): void {
  player.state = "MovingToSpace";
  moveToward(player, computeTargetPosition(player, state, config), config);
}

function decideFreeBallAction(player: Player, state: GameState, config: GameConfig): void {
  const { ball } = state;
  const myTeam = state.teams[player.team];

  let nearestTeammate = player;
  let nearestDist = distance(player.pos, ball.pos);
  for (const p of myTeam.players) {
    const d = distance(p.pos, ball.pos);
    if (d < nearestDist) {
      nearestDist = d;
      nearestTeammate = p;
    }
  }

  if (nearestTeammate.id === player.id && distance(player.pos, ball.pos) <= config.ai.visionDistance) {
    player.state = "BallTracking";
    moveToward(player, ball.pos, config);
  } else {
    // フリーボールでも定位置ぴったりへは戻さない。パス/シュートの直後は誰も保持していない
    // 時間が長く続くため、ここが素の formationPos だと味方の大半が毎回そこへ引き戻されて
    // しまい、「受けるための動き」が起きる前に消えてしまっていた。
    player.state = "MovingToSpace";
    moveToward(player, computeTargetPosition(player, state, config), config);
  }
}

/**
 * 選手1人の行動を決定する（features_1 §2〜§5）。
 *
 * ボール保持状況に応じて4つに分岐する:
 *   - 自分が保持中 … シュート/パス/ドリブル判定（decidePossessionAction）
 *   - 敵が保持中 … 最も近い敵をマーク（decideDefensiveAction）
 *   - 味方が保持中 … スペースへ移動して受け手候補になる（decideSupportAction）
 *   - フリーボール … 最も近い味方だけが追いかけ、他は受け手ポジションへ（decideFreeBallAction）
 *
 * ここでは state と vel だけを更新する。実際の位置更新は stepPlayer が行う。
 */
export function decideAction(player: Player, state: GameState, config: GameConfig): void {
  const { ball } = state;

  if (ball.possessorId === player.id) {
    decidePossessionAction(player, state, config);
    return;
  }

  const myTeam = state.teams[player.team];
  const possessorIsTeammate =
    ball.possessorId !== null && myTeam.players.some((p) => p.id === ball.possessorId);
  const possessorIsOpponent = ball.possessorId !== null && !possessorIsTeammate;

  if (possessorIsOpponent) {
    decideDefensiveAction(player, state, config);
    return;
  }

  if (possessorIsTeammate) {
    decideSupportAction(player, state, config);
    return;
  }

  decideFreeBallAction(player, state, config);
}

/** decideAction が設定した vel に従って選手を1ターン分動かし、ピッチ内に収める。 */
export function stepPlayer(player: Player, config: GameConfig): void {
  const { dt } = config.physics;
  player.pos = add(player.pos, scale(player.vel, dt));

  const halfWidth = config.pitch.width / 2;
  const halfLength = config.pitch.length / 2;
  player.pos.x = Math.max(-halfWidth, Math.min(halfWidth, player.pos.x));
  player.pos.y = Math.max(-halfLength, Math.min(halfLength, player.pos.y));
}
