import type { GameConfig } from "../types";
import { defaultConfig } from "../config/default";

export function loadConfig(partial?: Partial<GameConfig>): GameConfig {
  if (!partial) {
    return defaultConfig;
  }

  const merged: GameConfig = {
    pitch: { ...defaultConfig.pitch, ...partial.pitch },
    player: { ...defaultConfig.player, ...partial.player },
    ball: { ...defaultConfig.ball, ...partial.ball },
    ai: { ...defaultConfig.ai, ...partial.ai },
    physics: { ...defaultConfig.physics, ...partial.physics },
  };

  return merged;
}
