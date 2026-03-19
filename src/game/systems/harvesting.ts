import { areSameHex, hexDistance } from "../model/hex";
import type { ResourceType } from "../model/enums";
import type { HexCoord, GameState, UnitEntity } from "../model/state";
import type { PlayerId } from "../model/ids";

type ResourceTally = Record<ResourceType, number>;

function createEmptyResourceTally(): ResourceTally {
  return {
    credits: 0,
    alloy: 0,
    flux: 0,
    biomass: 0,
  };
}

function getPlayerBase(state: GameState, playerId: PlayerId) {
  const baseId = state.players[playerId].baseEntityId;
  const base = state.entities[baseId];
  if (!base || base.kind !== "base") {
    return null;
  }
  return base;
}

export function isBaseAdjacentDropoffTile(state: GameState, playerId: PlayerId, coord: HexCoord): boolean {
  const base = getPlayerBase(state, playerId);
  if (!base) {
    return false;
  }

  return hexDistance(base.coord, coord) === 1;
}

export function getResourceNodeAtCoord(state: GameState, coord: HexCoord) {
  return state.map.resourceNodes.find((node) => areSameHex(node.coord, coord)) ?? null;
}

export function getResourceNodeById(state: GameState, nodeId: string) {
  return state.map.resourceNodes.find((node) => node.id === nodeId) ?? null;
}

export function resolveEconomyDeposits(state: GameState, playerId: PlayerId): { deposited: number; byResource: ResourceTally } {
  const byResource = createEmptyResourceTally();
  let deposited = 0;

  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "unit" || entity.ownerId !== playerId || !entity.carries) {
      continue;
    }

    if (!isBaseAdjacentDropoffTile(state, playerId, entity.coord)) {
      continue;
    }

    const carried = entity.carries;
    entity.carries = null;
    state.players[playerId].resources[carried] += 1;
    byResource[carried] += 1;
    deposited += 1;
    state.log.push({
      turn: state.turn,
      text: `${playerId} deposited 1 ${carried} from ${entity.id}.`,
    });
  }

  return { deposited, byResource };
}

export function canUnitHarvestNode(unit: UnitEntity, playerId: PlayerId): boolean {
  return unit.ownerId === playerId && unit.role === "resource" && unit.carries === null;
}
