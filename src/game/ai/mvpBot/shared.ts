import type { GameCommand } from "../../actions/commands";
import { getCardDefinition, type CardDefinition } from "../../content/cards/catalog";
import { getRegisteredCurrencyResourceId, getRegisteredResourceIds } from "../../content/registry";
import type { ResourceType } from "../../model/enums";
import { hexDistance } from "../../model/hex";
import type { PlayerId } from "../../model/ids";
import { getPrimaryResourceForFaction, type GameState, type HexCoord, type UnitEntity } from "../../model/state";
import { getPlayerUnits } from "../../model/queries";

export const AI_WEIGHTS = {
  // chooseTacticCardCommand thresholds
  tacticMainThreshold: 90,
  tacticTacticalThreshold: 55,

  // emergency combat scoring
  emergencyFactionBonus: 12,
  emergencyNeutralBonus: 4,
  emergencyOffFactionPenalty: -8,
  emergencyAttackMult: 4,
  emergencyHpMult: 2,
  emergencyArmorMult: 5,
  emergencyCostMult: 3,

  // main phase unit scoring - combat
  combatBase: 34,
  combatAttackMult: 5,
  combatHpMult: 1.5,
  combatArmorMult: 6,
  combatSecondUnitBonus: 10,
  combatFactionBonus: 10,
  combatOffFactionPenalty: -8,

  // main phase unit scoring - resource
  resourceFirstDeploy: 50,
  resourceAdditional: 22,
  resourceMissingBonus: 12,
  resourceExcessBase: -28,
  resourceExcessPerUnit: 10,
  resourceOutnumberedPenalty: -18,
  resourceOffFactionPenalty: -16,

  // main phase unit scoring - utility
  utilityFirstDeploy: 16,
  utilityAdditional: 8,
  utilityOutnumberedPenalty: -10,

  // main phase cost penalty
  deployCostMult: 4,

  // attack scoring
  attackKillScore: 100,
  attackBaseScore: 120,
  attackResourceUnitBonus: 22,
  attackUtilityUnitBonus: 10,
  attackCargoBonus: 14,

  // movement
  nearbyEnemyRadius: 3,
} as const;

export type ScoredCardCommand = {
  command: GameCommand;
  score: number;
  cardInstanceId: string;
  targetEntityId?: string;
  targetHex?: HexCoord;
};

export function getResourceOrder(): ResourceType[] {
  const resourceIds = getRegisteredResourceIds();
  return resourceIds.length > 0 ? resourceIds : [getRegisteredCurrencyResourceId()];
}

export function getHandCardDefinitions(state: GameState, botPlayerId: PlayerId): CardDefinition[] {
  return state.zones[botPlayerId].hand
    .map((cardInstance) => getCardDefinition(cardInstance.cardId))
    .filter((card): card is CardDefinition => Boolean(card));
}

export function getEconomyFocusCards(state: GameState, botPlayerId: PlayerId): CardDefinition[] {
  const handCards = getHandCardDefinitions(state, botPlayerId);
  const faction = state.players[botPlayerId].faction;
  const coreCards = handCards.filter((card) => card.faction === faction || card.faction === "neutral");
  return coreCards.length > 0 ? coreCards : handCards;
}

function getKnownEconomyCards(state: GameState, botPlayerId: PlayerId): CardDefinition[] {
  const playerZones = state.zones[botPlayerId];
  const knownCards = [...playerZones.hand, ...playerZones.deck, ...playerZones.discard]
    .map((cardInstance) => getCardDefinition(cardInstance.cardId))
    .filter((card): card is CardDefinition => Boolean(card));

  const faction = state.players[botPlayerId].faction;
  const coreCards = knownCards.filter((card) => card.faction === faction || card.faction === "neutral");
  return coreCards.length > 0 ? coreCards : knownCards;
}

