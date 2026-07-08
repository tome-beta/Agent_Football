import type { Player, PlayerParams, Role, TeamSide, Vec2, GameState, GameConfig } from "../types";

export function createPlayer(
  id: string,
  team: TeamSide,
  role: Role,
  params: PlayerParams,
  pos: Vec2
): Player {
  return {
    id,
    team,
    role,
    params,
    pos,
    vel: { x: 0, y: 0 },
    state: "Idle",
  };
}

export function decideAction(player: Player, state: GameState, config: GameConfig): void {
  throw new Error("not implemented");
}

export function stepPlayer(player: Player, config: GameConfig): void {
  throw new Error("not implemented");
}
