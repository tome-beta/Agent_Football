import type { GameConfig } from "../types";
import { defaultConfig } from "../config/default";

/**
 * デフォルト設定に部分設定を重ねて GameConfig を作る。
 *
 * 各セクションは1階層だけ浅くマージする。team セクションのみ
 * roleParams / formation / tactics / names がさらにネストしているため個別に扱う。
 */
export function loadConfig(partial?: Partial<GameConfig>): GameConfig {
  if (!partial) {
    return defaultConfig;
  }

  return {
    pitch: { ...defaultConfig.pitch, ...partial.pitch },
    player: { ...defaultConfig.player, ...partial.player },
    ball: { ...defaultConfig.ball, ...partial.ball },
    ai: { ...defaultConfig.ai, ...partial.ai },
    team: {
      roleParams: { ...defaultConfig.team.roleParams, ...partial.team?.roleParams },
      formation: { ...defaultConfig.team.formation, ...partial.team?.formation },
      tactics: { ...defaultConfig.team.tactics, ...partial.team?.tactics },
      names: { ...defaultConfig.team.names, ...partial.team?.names },
    },
    match: { ...defaultConfig.match, ...partial.match },
    physics: { ...defaultConfig.physics, ...partial.physics },
    random: { ...defaultConfig.random, ...partial.random },
  };
}
