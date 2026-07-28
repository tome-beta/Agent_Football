import type { GameConfig } from "../types";

export const defaultConfig: GameConfig = {
  pitch: {
    width: 50,
    height: 75,
    goalWidth: 3.66,
  },
  player: {
    maxSpeed: 7,
    radius: 0.5,
  },
  ball: {
    radius: 0.11,
    friction: 0.98,
    maxSpeed: 30,
  },
  ai: {
    ballControlDistance: 1.5,
    passDistance: 15,
    shootDistance: 20,
    shootProbability: 0.3,
  },
  physics: {
    dt: 1,
  },
};
