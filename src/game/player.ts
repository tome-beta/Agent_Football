import type {
  Player,
  PlayerIntentType,
  PlayerParams,
  Role,
  Team,
  TeamSide,
  Vec2,
  GameState,
  GameConfig,
  IntentChangeCallback,
} from "../types";
import { add, sub, scale, length, normalize, distance, clampMagnitude } from "./utils";
import { kickBall } from "./ball";
import { nextRandomRange, chance } from "./random";
import { isOffside, offsideLineY } from "./offside";

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
    intent: { type: "Idle", startedAtTurn: 0, minDurationTurns: 0, maxDurationTurns: 0 },
    stunTurns: 0,
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

/**
 * target に向かって player.vel を設定する（十分近ければ停止）。speedFactor で速度を係数倍する。
 *
 * 目標との距離が「1ターンで進む距離」より短い場合は、その距離分だけしか進まない速度に
 * 減速する（`dist / dt` を速度の上限にする）。この減速がないと、目標がわずかに動く
 * だけの状況（例: 味方保持中のボール追従）で毎ターン目標を通り越しては逆方向へ全速力で
 * 戻る、という振動（震え）が起きていた（ユーザー指摘、2026-08-14）。遠方では
 * `dist / dt` が実効速度を上回るため、Math.min により従来通り全速力での接近を維持する。
 */
function moveToward(player: Player, target: Vec2, config: GameConfig, speedFactor = 1): void {
  const toTarget = sub(target, player.pos);
  const dist = length(toTarget);
  if (dist < config.ai.moveStopThreshold) {
    player.vel = { x: 0, y: 0 };
    return;
  }
  const maxSpeed = effectiveSpeed(player, config) * speedFactor;
  const arrivalSpeed = dist / config.physics.dt;
  player.vel = scale(normalize(toTarget), Math.min(maxSpeed, arrivalSpeed));
}

/**
 * ドリブル中（ボール保持しながらの移動）の速度倍率。passAccuracy をボールコントロールの
 * 技術の代用とし、低いほど減速が大きい（passAccuracy=1で減速なし）。これにより独走で
 * そのままゴールまで運びきる展開を抑え、パスの相対的な魅力を上げる。
 */
function dribbleSpeedFactor(player: Player, config: GameConfig): number {
  return 1 - config.ai.dribbleSpeedPenaltyMax * (1 - player.params.passAccuracy);
}

/**
 * 方式E（統一スコアリング。`specification/features_positioning_redesign.md`）。ある地点が
 * 「パスを受ける/そこへ動く価値」としてどれだけ良いかを単一のスコアで評価する。
 * `selectPassReceiver`（誰にパスするか）と `computeTargetPosition`（どこへ動くか）の両方が
 * この関数を共有する。方式A〜Dは「安全な位置を計算する側」だけを改善しており、「受け手を
 * 選ぶ側」（旧: `marked ? -1000 : 0) - distToGoal`）とは無関係に動いていたため、位置取りを
 * 改善しても自然なオフサイド率が下がりきらなかった。この断絶を解消するのが狙い。
 *
 *   - forwardWeight: ボールからゴールまでの残り距離に対する前進度（0〜1）への報酬
 *   - overshootWeight: オフサイドライン超過量を残り距離(remaining)で正規化した比率への
 *     ペナルティ（advancedと同じ無次元スケール）。呼び出し側ごとに異なる重みを渡す
 *     （`config.ai.offside.kpp.offsideOvershootWeight`/`receiverOvershootWeight`。
 *     2026-08-16、下記の注意点により分離）。旧実装ではメートル単位のまま加減算しており、
 *     forwardReachFractionで前進報酬の上限が低く抑えられている状況だと小さい重みでも前進報酬を
 *     即座に打ち消す非線形崩壊を起こしていた（2026-08-16に発見・修正、TODO_ARCHIVE.mdマイルストーンO）。
 *     ただし修正後も両呼び出し側で同じ弱い重み（0.5）を共有すると、`selectPassReceiver`側で
 *     「同程度の位置ならオンサイドを優先する」という基本原則すら守れなくなることが判明した
 *     （前進度の報酬がオフサイド超過ペナルティを上回ってしまう）。`computeTargetPosition`側は
 *     団子化を避けるため弱い重みが必要、`selectPassReceiver`側はオンサイド優先を守るため
 *     強めの重みが必要、という要求が逆方向なため、呼び出し側で重みを分離した
 *   - markingWeight: 最も近い敵選手が `tackleDistance * markedRadiusFactor` より近づいた分[m]
 *     へのペナルティ（旧: binaryな `marked` フラグを連続値化したもの）
 */
