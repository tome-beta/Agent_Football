import type { Vec2 } from "../types";

/** ベクトル加算。 */
export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** ベクトル減算（a - b）。 */
export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** スカラー倍。 */
export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

/** ベクトルの大きさ（ユークリッドノルム）。 */
export function length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** 単位ベクトルに正規化する。零ベクトルは零ベクトルのまま返す（0除算を避ける）。 */
export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/** 2点間のユークリッド距離。 */
export function distance(a: Vec2, b: Vec2): number {
  return length(sub(a, b));
}

/** 点 `point` と、線分 `segA`-`segB` との最短距離。線分が点に潰れている場合は単純な2点間距離になる。 */
export function distanceToSegment(point: Vec2, segA: Vec2, segB: Vec2): number {
  const segVec = sub(segB, segA);
  const segLenSq = segVec.x * segVec.x + segVec.y * segVec.y;
  if (segLenSq < 1e-9) return distance(point, segA);

  const t = Math.max(0, Math.min(1, ((point.x - segA.x) * segVec.x + (point.y - segA.y) * segVec.y) / segLenSq));
  const projected = add(segA, scale(segVec, t));
  return distance(point, projected);
}

/** ベクトルの大きさが max を超えていたら、向きを保ったまま max まで縮める。 */
export function clampMagnitude(v: Vec2, max: number): Vec2 {
  const len = length(v);
  if (len <= max) return v;
  return scale(normalize(v), max);
}