export function getUnitRoleCounts(state: GameState, playerId: PlayerId): Record<"combat" | "resource" | "utility", number> {
  const counts = {
    combat: 0,
    resource: 0,
    utility: 0,
  };

  for (const unit of getPlayerUnits(state, playerId)) {
    counts[unit.role] += 1;
  }

  return counts;
}

function getPriorityOrderForResourceSet(
  resources: Set<ResourceType>,
  primaryResource: ResourceType,
  currencyFirst: boolean
): ResourceType[] {
  const ordered: ResourceType[] = [];
  const resourceOrder = getResourceOrder();
  const currencyResourceId = getRegisteredCurrencyResourceId();

  if (currencyFirst && resources.has(currencyResourceId)) {
    ordered.push(currencyResourceId);
  }

  if (resources.has(primaryResource) && !ordered.includes(primaryResource)) {
    ordered.push(primaryResource);
  }

  if (!currencyFirst && resources.has(currencyResourceId) && !ordered.includes(currencyResourceId)) {
    ordered.push(currencyResourceId);
  }

  for (const resource of resourceOrder) {
    if (ordered.includes(resource)) {
      continue;
    }
    if (resources.has(resource)) {
      ordered.push(resource);
    }
  }

  return ordered;
}

export function getPriorityResourceOrderFromHand(state: GameState, botPlayerId: PlayerId): ResourceType[] {
  const faction = state.players[botPlayerId].faction;
  const primaryResource = getPrimaryResourceForFaction(faction);
  const resources = state.players[botPlayerId].resources;
  const missingResources = new Set<ResourceType>();
  const requiredResources = new Set<ResourceType>();
  const knownResources = new Set<ResourceType>();
  const focusCards = getEconomyFocusCards(state, botPlayerId);
  const knownCards = getKnownEconomyCards(state, botPlayerId);
  const resourceOrder = getResourceOrder();

  for (const card of focusCards) {
    for (const resource of resourceOrder) {
      const required = card.cost[resource] ?? 0;
      if (required > 0) {
        requiredResources.add(resource);
        if (resources[resource] < required) {
          missingResources.add(resource);
        }
      }
    }
  }

  for (const card of knownCards) {
    for (const resource of resourceOrder) {
      if ((card.cost[resource] ?? 0) > 0) {
        knownResources.add(resource);
      }
    }
  }

  const missingPriority = getPriorityOrderForResourceSet(missingResources, primaryResource, true);
  if (missingPriority.length > 0) {
    return missingPriority;
  }

  const requiredPriority = getPriorityOrderForResourceSet(requiredResources, primaryResource, false);
  if (requiredPriority.length > 0) {
    return requiredPriority;
  }

  const knownPriority = getPriorityOrderForResourceSet(knownResources, primaryResource, true);
  if (knownPriority.length > 0) {
    return knownPriority;
  }

  return getPriorityOrderForResourceSet(new Set<ResourceType>([getRegisteredCurrencyResourceId(), primaryResource]), primaryResource, true);
}

export function shouldHarvestResourceType(state: GameState, botPlayerId: PlayerId, resourceType: ResourceType): boolean {
  const priorityOrder = getPriorityResourceOrderFromHand(state, botPlayerId);
  if (priorityOrder.length === 0) {
    return true;
  }

  return new Set(priorityOrder.slice(0, 2)).has(resourceType);
}

export function getSelectedOwnedUnit(state: GameState, playerId: PlayerId): UnitEntity | null {
  if (!state.selectedEntityId) {
    return null;
  }

  const selected = state.entities[state.selectedEntityId];
  if (!selected || selected.kind !== "unit" || selected.ownerId !== playerId) {
    return null;
  }

  return selected;
}

export function getClosestCoord(from: HexCoord, candidates: HexCoord[]): HexCoord | null {
  if (candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((a, b) => {
    const distanceA = hexDistance(from, a);
    const distanceB = hexDistance(from, b);
    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }
    if (a.q !== b.q) {
      return a.q - b.q;
    }
    return a.r - b.r;
  });

  return sorted[0] ?? null;
}