function scoreReceivingSpot(
  pos: Vec2,
  side: TeamSide,
  ballPos: Vec2,
  oppTeam: Team,
  config: GameConfig,
  overshootWeight: number
): number {
  const { kpp, lineToleranceMeters } = config.ai.offside;
  const goal = attackGoal(side, config);

  const remaining = distance(ballPos, goal);
  const advanced = remaining > 1e-6 ? Math.max(0, (remaining - distance(pos, goal)) / remaining) : 0;

  const lineY = offsideLineY(side, oppTeam, ballPos, config);
  const overshootMeters =
    side === "A" ? Math.max(0, pos.y - lineY - lineToleranceMeters) : Math.max(0, lineY - pos.y - lineToleranceMeters);
  const overshoot = remaining > 1e-6 ? overshootMeters / remaining : overshootMeters;

  const nearestOppDist = Math.min(...oppTeam.players.map((o) => distance(o.pos, pos)));
  const markingRange = config.ai.tackleDistance * config.ai.markedRadiusFactor;
  const markingPressure = Math.max(0, markingRange - nearestOppDist);

  return kpp.forwardWeight * advanced - overshootWeight * overshoot - kpp.markingWeight * markingPressure;
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
/** avoidanceEnabled 無効時の受け手スコア（旧式）: マークされていたら大幅減点し、あとはゴールに近いほど良い。 */
function legacyReceiverScore(candidatePos: Vec2, goal: Vec2, oppTeam: Team, config: GameConfig): number {
  const marked = oppTeam.players.some(
    (o) => distance(o.pos, candidatePos) <= config.ai.tackleDistance * config.ai.markedRadiusFactor
  );
  return (marked ? -1000 : 0) - distance(candidatePos, goal);
}

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
    // enabled時は方式Eの統一スコアを使う。無効時は既存の marked/distToGoal 式のままにし、
    // デフォルトのゲームバランス（オフサイド機能オフ時の挙動）を変えない。
    const score = config.ai.offside.avoidanceEnabled
      ? scoreReceivingSpot(
          candidate.pos,
          player.team,
          player.pos,
          oppTeam,
          config,
          config.ai.offside.kpp.receiverOvershootWeight
        )
      : legacyReceiverScore(candidate.pos, goal, oppTeam, config);
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
      Math.min(1, config.ai.shootProbability * player.params.shootPower * player.params.mental)
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

  // ゴール前に押し込まれている（自ゴールに近く、敵に詰められている）場合は、パス/ドリブルより
  // 先にクリア（陣地回復優先の大きな縦蹴り）を検討する。役割固定ではなく、mentalが低い
  // （慎重・堅実な）選手ほど自分で繋ごうとせずクリアを選びやすい設計にする。
  const own = ownGoal(player.team, config);
  const distToOwnGoal = distance(player.pos, own);
  if (distToOwnGoal <= config.ai.clear.dangerDistance) {
    const oppTeam = state.teams[opposite(player.team)];
    const nearestOpp = nearestPosTo(player.pos, oppTeam.players);
    const pressureDist = nearestOpp !== undefined ? distance(player.pos, nearestOpp) : Infinity;
    if (pressureDist <= config.ai.clear.pressureDistance) {
      // 敵がtackleDistanceへ迫るほど「もうすぐ奪われる」切迫度が上がり、クリアを選ぶ確率を
      // 底上げする。pressureDistance到達時点ではurgency=0（通常の base/mental差のみ）、
      // tackleDistanceまで詰められるとurgency=1（ほぼ確実にクリアし、タックルで奪われる前に
      // 逃がす）。タックル自体はクリア判定の後・同ターン内で解決されるため、ここで先に
      // 蹴り出せればそのターンのタックル判定自体が発生しない（ball.statusがFreeになるため）。
      const urgency = Math.max(
        0,
        Math.min(
          1,
          (config.ai.clear.pressureDistance - pressureDist) /
            (config.ai.clear.pressureDistance - config.ai.tackleDistance)
        )
      );
      const clearChance = Math.max(
        0,
        Math.min(
          1,
          config.ai.clear.chanceBase +
            (player.params.mental - 0.5) * config.ai.clear.chanceMentalSpread +
            urgency * config.ai.clear.urgencyWeight
        )
      );
      if (chance(state, clearChance)) {
        player.state = "Clearing";
        const away = normalize(sub(player.pos, own));
        const dir = applyAimError(away, config.ai.clear.accuracy, state, config);
        kickBall(ball, dir, config.ai.clear.speed, player.id);
        player.vel = { x: 0, y: 0 };
        return;
      }
    }
  }

  // ボールを受け取った直後の数ターンはパス判断自体を行わず、必ずドリブル継続にする。
  // これがないと毎フレーム独立にパス判定をやり直すため、受け取った1フレーム目で
  // いきなりパスしてしまい、ドリブルではなく「自分にパスして自分で拾う」ような
  // 一瞬の保持に見えていた（ユーザー指摘、2026-08-08）。mental が高い選手ほど
  // 長く持ち運びたがる形にする。
  const minHoldTurns = Math.max(
    0,
    config.ai.minHoldTurnsBase + (player.params.mental - 0.5) * config.ai.minHoldTurnsMentalSpread
  );
  let receiver = ball.possessionTurns < minHoldTurns ? undefined : selectPassReceiver(player, state, config);
  // isOffside は複数箇所で使う共通の判定なので、相手チーム参照ごと1回だけ計算する
  // （2026-08-16リファクタ: 以前は用途ごとに state.teams[opposite(player.team)] と
  // isOffside呼び出しを重複させていた）。
  const oppTeam = state.teams[opposite(player.team)];
  let receiverIsOffside = receiver !== undefined && isOffside(receiver.pos, player.team, oppTeam, player.pos, config);

  if (receiver !== undefined && config.ai.offside.avoidanceEnabled && receiverIsOffside) {
    // 選ばれた受け手がオフサイド濃厚な場合、「そもそも試みるかどうか」を dribbleChance
    // （パスかドリブルかの一般的な好み）とは独立の確率で先に判定する。mentalが高い
    // （積極的な）選手ほど試みる確率が上がり、成功することも反則になることもある、という
    // 個性の差を作る。以前は dribbleChance に単純加算していたが、他の項と合算した結果が
    // ほぼ全ロールで1.0近くに飽和してしまい、mentalの差がほとんど効かない「実質0か1か」の
    // 挙動になっていた（ユーザー指摘・デバッグ、2026-08-16）。
    const riskAttemptChance = Math.max(
      0,
      Math.min(
        1,
        config.ai.offsideRiskAttemptChanceBase + (player.params.mental - 0.5) * config.ai.offsideRiskAttemptChanceMentalSpread
      )
    );
    if (!chance(state, riskAttemptChance)) {
      // 諦めて安全な選択肢（ドリブル継続、または他の受け手がいればそちら）へフォールバックする。
      receiver = undefined;
      receiverIsOffside = false;
    }
  }

  if (receiver !== undefined) {
    // 受け手がいても、役割ではなく mental/vision に応じた確率であえてドリブルを選ぶことがある。
    // mental が高いほど自分で運びたがり、vision が広いほど受け手を見つけやすくパスを選びやすい。
    const dribbleChance = Math.max(
      0,
      Math.min(
        1,
        config.ai.dribbleChanceBase +
          (player.params.mental - 0.5) * config.ai.dribbleChanceMentalSpread -
          (player.params.vision / 180 - 0.5) * config.ai.dribbleChanceVisionSpread
      )
    );
    if (!chance(state, dribbleChance)) {
      player.state = "Passing";
      const dist = distance(player.pos, receiver.pos);
      const dir = applyAimError(normalize(sub(receiver.pos, player.pos)), player.params.passAccuracy, state, config);
      const power = Math.min(config.ball.maxSpeed, config.ai.passSpeed + dist * config.ai.passSpeedDistanceFactor);
      // ステップ1（avoidanceEnabled）をすり抜けた、またはそもそも回避が無効な場合を含め、
      // 実際にオフサイドの選手へパスしてしまったら反則判定用にフラグを立てる
      // （ball.offsideOffenderId、ステップ2）。avoidanceEnabled はAIの回避行動の
      // on/offであり、反則の検出自体（isOffside）とは独立に判定する必要がある
      // （両者を同じフラグに結びつけていたため、enforcementEnabled単体の効果を
      // 検証できていなかった。デバッグ調査、2026-08-16）。
      ball.offsideOffenderId = config.ai.offside.enforcementEnabled && receiverIsOffside ? receiver.id : null;
      kickBall(ball, dir, power, player.id);
      player.vel = { x: 0, y: 0 };
      return;
    }
  }

  // パス相手もシュート機会もない、またはあえてドリブルを選んだ: ゴール方向へドリブル（保持継続）。
  player.state = "Possession";
  const myTeam = state.teams[player.team];
  const advancement = (pos: Vec2) => (player.team === "A" ? pos.y : -pos.y);
  const hasForwardSupport = myTeam.players.some(
    (p) => p.id !== player.id && advancement(p.pos) > advancement(player.pos) + config.ai.soloDribbleSupportMargin
  );
  // 前方に味方が誰もいない（＝孤立して単独で敵陣へ持ち込もうとしている）場合は、方向は
  // 変えずに速度だけ落とす。味方が追いつくのを待たず全力で駆け上がる不自然さを和らげる。
  const soloFactor = hasForwardSupport ? 1 : 1 - config.ai.soloDribbleSpeedFactor;

  // マークされている（敵が近い）ときの方向づけ。敵を抜いて前進する「打開」ではなく、
  // 味方が受け手ポジションへ動くのを待つ「キープ」が狙いなので、速度は上げずマーカーから
  // 離れる方向をゴール方向へブレンドするだけに留める（独走力を上げて過去の非線形崩壊
  // ［TODO.md参照］を再現しないため）。ブレンド比率は mental/technique で連続的に決まり、
  // 高い選手ほど強引にゴール方向を維持し、低い選手ほどキープを優先する
  // （ユーザー指摘、2026-08-09: 役割固定ではなくパラメータで選ばせたい）。technique は
  // カルチョビットのテクニック相当で、マークをかわしつつ前進を維持する「打開力」の
  // 代用として使う（オフサイド反則有効化時の攻撃代替手段強化の一環）。oppTeam は関数冒頭
  // （受け手のオフサイド判定用）で既に計算済みのものを再利用する。
  const nearestOpp = nearestPosTo(player.pos, oppTeam.players);
  let dribbleTarget = goal;
  if (nearestOpp !== undefined) {
    const markingRange = config.ai.tackleDistance * config.ai.markedRadiusFactor;
    const nearestOppDist = distance(player.pos, nearestOpp);
    const markingPressure = Math.max(0, markingRange - nearestOppDist);
    if (markingPressure > 0) {
      const awayFromMarker = sub(player.pos, nearestOpp);
      if (length(awayFromMarker) > 1e-6) {
        const evasionWeight = Math.max(
          0,
          Math.min(
            1,
            config.ai.keepDribbleEvasionBase -
              (player.params.mental - 0.5) * config.ai.keepDribbleEvasionMentalSpread -
              (player.params.technique - 0.5) * config.ai.keepDribbleEvasionTechniqueSpread
          )
        );
        const blend = evasionWeight * Math.min(1, markingPressure / markingRange);
        // 座標点同士を補間すると、ゴールが遠くマーカー回避先が近いため小さいblendでは
        // ほぼゴール直進のままになってしまう。方向ベクトル同士を混ぜてから player.pos に
        // 足し戻すことで、blend の値がそのまま向きの変化量に反映されるようにする。
        const goalDir = normalize(sub(goal, player.pos));
        const awayDir = normalize(awayFromMarker);
        const blendedDir = normalize(add(scale(goalDir, 1 - blend), scale(awayDir, blend)));
        dribbleTarget = add(player.pos, blendedDir);
      }
    }
  }

  moveToward(player, dribbleTarget, config, dribbleSpeedFactor(player, config) * soloFactor);
}

