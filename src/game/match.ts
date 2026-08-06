import type { GameState, GameConfig, MatchResult, Player, TeamSide } from "../types";
import { createBall } from "./ball";
import { createTeam } from "./player";
import { Pitch } from "./pitch";
import { distance } from "./utils";

export function createInitialState(config: GameConfig): GameState {
  return {
    phase: "MATCH_START",
    phaseTurn: 0,
    turn: 0,
    half: 1,
    kickoffSide: "A",
    teams: {
      A: createTeam("A", config),
      B: createTeam("B", config),
    },
    ball: createBall(),
    scoreLog: [],
    rngSeed: config.random.seed,
    result: null,
  };
}

/** scoreLog から現在のスコアを集計する（スコアは scoreLog を単一の情報源とする）。 */
export function currentScore(state: GameState): { A: number; B: number } {
  const score = { A: 0, B: 0 };
  for (const entry of state.scoreLog) {
    score[entry.team] += 1;
  }
  return score;
}

function opposite(side: TeamSide): TeamSide {
  return side === "A" ? "B" : "A";
}

function allPlayers(state: GameState): Player[] {
  return [...state.teams.A.players, ...state.teams.B.players];
}

/**
 * キックオフの配置（features_3 §5.1）: 全選手を定位置に戻し、ボールを中央に置いて
 * `state.kickoffSide` の選手（MFがいなければ先頭選手）に持たせる。
 * MATCH_START→KICKOFF、RESTART_SETUP→KICKOFF、HALF_TIME→KICKOFF のいずれからも呼ばれる。
 */
function setupKickoff(state: GameState, config: GameConfig): void {
  for (const player of allPlayers(state)) {
    player.pos = { ...player.homePos };
    player.vel = { x: 0, y: 0 };
    player.state = "Idle";
  }

  const kickoffTeam = state.teams[state.kickoffSide];
  const kicker = kickoffTeam.players.find((p) => p.role === "MF") ?? kickoffTeam.players[0];

  state.ball.pos = { x: 0, y: 0 };
  state.ball.vel = { x: 0, y: 0 };
  state.ball.status = "Possessed";
  state.ball.possessorId = kicker.id;
  state.ball.offsideOffenderId = null;
}

function nearestPlayerTo(players: Player[], pos: { x: number; y: number }): Player {
  let nearest = players[0];
  let nearestDist = distance(nearest.pos, pos);
  for (const p of players.slice(1)) {
    const d = distance(p.pos, pos);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = p;
    }
  }
  return nearest;
}

/** ボールが goalOwner のゴールに入っていれば得点処理をして true を返す（features_3 §4.1）。 */
function checkGoal(state: GameState, pitch: Pitch): boolean {
  const { ball } = state;

  // isInGoalB は「チームBのゴールに入った」＝チームAの得点。isInGoalA はその逆。
  let scoringTeam: TeamSide | undefined;
  if (pitch.isInGoalB(ball.pos)) scoringTeam = "A";
  else if (pitch.isInGoalA(ball.pos)) scoringTeam = "B";
  if (scoringTeam === undefined) return false;

  // ドリブルでゴールに入った場合（キックを伴わない）は現在の保持者が得点者。
  // それ以外（シュート/パスがそのままゴールした場合）は最後にキックした選手。
  const scorerId = ball.status === "Possessed" ? ball.possessorId : ball.lastKickerId;
  state.scoreLog.push({ team: scoringTeam, playerId: scorerId ?? "", turn: state.turn });
  state.phase = "GOAL_SCORED";
  state.phaseTurn = 0;
  // 失点したチームが次のキックオフ権を得る（features_3 §5.2）。
  state.kickoffSide = opposite(scoringTeam);

  ball.status = "Free";
  ball.vel = { x: 0, y: 0 };
  ball.possessorId = null;
  ball.offsideOffenderId = null;
  return true;
}

/**
 * オフサイドの反則判定（ステップ2、features_offside.md）。`selectPassReceiver` がオフサイドの
 * 選手を受け手として選んでしまった場合、`ball.offsideOffenderId` にその選手IDがセットされている。
 * その選手が実際にボールを保持した瞬間に反則が成立し、相手ボールで現在地から再開する。
 * それ以外の選手（味方/敵）が先に触れた場合は不成立としてフラグだけ消す。
 * まだ誰も触れていない（Free のまま）場合は何もせず次ターンへ持ち越す。
 */
