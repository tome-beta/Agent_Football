import type { Player, PlayerParams, Role, Team, TeamSide, Vec2, GameState, GameConfig } from "../types";
import { add, sub, scale, length, normalize, distance } from "./utils";
import { kickBall } from "./ball";
import { nextRandomRange, chance } from "./random";

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

/** 選手の現在の向き。動いていれば進行方向、静止時は攻撃方向を向く。 */
function facingDirection(player: Player): Vec2 {
  if (length(player.vel) > 1e-6) return player.vel;
  return { x: 0, y: player.team === "A" ? 1 : -1 };
}

/** targetPos が player の視野（距離 × 視野角）内にあるか。 */
function isVisible(player: Player, targetPos: Vec2, config: GameConfig): boolean {
  const toTarget = sub(targetPos, player.pos);
  const dist = length(toTarget);
  if (dist > config.ai.visionDistance) return false;
  if (dist < 1e-6) return true;

  const facing = normalize(facingDirection(player));
  if (length(facing) < 1e-6) return true;

  const cosAngle = (facing.x * toTarget.x + facing.y * toTarget.y) / dist;
  const clamped = Math.max(-1, Math.min(1, cosAngle));
  const angleDeg = (Math.acos(clamped) * 180) / Math.PI;
  return angleDeg <= player.params.vision / 2;
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
  if (dist < 0.1) {
    player.vel = { x: 0, y: 0 };
    return;
  }
  player.vel = scale(normalize(toTarget), effectiveSpeed(player, config));
}

function nearestOpponent(player: Player, oppTeam: Team, config: GameConfig): Player | undefined {
  const visible = oppTeam.players.filter((o) => isVisible(player, o.pos, config));
  const candidates = visible.length > 0 ? visible : oppTeam.players;
  let nearest: Player | undefined;
  let nearestDist = Infinity;
  for (const o of candidates) {
    const d = distance(player.pos, o.pos);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = o;
    }
  }
  return nearest;
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

  const candidates = myTeam.players.filter(
    (p) => p.id !== player.id && distance(player.pos, p.pos) <= config.ai.passDistance
  );
  if (candidates.length === 0) return undefined;

  let best: Player | undefined;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const marked = oppTeam.players.some(
      (o) => distance(o.pos, candidate.pos) <= config.ai.tackleDistance * 2
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
    player.state = "Passing";
    const dist = distance(player.pos, receiver.pos);
    const dir = applyAimError(normalize(sub(receiver.pos, player.pos)), player.params.passAccuracy, state, config);
    const power = Math.min(config.ball.maxSpeed, config.ai.passSpeed + dist * 0.3);
    kickBall(ball, dir, power, player.id);
    player.vel = { x: 0, y: 0 };
    return;
  }

  // パス相手もシュート機会もない: ゴール方向へドリブル（保持継続）。
  player.state = "Possession";
  moveToward(player, goal, config);
}

function decideDefensiveAction(player: Player, state: GameState, config: GameConfig): void {
  const oppTeam = state.teams[opposite(player.team)];
  const target = nearestOpponent(player, oppTeam, config);
  const anchor = target !== undefined ? target.pos : formationPos(player.team, player.role, config);

  player.state = "Marking";
  const own = ownGoal(player.team, config);
  const toOwn = sub(own, anchor);
  // tackleDistance より内側に寄せないと、狙い通りの位置に到達しても奪取判定に絶対届かない。
  const offset = Math.min(config.ai.tackleDistance * 0.5, length(toOwn));
  const markPos = length(toOwn) < 1e-6 ? anchor : add(anchor, scale(normalize(toOwn), offset));
  moveToward(player, markPos, config);
}

/**
 * 味方がボールを持っている間の受け手ポジショニング（features_1 §4.1）。
 *
 * 定位置からボール方向に少し寄るだけでは「パスを受けるための動き」に見えないため、
 * 攻撃ゴール方向へのランも同時に加える。ボールに寄りすぎるとキャリアーと重なって
 * パスコースを塞いでしまうので、ボール寄せは軽め・ゴール方向への前進は強めにする。
 */
function decideSupportAction(player: Player, state: GameState, config: GameConfig): void {
  player.state = "MovingToSpace";
  const home = formationPos(player.team, player.role, config);
  const goal = attackGoal(player.team, config);

  const towardBall = scale(sub(state.ball.pos, home), 0.2);
  const towardGoal = scale(sub(goal, home), 0.3);
  moveToward(player, add(home, add(towardBall, towardGoal)), config);
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
    player.state = "MovingToSpace";
    moveToward(player, formationPos(player.team, player.role, config), config);
  }
}

/**
 * 選手1人の行動を決定する（features_1 §2〜§5）。
 *
 * ボール保持状況に応じて4つに分岐する:
 *   - 自分が保持中 … シュート/パス/ドリブル判定（decidePossessionAction）
 *   - 敵が保持中 … 最も近い敵をマーク（decideDefensiveAction）
 *   - 味方が保持中 … スペースへ移動して受け手候補になる（decideSupportAction）
 *   - フリーボール … 最も近い味方だけが追いかけ、他はフォーメーション位置へ（decideFreeBallAction）
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
