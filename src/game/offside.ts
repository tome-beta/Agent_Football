import type { Vec2, TeamSide, Team, GameConfig } from "../types";

/** 攻撃方向を+とした進行度（Aは+y、Bは-yが攻撃方向）。 */
function advancement(pos: Vec2, side: TeamSide): number {
  return side === "A" ? pos.y : -pos.y;
}

/**
 * レシーバーがオフサイドポジションにいるか判定する（`specification/features_offside.md`）。
 *
 * GKが存在しないため「後ろから2番目の相手選手」の代わりに、守備側の中で自ゴールに
 * 最も近い1人（＝攻撃方向に最も進んだ選手）を最終ラインとする。判定対象はパスのみで、
 * 自陣ハーフルール（自陣にいる限りオフサイドにならない例外）は簡略化のため省略する。
 *
 * @param ballPosAtKick パスを蹴った瞬間のボール位置（保持中は蹴り手の位置と一致する）。
 */
export function isOffside(
  receiverPos: Vec2,
  side: TeamSide,
  defendingTeam: Team,
  ballPosAtKick: Vec2,
  config: GameConfig
): boolean {
  const lastDefenderAdv = Math.max(...defendingTeam.players.map((p) => advancement(p.pos, side)));
  const offsideLineAdv = Math.max(advancement(ballPosAtKick, side), lastDefenderAdv);
  return advancement(receiverPos, side) > offsideLineAdv + config.ai.offside.lineToleranceMeters;
}

/**
 * 受け手ポジショニング用: 相手最終ラインだけを基準にしたオンサイド上限のy座標を返す
 * （`computeTargetPosition` がソフトな引き戻し力として使う。ボール位置は判定材料に含めない
 * — パス実行前は「実際にパスされる保証」がないため）。
 */
export function lastDefenderLineY(side: TeamSide, defendingTeam: Team, config: GameConfig): number {
  const lastDefenderAdv = Math.max(...defendingTeam.players.map((p) => advancement(p.pos, side)));
  return side === "A" ? lastDefenderAdv : -lastDefenderAdv;
}