function handleOffside(state: GameState, config: GameConfig): boolean {
  const { ball } = state;
  if (!config.ai.offside.enabled || ball.offsideOffenderId === null) return false;
  if (ball.status !== "Possessed") return false;

  if (ball.possessorId !== ball.offsideOffenderId) {
    ball.offsideOffenderId = null;
    return false;
  }

  const offender = allPlayers(state).find((p) => p.id === ball.offsideOffenderId);
  const entitledSide = opposite((offender as Player).team);
  const spot = { ...ball.pos };
  const receiver = nearestPlayerTo(state.teams[entitledSide].players, spot);

  ball.status = "Possessed";
  ball.vel = { x: 0, y: 0 };
  ball.possessorId = receiver.id;
  ball.pos = { ...receiver.pos };
  ball.offsideOffenderId = null;
  return true;
}

/**
 * ボールがピッチ外に出た場合の簡易再開（features_3 §7・簡略版）。
 * 中央付近へ戻し、最後に蹴ったチームの相手チームのうち中央に最も近い選手に持たせる。
 */
function handleOutOfBounds(state: GameState, pitch: Pitch): void {
  const { ball } = state;
  if (ball.status !== "Free" || pitch.isInBounds(ball.pos)) return;

  const kicker =
    ball.lastKickerId !== null ? allPlayers(state).find((p) => p.id === ball.lastKickerId) : undefined;
  const entitledSide: TeamSide = kicker !== undefined ? opposite(kicker.team) : "A";

  const center = { x: 0, y: 0 };
  const receiver = nearestPlayerTo(state.teams[entitledSide].players, center);

  ball.status = "Possessed";
  ball.vel = { x: 0, y: 0 };
  ball.possessorId = receiver.id;
  ball.pos = { ...receiver.pos };
  ball.offsideOffenderId = null;
}

/**
 * フェーズのタイムアウト／進行条件を評価し、必要なら次のフェーズへ遷移する（features_3 §1）。
 *
 * MATCH_START→KICKOFF, GOAL_SCORED→RESTART_SETUP, RESTART_SETUP→KICKOFF, HALF_TIME→KICKOFF は
 * 即座にキックオフの再配置（setupKickoff）を伴う。イベント駆動の GOAL_SCORED 突入自体は
 * stepMatch 内の checkGoal が担当し、ここでは扱わない。
 */
export function advancePhase(state: GameState, config: GameConfig): void {
  switch (state.phase) {
    case "MATCH_START":
      state.phase = "KICKOFF";
      state.phaseTurn = 0;
      setupKickoff(state, config);
      break;

    case "KICKOFF":
      if (state.phaseTurn >= config.match.kickoffTurns) {
        state.phase = "PLAYING";
        state.phaseTurn = 0;
      }
      break;

    case "PLAYING": {
      const halfEndTurn = config.match.turnsPerHalf * state.half;
      if (state.turn >= halfEndTurn) {
        if (state.half === 1) {
          state.phase = "HALF_TIME";
        } else {
          state.phase = "MATCH_END";
          state.result = finalizeResult(state);
        }
        state.phaseTurn = 0;
      }
      break;
    }

    case "GOAL_SCORED":
      if (state.phaseTurn >= config.match.goalScoredTurns) {
        state.phase = "RESTART_SETUP";
        state.phaseTurn = 0;
      }
      break;

    case "RESTART_SETUP":
      if (state.phaseTurn >= config.match.restartSetupTurns) {
        state.phase = "KICKOFF";
        state.phaseTurn = 0;
        setupKickoff(state, config);
      }
      break;

    case "HALF_TIME":
      state.half = 2;
      state.kickoffSide = opposite(state.kickoffSide);
      state.phase = "KICKOFF";
      state.phaseTurn = 0;
      setupKickoff(state, config);
      break;

    case "MATCH_END":
      break;
  }
}

/**
 * 試合を1ターン進める（features_3 §13「毎ターンのゲームループ」のうち状態更新部分）。
 *
 * 選手AI・ボール物理・当たり判定は Simulator（マイルストーンE）が別途呼び出す想定で、
 * ここではターン計数・ゴール判定・アウトオブバウンズ・フェーズ遷移のみを扱う。
 */
export function stepMatch(state: GameState, config: GameConfig): void {
  if (state.phase === "MATCH_END") return;

  state.turn += 1;
  state.phaseTurn += 1;

  if (state.phase === "PLAYING") {
    const pitch = new Pitch(config);
    if (!handleOffside(state, config)) {
      if (!checkGoal(state, pitch)) {
        handleOutOfBounds(state, pitch);
      }
    }
  }

  advancePhase(state, config);
}

export function finalizeResult(state: GameState): MatchResult {
  const score = currentScore(state);
  let winner: TeamSide | "Draw" = "Draw";
  if (score.A > score.B) winner = "A";
  else if (score.B > score.A) winner = "B";

  return {
    scoreA: score.A,
    scoreB: score.B,
    winner,
    durationTurns: state.turn,
  };
}
