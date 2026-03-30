import { getRegisteredCurrencyResourceId, getRegisteredResourceIds } from "../content/registry";
import { areSameHex, hexDistance } from "../model/hex";
import type { ResourceType } from "../model/enums";
import { getConfiguredDepositAmount, getPrimaryResourceForFaction, type HexCoord, type GameState, type UnitEntity } from "../model/state";
import type { PlayerId } from "../model/ids";
import { getPlayerBase } from "../model/queries";

type ResourceTally = Record<ResourceType, number>;

function createEmptyResourceTally(): ResourceTally {
  return Object.fromEntries(getRegisteredResourceIds().map((resourceId) => [resourceId, 0])) as ResourceTally;
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
    const amount = getConfiguredDepositAmount(state.rules, carried);
    entity.carries = null;
    state.players[playerId].resources[carried] += amount;
    byResource[carried] += amount;
    deposited += amount;
    state.log.push({
      turn: state.turn,
      text: `${playerId} deposited ${amount} ${carried} from ${entity.id}.`,
    });
  }

  return { deposited, byResource };
}

export function resolveEconomyIncome(state: GameState, playerId: PlayerId): { granted: number; byResource: ResourceTally } {
  const byResource = createEmptyResourceTally();
  const player = state.players[playerId];
  const primary = getPrimaryResourceForFaction(player.faction);
  const currency = getRegisteredCurrencyResourceId();
  let granted = 0;

  const currencyAmount = state.rules.economyCurrencyIncome;
  if (currencyAmount > 0) {
    state.players[playerId].resources[currency] += currencyAmount;
    byResource[currency] += currencyAmount;
    granted += currencyAmount;
  }

  const primaryAmount = state.rules.economyPrimaryIncome;
  if (primaryAmount > 0) {
    state.players[playerId].resources[primary] += primaryAmount;
    byResource[primary] += primaryAmount;
    granted += primaryAmount;
  }

  if (granted > 0) {
    const segments: string[] = [];
    if (currencyAmount > 0) {
      segments.push(`${currencyAmount} ${currency}`);
    }
    if (primaryAmount > 0) {
      segments.push(`${primaryAmount} ${primary}`);
    }
    state.log.push({
      turn: state.turn,
      text: `${playerId} gained passive economy: ${segments.join(" and ")}.`,
    });
  }

  return { granted, byResource };
}

export function canUnitHarvestNode(unit: UnitEntity, playerId: PlayerId): boolean {
  return unit.ownerId === playerId && unit.role === "resource" && unit.carries === null;
}
