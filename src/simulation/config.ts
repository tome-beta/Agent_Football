import type { GameConfig } from "../types";
import { defaultConfig } from "../config/default";

/**
 * デフォルト設定に部分設定を重ねて GameConfig を作る。
 *
 * 各セクションは1階層だけ浅くマージする。team セクションと ai.positioning/ai.offside
 * （さらに ai.offside.kpp）はさらにネストしているため個別に扱う。
 *
 * `partial` 省略時も含め、返すオブジェクトは常に `defaultConfig` とは別インスタンスにする。
 * 以前は `partial` 省略時に `defaultConfig` をそのまま返しており、また ai.positioning/
 * ai.offside は1階層のマージ漏れで `defaultConfig` のオブジェクトを共有参照していた。
 * 呼び出し側が `config.ai.offside.avoidanceEnabled = true` のように直接書き換えると、
 * 以降すべての `loadConfig()` 呼び出し（同一プロセス内）に汚染が漏れる事故があった
 * （ユーザー指摘、2026-08-09。検証スクリプトで実際に踏んだ）。
 */
export function loadConfig(partial?: Partial<GameConfig>): GameConfig {
  const p = partial ?? {};

  return {
    pitch: { ...defaultConfig.pitch, ...p.pitch },
    player: { ...defaultConfig.player, ...p.player },
    ball: { ...defaultConfig.ball, ...p.ball },
    ai: {
      ...defaultConfig.ai,
      ...p.ai,
      positioning: { ...defaultConfig.ai.positioning, ...p.ai?.positioning },
      offside: {
        ...defaultConfig.ai.offside,
        ...p.ai?.offside,
        kpp: { ...defaultConfig.ai.offside.kpp, ...p.ai?.offside?.kpp },
      },
    },
    team: {
      roleParams: { ...defaultConfig.team.roleParams, ...p.team?.roleParams },
      formation: { ...defaultConfig.team.formation, ...p.team?.formation },
      tactics: { ...defaultConfig.team.tactics, ...p.team?.tactics },
      names: { ...defaultConfig.team.names, ...p.team?.names },
    },
    match: { ...defaultConfig.match, ...p.match },
    physics: { ...defaultConfig.physics, ...p.physics },
    random: { ...defaultConfig.random, ...p.random },
  };
}