/**
 * 方式E（統一スコアリング: features_positioning_redesign.md）。ボールから towardGoalDir
 * 方向へ最大 maxDistance（方式Aの上限）まで進んだ直線上を複数サンプリングし、各候補地点を
 * 「共有スコア `scoreReceivingSpot`（前進度・オフサイドライン超過量・マーク圧力）」に
 * 「自分がそこへ実際に到達できるかという個人固有の到達時間項（方式C由来）」を加えた
 * スコアで評価し、argmax の前進距離を返す。到達時間項は動く本人にしか意味を持たないため
 * 共有スコア関数には含めていない。maxDistance を超えないので、方式Aが保証する
 * 「団子化しない」性質は維持される。
 */
function selectReceivingDistance(
  player: Player,
  ballPos: Vec2,
  towardGoalDir: Vec2,
  maxDistance: number,
  side: TeamSide,
  defendingTeam: Team,
  config: GameConfig
): number {
  const { kpp, arrivalSafetyMarginSeconds, arrivalSampleSteps } = config.ai.offside;

  let bestD = 0;
  let bestScore = -Infinity;
  for (let i = 0; i <= arrivalSampleSteps; i++) {
    const d = (maxDistance * i) / arrivalSampleSteps;
    const candidate = add(ballPos, scale(towardGoalDir, d));

    const myTime = distance(player.pos, candidate) / effectiveSpeed(player, config);
    const oppTime = Math.min(
      ...defendingTeam.players.map((o) => distance(o.pos, candidate) / effectiveSpeed(o, config))
    );
    const arrivalDeficit = Math.max(0, myTime - oppTime - arrivalSafetyMarginSeconds);

    const score =
      scoreReceivingSpot(candidate, side, ballPos, defendingTeam, config, kpp.offsideOvershootWeight) -
      kpp.arrivalDeficitWeight * arrivalDeficit;

    if (score > bestScore) {
      bestScore = score;
      bestD = d;
    }
  }
  return bestD;
}

