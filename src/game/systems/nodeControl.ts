import { areSameHex } from "../model/hex";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";

export type NodeControlResolution = {
  capturedNeutral: number;
  capturedEnemy: number;
};

export function resolveEndPhaseNodeControl(state: GameState, playerId: PlayerId): NodeControlResolution {
  let capturedNeutral = 0;
  let capturedEnemy = 0;

  for (const node of state.map.resourceNodes) {
    const occupyingFriendlyUnit = Object.values(state.entities).find(
      (entity) => entity.kind === "unit" && entity.ownerId === playerId && areSameHex(entity.coord, node.coord)
    );
    if (!occupyingFriendlyUnit) {
      continue;
    }

    if (node.controlledBy === playerId) {
      continue;
    }

    const previousController = node.controlledBy;
    node.controlledBy = playerId;

    if (previousController) {
      capturedEnemy += 1;
      state.log.push({
        turn: state.turn,
        text: `${playerId} seized ${node.displayName} (${node.id}) from ${previousController}.`,
      });
    } else {
      capturedNeutral += 1;
      state.log.push({
        turn: state.turn,
        text: `${playerId} captured ${node.displayName} (${node.id}).`,
      });
    }
  }

  return {
    capturedNeutral,
    capturedEnemy,
  };
}
