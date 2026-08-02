import type { Vec2, TeamSide, Team, GameConfig } from "../types";

/** 攻撃方向を+とした進行度（Aは+y、Bは-yが攻撃方向）。 */
function advancement(pos: Vec2, side: TeamSide): number {
  return side === "A" ? pos.y : -pos.y;
}

/**
 * 攻撃側 side から見たオフサイドラインのy座標（許容誤差は含まない）。
 * 「相手最終ライン」と「ボール位置」のうち、より攻撃方向に進んでいる方を採用する
 * （FIFAの本質どおり。ボールより深い相手最終ラインの位置だけを基準にすると、
 * ボールが前に運ばれている場面でも受け手が不自然に押し戻される問題があった）。
 *
 * GKが存在しないため「後ろから2番目の相手選手」の代わりに、守備側の中で自ゴールに
 * 最も近い1人（＝攻撃方向に最も進んだ選手）を最終ラインとする。
 */
export function offsideLineY(side: TeamSide, defendingTeam: Team, ballPos: Vec2, config: GameConfig): number {
  const lastDefenderAdv = Math.max(...defendingTeam.players.map((p) => advancement(p.pos, side)));
  const lineAdv = Math.max(advancement(ballPos, side), lastDefenderAdv);
  return side === "A" ? lineAdv : -lineAdv;
}

/**
 * レシーバーがオフサイドポジションにいるか判定する（`specification/features_offside.md`）。
 * 判定対象はパスのみで、自陣ハーフルール（自陣にいる限りオフサイドにならない例外）は
 * 簡略化のため省略する。
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
  const lineY = offsideLineY(side, defendingTeam, ballPosAtKick, config);
  const tolerance = config.ai.offside.lineToleranceMeters;
  return side === "A" ? receiverPos.y > lineY + tolerance : receiverPos.y < lineY - tolerance;
}
