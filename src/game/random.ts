/**
 * 決定的乱数（mulberry32）。
 *
 * 仕様 features_1 §9.3 でパス・シュート・奪取の判定はすべて確率的にすると定めているが、
 * Math.random() を直接使うとユニットテストと試合の再現ができなくなる。
 * そのため乱数の状態は GameState.rngSeed として保持し、シリアライズ可能に保つ。
 */

export interface RngHolder {
  rngSeed: number;
}

/** 0 以上 1 未満の乱数を返し、holder.rngSeed を次の状態へ進める。 */
export function nextRandom(holder: RngHolder): number {
  holder.rngSeed = (holder.rngSeed + 0x6d2b79f5) | 0;
  let t = holder.rngSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** min 以上 max 未満の乱数。 */
export function nextRandomRange(holder: RngHolder, min: number, max: number): number {
  return min + nextRandom(holder) * (max - min);
}

/** 確率 p（0〜1）で true を返す。 */
export function chance(holder: RngHolder, p: number): boolean {
  return nextRandom(holder) < p;
}