/**
 * player が自チームの中で最も自ゴールに近い（＝最終ラインを担う）選手かどうか。
 * role では判定しない — 局面によって FW が最も下がっていることもあれば DF が
 * 押し上げていることもあり、その時々の実位置で「最後尾」が入れ替わる方が自然。
 * 同点（距離が等しい）の場合は両者とも最後尾扱いにする（片方だけ詰め寄りを許すと
 * 抑制の意味が薄れるため）。
 */
function isLastManBack(player: Player, myTeam: Team, own: Vec2): boolean {
  const myDist = distance(player.pos, own);
  return myTeam.players.every((m) => m.id === player.id || distance(m.pos, own) >= myDist);
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
 * base 地点付近の敵マーカーから離す方向へ、markerAvoidStepDistance を上限に連続的に
 * ずらす。以前は2つの不連続を抱えていた（ユーザー指摘、2026-08-14）:
 *   1. 「markerRange未満なら固定でmarkerAvoidStepDistanceずらす／以上なら
 *      ずらさない」という二値判定 → 選手が目標へ近づいて敵との距離がmarkerRangeを
 *      またぐたびにopenSpotがステップ状に3mジャンプするbang-bang型の振動
 *   2. 「最も近い敵1人」だけを基準に方向を決めていた → ほぼ同距離の敵が2人いると
 *      どちらが最寄りかがわずかな位置変化で入れ替わり、回避方向が丸ごと反転する
 * 1.はしきい値付近で連続的に0へ収束させ、2.はapplyTeammateRepulsionと同じく
 * 範囲内の全員の寄与を合算する（単一の最寄り点を選ばない）ことで解消する。
 */
function applyMarkerAvoidance(base: Vec2, oppTeam: Team, config: GameConfig): Vec2 {
  const p = config.ai.positioning;
  const markerRange = config.ai.passDistance * p.markerAvoidRangeFactor;
  let result = base;
  for (const opp of oppTeam.players) {
    const d = distance(base, opp.pos);
    if (d >= markerRange) continue;
    const away = sub(base, opp.pos);
    if (length(away) <= 1e-6) continue;
    const strength = (1 - d / markerRange) * p.markerAvoidStepDistance;
    result = add(result, scale(normalize(away), strength));
  }
  return result;
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
 * 味方が minSpacing 未満に近づいていれば離れる方向へ target を補正する。
 *
 * minSpacing は固定値ではなく、自分の mental の偏差でその場ごとに振れる。固定値のままだと
 * 全員が同じ間隔を保とうとして正三角形に近い均等配置に収束して見える（ユーザー指摘、
 * 2026-08-16）。mental が高い（独立心が強い/自分のスペースを主張する）選手ほど広い間隔を
 * 要求し、低い選手は密集を許容する、という個性の差をそのまま「一人だけ大きく開く」
 * 非対称な陣形として表現する狙い（receivingDistanceFactor の mental 依存と同じ考え方）。
 */
function applyTeammateRepulsion(player: Player, target: Vec2, myTeam: Team, p: GameConfig["ai"]["positioning"]): Vec2 {
  const minSpacing = Math.max(
    0,
    p.minSpacing + (player.params.mental - 0.5) * p.minSpacingMentalSpread
  );
  let result = target;
  for (const mate of myTeam.players) {
    if (mate.id === player.id) continue;
    const d = distance(player.pos, mate.pos);
    if (d < minSpacing) {
      const away = sub(player.pos, mate.pos);
      if (length(away) > 1e-6) {
        const strength = ((minSpacing - d) / minSpacing) * p.repulsionWeight;
        result = add(result, scale(normalize(away), strength));
      }
    }
  }
  return result;
}

/**
 * バックサポート位置: ボールから自ゴール方向へ backSupportDistanceFactor 分だけ下がった地点。
 * 受け手ポジション（前方）と同じくマーカー回避・home とのxブレンドを行うが、ゴール方向とは
 * 逆向きに使うだけで、ロジックの骨格は selectReceivingDistance 側の base 計算と対称にしている。
 */
function computeBackSupportTarget(
  player: Player,
  home: Vec2,
  ballPos: Vec2,
  own: Vec2,
  oppTeam: Team,
  config: GameConfig
): Vec2 {
  const p = config.ai.positioning;
  const towardOwnGoalDir = normalize(sub(own, ballPos));
  // receivingDistanceFactor同様、mentalの偏差で距離をばらつかせる。低いほど深く下がりたがる
  // （backSupportChanceBaseと同じ向き）。
  const backSupportDistanceFactor = Math.max(
    0,
    p.backSupportDistanceFactor - (player.params.mental - 0.5) * p.backSupportDistanceMentalSpread
  );
  const backDistance = config.ai.passDistance * backSupportDistanceFactor;
  const base = length(towardOwnGoalDir) < 1e-6 ? home : add(ballPos, scale(towardOwnGoalDir, backDistance));

  const openSpot = applyMarkerAvoidance(base, oppTeam, config);
  return {
    x: (openSpot.x + home.x) / 2,
    y: openSpot.y * (1 - p.receivingHomeBlendY) + home.y * p.receivingHomeBlendY,
  };
}

/**
 * 横サポート位置: ボールとほぼ同じ前進度（y）を保ったまま、home.x と逆サイドへ
 * lateralSupportDistanceFactor 分だけ開いた地点。サイドチェンジ・落としてからの
 * 展開先として、前進（縦）ともバックサポート（後退）とも異なる第三の選択肢を提供する。
 * home.x が中央寄り（ほぼ0）の選手は、代わりにボールに対して逆サイドへ開く。
 */
function computeLateralSupportTarget(player: Player, home: Vec2, ballPos: Vec2, oppTeam: Team, config: GameConfig): Vec2 {
  const p = config.ai.positioning;
  // lateralSupportChanceBaseと同じくvisionで距離をばらつかせる。広いほど大きく開く。
  const lateralSupportDistanceFactor = Math.max(
    0,
    p.lateralSupportDistanceFactor + (player.params.vision / 180 - 0.5) * p.lateralSupportDistanceVisionSpread
  );
  const lateralDistance = config.ai.passDistance * lateralSupportDistanceFactor;
  const awaySign = Math.abs(home.x) > 1e-6 ? -Math.sign(home.x) : Math.sign(ballPos.x) > 0 ? -1 : 1;
  const base = { x: ballPos.x + awaySign * lateralDistance, y: ballPos.y };

  const openSpot = applyMarkerAvoidance(base, oppTeam, config);
  return {
    x: openSpot.x,
    y: openSpot.y * (1 - p.receivingHomeBlendY) + home.y * p.receivingHomeBlendY,
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
 *   3. pressure: pressDistance 以内の敵ボール保持者へ、mental に応じて詰め寄る
 *
 * 敵がボールを持っていない場合（味方保持 or フリーボール）:
 *   ボールから攻撃ゴール方向へ passDistance の6割ほど進んだ「受け手ポジション」を狙い、
 *   近くの敵マーカーから離れる方向へずらす（features_1 §4.1）。
 *
 * 最後に、味方が minSpacing 未満に近づいていれば離れる方向へ補正する（teammateRepulsion）。
 */
function computeTargetPosition(
  player: Player,
  state: GameState,
  config: GameConfig,
  onIntentChange?: IntentChangeCallback
): Vec2 {
  const { ball } = state;
  const oppTeam = state.teams[opposite(player.team)];
  const carrier = ball.possessorId !== null ? oppTeam.players.find((o) => o.id === ball.possessorId) : undefined;

  // Cover/Press（敵保持中）・Support系（味方保持中/フリーボール）はいずれも
  // マイルストーンN-4/N-2でintent機構に移した。repulsion適用まで各resolve関数の
  // 中で完結させるため、ここでは早期returnするだけにする。
  return carrier !== undefined
    ? resolveDefensiveIntentTarget(player, state, config, carrier, onIntentChange)
    : resolveSupportIntentTarget(player, state, config, onIntentChange);
}

type DefensiveFamilyIntentType = "Cover" | "Press";

const DEFENSIVE_INTENT_TYPES: readonly PlayerIntentType[] = ["Cover", "Press"];

/**
 * 敵ボール保持中の「基本カバーポジション」を計算する（Press判定より前段の共通処理）。
 * ボール追従・ボール-自ゴール線への射影・ゴール前危険度に応じた戻りとゴール幅カバーを
 * 合成する。Press intentのときもこの基準位置に詰め寄りブレンドを上乗せするだけなので、
 * どちらの intent でも必ずこの計算を通る。
 */
function computeCoverBaselineTarget(player: Player, ballPos: Vec2, config: GameConfig): Vec2 {
  const home = formationPos(player.team, player.role, config);
  const own = ownGoal(player.team, config);
  const p = config.ai.positioning;

  const idealFollowDist = distance(home, own) * p.ballPullWeight;
  let target = add(home, clampMagnitude(sub(ballPos, home), idealFollowDist));

  const lineVec = sub(ballPos, own);
  const lineLenSq = lineVec.x * lineVec.x + lineVec.y * lineVec.y;
  if (lineLenSq > 1e-6) {
    const t = Math.max(0, Math.min(1, ((target.x - own.x) * lineVec.x + (target.y - own.y) * lineVec.y) / lineLenSq));
    const projected = add(own, scale(lineVec, t));
    target = add(target, scale(sub(projected, target), p.coverWeight));
  }

  // ゴール前カバーは coverWeight により全員が「ボール-自ゴール中心」の同一線上に
  // 収束するため、ボールが自陣深くまで来ても中央1点に団子化してポストが空きがちだった
  // （ユーザー指摘、2026-08-08）。ボールが goalCoverDangerDistance 圏内に入ったら、
  // home.x の符号・大きさ（DF=中央/MF=左寄り/FW=右寄り、features_1のフォーメーション比率）
  // に応じてゴール幅方向へ広がるよう横方向にオフセットし、簡易的な「壁」を作る。
  // 役割で分岐せず home.x という連続値だけを使うため、フォーメーションを変えれば
  // 広がり方も自然に追従する。
  const distToOwnGoal = distance(ballPos, own);
  const danger = Math.max(0, Math.min(1, 1 - distToOwnGoal / p.goalCoverDangerDistance));
  if (danger > 0) {
    // 上のcoverWeight射影は「ホームからidealFollowDist以内でボールへ寄った点」を線に
    // 投影するだけなので、ホームが浅い選手（MF/FW）は危険度が上がっても射影先(t)が
    // ゴール寄りに寄り切らず、自ゴールへの戻りが途中で頭打ちになっていた
    // （ユーザー指摘、2026-08-08。攻め上がった選手のリカバリーを再現するテストで確認）。
    // 危険度に比例して target.y を own.y へ直接引き寄せることで、コース射影の限界に
    // 関係なく確実にゴール方向へ戻る力を保証する。
    target.y += (own.y - target.y) * danger * p.goalRecallWeight;
    if (Math.abs(home.x) > 1e-6) {
      target.x += Math.sign(home.x) * p.goalMouthSpreadDistance * danger;
    }
  }

  return target;
}

/**
 * Cover/Press のどちらを選ぶか（マイルストーンN-4）。RNG消費順序は旧
 * `computeTargetPosition` のcarrier分岐と完全に同じ順序を保つ（pressDistance圏外なら
 * chance()を消費せず即Cover）。
 */
function chooseDefensiveIntentType(
  player: Player,
  state: GameState,
  config: GameConfig,
  carrier: Player
): DefensiveFamilyIntentType {
  const p = config.ai.positioning;
  const myTeam = state.teams[player.team];
  const own = ownGoal(player.team, config);

  const dCarrier = distance(player.pos, carrier.pos);
  if (dCarrier > p.pressDistance) return "Cover";

  // 詰め寄るかどうかは役割ではなく mental に応じた確率で決める。mental が高い選手ほど
  // 積極的に前へ出る傾向がにじみ出る（features_1/開発メモの「役割分岐にしない」方針に沿う）。
  let pressChance = Math.max(0, Math.min(1, p.pressChanceBase + (player.params.mental - 0.5) * p.pressChanceSpread));
  // pressDistance がピッチ規模に対して広いため、3人全員が同時に詰め寄り候補になり
  // ゴール前のカバーが誰もいなくなる場面が頻発していた（ユーザー指摘、2026-08-08）。
  // 最も自ゴールに近い選手（＝その瞬間の最終ライン）だけはプレスを抑制し、カバー
  // リング位置に留まりやすくする。役割固定ではなく毎ターンの実位置で判定するため、
  // 誰が最終ラインを担うかは局面に応じて入れ替わる。
  if (isLastManBack(player, myTeam, own)) {
    pressChance *= p.lastManPressSuppression;
  }
  return chance(state, pressChance) ? "Press" : "Cover";
}

/**
 * 選択済みの意図種別に対する目標地点を、毎ターン再計算する（`target` は intent に
 * 持たせず、type だけを固定する設計。`specification/features_intent_state_machine.md`）。
 * Press でも常にcoverベース位置を土台にする — dCarrierがpressDistanceを超えていれば
 * 詰め寄りブレンドは自動的にスキップされ、Coverと同じ目標地点になる（intentの種別は
 * Pressのまま維持しつつ、実際の追従は現在の距離に応じて毎ターン調整される）。
 */
function computeDefensiveIntentTarget(
  type: DefensiveFamilyIntentType,
  player: Player,
  state: GameState,
  config: GameConfig,
  carrier: Player
): Vec2 {
  const { ball } = state;
  const p = config.ai.positioning;
  const myTeam = state.teams[player.team];
  const own = ownGoal(player.team, config);

  let target = computeCoverBaselineTarget(player, ball.pos, config);

  if (type === "Press") {
    const dCarrier = distance(player.pos, carrier.pos);
    if (dCarrier <= p.pressDistance) {
      const strength = p.pressWeight * player.params.mental;
      target = add(target, scale(sub(computeApproachPoint(player, carrier, myTeam, own, p), target), strength));
    }
  }

  return applyTeammateRepulsion(player, target, myTeam, p);
}

function resolveDefensiveIntentTarget(
  player: Player,
  state: GameState,
  config: GameConfig,
  carrier: Player,
  onIntentChange?: IntentChangeCallback
): Vec2 {
  const isDefensiveFamily = DEFENSIVE_INTENT_TYPES.includes(player.intent.type);
  const expired = isDefensiveFamily && state.turn - player.intent.startedAtTurn >= player.intent.maxDurationTurns;

  if (!isDefensiveFamily || expired) {
    const type = chooseDefensiveIntentType(player, state, config, carrier);
    if (onIntentChange && player.intent.type !== type) onIntentChange(player.id, player.intent.type, type);
    const { min, max } =
      type === "Press"
        ? { min: config.ai.intent.pressMinDurationTurns, max: config.ai.intent.pressMaxDurationTurns }
        : { min: config.ai.intent.coverMinDurationTurns, max: config.ai.intent.coverMaxDurationTurns };
    player.intent = { type, startedAtTurn: state.turn, minDurationTurns: min, maxDurationTurns: max };
  }

  return computeDefensiveIntentTarget(player.intent.type as DefensiveFamilyIntentType, player, state, config, carrier);
}

type SupportFamilyIntentType = "Support" | "BackSupport" | "LateralSupport";

const SUPPORT_INTENT_TYPES: readonly PlayerIntentType[] = ["Support", "BackSupport", "LateralSupport"];

/**
 * 味方保持中/フリーボール時の非保持選手が Support/BackSupport/LateralSupport のどれを
 * 選ぶか。RNG消費順序は旧 `computeTargetPosition` の else 分岐と完全に同じ順序を保つ
 * （BackSupport判定 → [avoidanceEnabled時のみ] LateralSupport判定）。
 *
 * かつて `WaitOnside`/`RunBehind`（マイルストーンN-3、オフサイドライン付近で「待つ」
 * 「抜ける」を分ける状態）をここに追加していたが、目標地点をオフサイドラインに直接
 * 連動させる設計だったため、GK不在で守備側がボール際に深く集まりラインごと自陣まで
 * 下がる場面（このゲームで頻発）に前線選手が丸ごと追従してしまい、平均得点0.00まで
 * 崩壊する問題が解決できず撤去した（ユーザー指摘、2026-08-14。詳細は
 * `specification/features_intent_state_machine.md` 参照）。
 */
function chooseSupportIntentType(player: Player, state: GameState, config: GameConfig): SupportFamilyIntentType {
  const p = config.ai.positioning;

  // 味方保持中/フリーボール時、受け手ポジションは常にボールより前方にしか生まれない
  // 構造だと、保持者が孤立していてもバックパスという選択肢自体が存在しなかった
  // （ユーザー指摘、2026-08-08）。mental が低い選手ほど、前進した受け手位置
  // ではなくボールより自ゴール側の「バックサポート」位置を目指す確率を毎ターン振り、
  // 役割分岐ではなくパラメータの違いがそのまま前方/後方志向の差ににじみ出るようにする。
  const backSupportChance = Math.max(
    0,
    Math.min(1, p.backSupportChanceBase - (player.params.mental - 0.5) * p.backSupportMentalSpread)
  );
  if (chance(state, backSupportChance)) return "BackSupport";

  // 前進（縦）とバックサポート（後退）の二択だけだと、前進レーンが塞がれた場面
  // （オフサイド回避で前進が抑えられているときなど）の代替手段が乏しい。ボールとほぼ
  // 同じ前進度を保ったまま逆サイドへ開く「横サポート」を第三の選択肢として加える
  // （`specification/features_offside.md` の反則化崩壊を受けた対策、設計は会話ログ参照）。
  // vision が広い選手ほど幅を使ったプレーを選びやすい。offsideRiskDribbleBoost と同様、
  // avoidanceEnabled が無効なときは isOffside 系の評価自体が無意味なので分岐に入らず、
  // chance() の乱数消費すら行わない（デフォルトのゲームバランス・RNG列に一切影響しない。
  // balance-checkで確認済み: 乱数だけ消費する形にすると offside 無効時でも勝敗分布が
  // 変わってしまった）。
  if (config.ai.offside.avoidanceEnabled) {
    const lateralSupportChance = Math.max(
      0,
      Math.min(1, p.lateralSupportChanceBase + (player.params.vision / 180 - 0.5) * p.lateralSupportVisionSpread)
    );
    if (chance(state, lateralSupportChance)) return "LateralSupport";
  }

  return "Support";
}

/**
 * 選択済みの意図種別に対する目標地点を、毎ターン再計算する（`target` は intent に
 * 持たせず、type だけを固定する設計。`specification/features_intent_state_machine.md`）。
 * repulsion 適用までこの関数の中で完結させる。
 */
function computeSupportIntentTarget(
  type: SupportFamilyIntentType,
  player: Player,
  state: GameState,
  config: GameConfig
): Vec2 {
  const home = formationPos(player.team, player.role, config);
  const own = ownGoal(player.team, config);
  const { ball } = state;
  const p = config.ai.positioning;
  const myTeam = state.teams[player.team];
  const oppTeam = state.teams[opposite(player.team)];

  if (type === "BackSupport") {
    return applyTeammateRepulsion(
      player,
      computeBackSupportTarget(player, home, ball.pos, own, oppTeam, config),
      myTeam,
      p
    );
  }
  if (type === "LateralSupport") {
    return applyTeammateRepulsion(
      player,
      computeLateralSupportTarget(player, home, ball.pos, oppTeam, config),
      myTeam,
      p
    );
  }

  const goal = attackGoal(player.team, config);
  const towardGoalDir = normalize(sub(goal, ball.pos));
  // 固定係数のままだと全選手がボールから常に同じ距離を取り、「同じ辺の長さの三角形」を
  // 維持しているように見えてしまう（ユーザー指摘、2026-08-14）。mentalが高いほど遠くへ
  // 飛び出したがる、という個性の差をそのまま距離のばらつきにする。
  const receivingDistanceFactor = Math.max(
    0,
    p.receivingDistanceFactor + (player.params.mental - 0.5) * p.receivingDistanceMentalSpread
  );
  let receivingDistance = config.ai.passDistance * receivingDistanceFactor;
  // 受け手ポジションの前進距離を「ボールからゴールまでの残り距離」の一定割合でも頭打ちにする
  // （方式A: features_positioning_redesign.md）。相手の実位置を一切参照しないため、相手の
  // 守備ポジショニングと相互に反応し合うフィードバックループが構造的に発生しない。
  if (config.ai.offside.avoidanceEnabled) {
    const remainingToGoal = distance(ball.pos, goal);
    const maxForward = Math.min(receivingDistance, remainingToGoal * config.ai.offside.forwardReachFraction);
    // 方式Aの上限内で、前進度・オフサイドライン超過量・相手DFとの到達時間差を
    // 同時にスコアリングして最良の前進距離を選ぶ（方式D）。
    receivingDistance = selectReceivingDistance(player, ball.pos, towardGoalDir, maxForward, player.team, oppTeam, config);
  }
  const base = length(towardGoalDir) < 1e-6 ? home : add(ball.pos, scale(towardGoalDir, receivingDistance));

  const openSpot = applyMarkerAvoidance(base, oppTeam, config);
  // x同様にyもhomeと少しブレンドする。以前はyをopenSpotのまま採用していたため、ボール保持中の
  // 非保持選手が全員「ボールから同じ前進距離だけ進んだ同じ高さ」に並び、役割に関わらず
  // 常に同じ横一列の陣形に見えてしまっていた（ユーザー指摘、2026-08-08）。receivingHomeBlendY
  // の比率だけhomeへ寄せることで、DF役割（home が自ゴール寄り）は上がりすぎず、FW役割は
  // 高い位置を取るという役割ごとの差がにじみ出るようにする（xのような50/50ブレンドだと
  // 前進が阻害され得点が壊滅する非線形な閾値があったため、小さめの比率に留めている）。
  const target = {
    x: (openSpot.x + home.x) / 2,
    y: openSpot.y * (1 - p.receivingHomeBlendY) + home.y * p.receivingHomeBlendY,
  };
  return applyTeammateRepulsion(player, target, myTeam, p);
}

/**
 * マイルストーンN-2: Support/BackSupport/LateralSupport を intent 機構で管理する。
 * 種別選択（`chance()` を伴う）は maxDurationTurns 経過まで固定し、目標地点は
 * 種別が同じでも毎ターン再計算する（ボール追従が古くならないようにするため。
 * 設計判断の詳細は `specification/features_intent_state_machine.md` 参照）。
 */
function resolveSupportIntentTarget(
  player: Player,
  state: GameState,
  config: GameConfig,
  onIntentChange?: IntentChangeCallback
): Vec2 {
  const isSupportFamily = SUPPORT_INTENT_TYPES.includes(player.intent.type);
  const expired = isSupportFamily && state.turn - player.intent.startedAtTurn >= player.intent.maxDurationTurns;

  if (!isSupportFamily || expired) {
    const type = chooseSupportIntentType(player, state, config);
    if (onIntentChange && player.intent.type !== type) onIntentChange(player.id, player.intent.type, type);
    player.intent = {
      type,
      startedAtTurn: state.turn,
      minDurationTurns: config.ai.intent.supportMinDurationTurns,
      maxDurationTurns: config.ai.intent.supportMaxDurationTurns,
    };
  }

  return computeSupportIntentTarget(player.intent.type as SupportFamilyIntentType, player, state, config);
}

function decideDefensiveAction(
  player: Player,
  state: GameState,
  config: GameConfig,
  onIntentChange?: IntentChangeCallback
): void {
  player.state = "Marking";
  moveToward(player, computeTargetPosition(player, state, config, onIntentChange), config);
}

/** 味方がボールを持っている間の受け手ポジショニング。 */
function decideSupportAction(
  player: Player,
  state: GameState,
  config: GameConfig,
  onIntentChange?: IntentChangeCallback
): void {
  player.state = "MovingToSpace";
  moveToward(player, computeTargetPosition(player, state, config, onIntentChange), config);
}

/**
 * マイルストーンN-1（`specification/features_intent_state_machine.md`）: `ChaseLooseBall`
 * 意図のみを Player.intent 機構で管理する最小検証ステップ。intentの「種別」だけを固定し、
 * 実際の目標地点（ここでは ball.pos）は毎ターン再計算する（設計上の判断: targetをintentに
 * 持たせるとボール追従が古くなるため）。
 *
 * 既にChaseLooseBall中なら、ボールに追いついた（reachedTarget）か
 * chaseLooseBallMaxDurationTurns 経過（intentExpired）するまで、毎タームの
 * 「誰が最寄りか」の再計算をスキップして同じ選手が追い続ける（役割の毎ターム反転防止）。
 */
function decideFreeBallAction(
  player: Player,
  state: GameState,
  config: GameConfig,
  onIntentChange?: IntentChangeCallback
): void {
  const { ball } = state;
  const myTeam = state.teams[player.team];

  const reachedBall = distance(player.pos, ball.pos) < config.ai.moveStopThreshold;
  const intentExpired =
    player.intent.type === "ChaseLooseBall" &&
    state.turn - player.intent.startedAtTurn >= player.intent.maxDurationTurns;

  // 「最寄りかどうか」を再判定するのは、まだChaseLooseBall中でない/ボールに追いついた/
  // 期限切れのときだけ。これを毎ターン無条件に行うと、既にSupport系intentを持っている
  // 非最寄り選手（intent.typeが"ChaseLooseBall"以外）が毎ターンここを通過するたびに
  // Idleへ強制リセットされてしまい、N-2で入れたSupport系のminDuration/maxDuration
  // スティッキネスがフリーボール中だけ効かなくなるバグがあった（状態遷移ログ導入時に発見）。
  if (player.intent.type !== "ChaseLooseBall" || reachedBall || intentExpired) {
    let nearestTeammate = player;
    let nearestDist = distance(player.pos, ball.pos);
    for (const p of myTeam.players) {
      const d = distance(p.pos, ball.pos);
      if (d < nearestDist) {
        nearestDist = d;
        nearestTeammate = p;
      }
    }

    const shouldChase =
      nearestTeammate.id === player.id && distance(player.pos, ball.pos) <= config.ai.visionDistance;
    if (shouldChase) {
      if (onIntentChange && player.intent.type !== "ChaseLooseBall") {
        onIntentChange(player.id, player.intent.type, "ChaseLooseBall");
      }
      player.intent = {
        type: "ChaseLooseBall",
        startedAtTurn: state.turn,
        minDurationTurns: 0,
        maxDurationTurns: config.ai.intent.chaseLooseBallMaxDurationTurns,
      };
    } else if (player.intent.type === "ChaseLooseBall") {
      // ChaseLooseBallを卒業する。実際にどのSupport系intentへ移るかは、この関数の末尾で
      // 呼ぶ computeTargetPosition -> resolveSupportIntentTarget に委ねる（ここで先に
      // 具体的な型を決め打ちしない）。
      if (onIntentChange) onIntentChange(player.id, player.intent.type, "Idle");
      player.intent = { type: "Idle", startedAtTurn: state.turn, minDurationTurns: 0, maxDurationTurns: 0 };
    }
    // shouldChase===false かつ 現在の型が既にChaseLooseBall以外（Support系など）の場合は
    // 何もしない。既存の意図（と残りduration）をそのまま維持し、reselectするかどうかは
    // resolveSupportIntentTarget側のmin/maxDuration管理に委ねる。
  }

  if (player.intent.type === "ChaseLooseBall") {
    player.state = "BallTracking";
    moveToward(player, ball.pos, config);
  } else {
    // フリーボールでも定位置ぴったりへは戻さない。パス/シュートの直後は誰も保持していない
    // 時間が長く続くため、ここが素の formationPos だと味方の大半が毎回そこへ引き戻されて
    // しまい、「受けるための動き」が起きる前に消えてしまっていた。
    player.state = "MovingToSpace";
    moveToward(player, computeTargetPosition(player, state, config, onIntentChange), config);
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
 *
 * @param onIntentChange 選手の `intent.type` が切り替わるたびに呼ばれる任意コールバック
 *   （状態遷移ログ用。`specification/選手思考の状態遷移を検討.md` 第5段階）。
 */
export function decideAction(
  player: Player,
  state: GameState,
  config: GameConfig,
  onIntentChange?: IntentChangeCallback
): void {
  const { ball } = state;

  // タックルで奪われた/かわされた直後の怯み中は、その場で停止して通常の意思決定をしない。
  if (player.stunTurns > 0) {
    player.stunTurns -= 1;
    player.vel = { x: 0, y: 0 };
    player.state = "Idle";
    return;
  }

  if (ball.possessorId === player.id) {
    decidePossessionAction(player, state, config);
    return;
  }

  const myTeam = state.teams[player.team];
  const possessorIsTeammate =
    ball.possessorId !== null && myTeam.players.some((p) => p.id === ball.possessorId);
  const possessorIsOpponent = ball.possessorId !== null && !possessorIsTeammate;

  if (possessorIsOpponent) {
    decideDefensiveAction(player, state, config, onIntentChange);
    return;
  }

  if (possessorIsTeammate) {
    decideSupportAction(player, state, config, onIntentChange);
    return;
  }

  decideFreeBallAction(player, state, config, onIntentChange);
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
