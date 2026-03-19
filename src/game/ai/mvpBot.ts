import type { GameCommand } from "../actions/commands";
import { getCardDefinition, type CardDefinition } from "../content/cards/catalog";
import { isCounterResponse } from "../content/stackEffects";
import { areSameHex, hexDistance, isWithinMapBounds } from "../model/hex";
import type { Faction, ResourceType } from "../model/enums";
import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, HexCoord, UnitEntity } from "../model/state";
import { resolveCombatAttack } from "../systems/combat";

const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

const RESOURCE_ORDER: ResourceType[] = ["credits", "alloy", "flux", "biomass"];
const PRIMARY_RESOURCE_BY_FACTION: Record<Faction, ResourceType> = {
  alloy_clan: "alloy",
  flux_collective: "flux",
  biomass_swarm: "biomass",
};

function getOpponentPlayer(playerId: PlayerId): PlayerId {
  return playerId === "player_1" ? "player_2" : "player_1";
}

function getPlayerUnits(state: GameState, playerId: PlayerId): UnitEntity[] {
  return Object.values(state.entities)
    .filter((entity): entity is UnitEntity => entity.kind === "unit" && entity.ownerId === playerId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getEnemyEntities(state: GameState, playerId: PlayerId): EntityState[] {
  return Object.values(state.entities)
    .filter((entity) => entity.ownerId !== playerId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function isCoordOccupied(state: GameState, coord: HexCoord): boolean {
  return Object.values(state.entities).some((entity) => areSameHex(entity.coord, coord));
}

function canAfford(state: GameState, playerId: PlayerId, cost: Partial<Record<"credits" | "alloy" | "flux" | "biomass", number>>): boolean {
  const resources = state.players[playerId].resources;
  return (
    resources.credits >= (cost.credits ?? 0) &&
    resources.alloy >= (cost.alloy ?? 0) &&
    resources.flux >= (cost.flux ?? 0) &&
    resources.biomass >= (cost.biomass ?? 0)
  );
}

function getHandCardDefinitions(state: GameState, botPlayerId: PlayerId): CardDefinition[] {
  return state.zones[botPlayerId].hand
    .map((cardInstance) => getCardDefinition(cardInstance.cardId))
    .filter((card): card is CardDefinition => Boolean(card));
}

function getEconomyFocusCards(state: GameState, botPlayerId: PlayerId): CardDefinition[] {
  const handCards = getHandCardDefinitions(state, botPlayerId);
  const faction = state.players[botPlayerId].faction;
  const coreCards = handCards.filter((card) => card.faction === faction || card.faction === "neutral");
  return coreCards.length > 0 ? coreCards : handCards;
}

function getPriorityOrderForResourceSet(resources: Set<ResourceType>, primaryResource: ResourceType, creditsFirst: boolean): ResourceType[] {
  const ordered: ResourceType[] = [];

  if (creditsFirst && resources.has("credits")) {
    ordered.push("credits");
  }

  if (resources.has(primaryResource) && !ordered.includes(primaryResource)) {
    ordered.push(primaryResource);
  }

  if (!creditsFirst && resources.has("credits") && !ordered.includes("credits")) {
    ordered.push("credits");
  }

  for (const resource of RESOURCE_ORDER) {
    if (ordered.includes(resource)) {
      continue;
    }
    if (resources.has(resource)) {
      ordered.push(resource);
    }
  }
  return ordered;
}

function getPriorityResourceOrderFromHand(state: GameState, botPlayerId: PlayerId): ResourceType[] {
  const faction = state.players[botPlayerId].faction;
  const primaryResource = PRIMARY_RESOURCE_BY_FACTION[faction];
  const resources = state.players[botPlayerId].resources;
  const missingResources = new Set<ResourceType>();
  const requiredResources = new Set<ResourceType>();
  const focusCards = getEconomyFocusCards(state, botPlayerId);

  for (const card of focusCards) {
    for (const resource of RESOURCE_ORDER) {
      const required = card.cost[resource] ?? 0;
      if (required > 0) {
        requiredResources.add(resource);
        if (resources[resource] < required) {
          missingResources.add(resource);
        }
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

  return getPriorityOrderForResourceSet(new Set<ResourceType>(RESOURCE_ORDER), primaryResource, true);
}

function shouldHarvestResourceType(state: GameState, botPlayerId: PlayerId, resourceType: ResourceType): boolean {
  const priorityOrder = getPriorityResourceOrderFromHand(state, botPlayerId);
  if (priorityOrder.length === 0) {
    return true;
  }

  return new Set(priorityOrder.slice(0, 2)).has(resourceType);
}

function getFirstOpenBaseAdjacentTile(state: GameState, playerId: PlayerId): HexCoord | null {
  const baseId = state.players[playerId].baseEntityId;
  const base = state.entities[baseId];
  if (!base || base.kind !== "base") {
    return null;
  }

  const candidates = HEX_DIRECTIONS.map((dir) => ({ q: base.coord.q + dir.q, r: base.coord.r + dir.r }));
  for (const coord of candidates) {
    if (!isWithinMapBounds(coord, state.map)) {
      continue;
    }
    if (!isCoordOccupied(state, coord)) {
      return coord;
    }
  }

  return null;
}

function getSelectedOwnedUnit(state: GameState, playerId: PlayerId): UnitEntity | null {
  if (!state.selectedEntityId) {
    return null;
  }

  const selected = state.entities[state.selectedEntityId];
  if (!selected || selected.kind !== "unit" || selected.ownerId !== playerId) {
    return null;
  }

  return selected;
}

function getClosestCoord(from: HexCoord, candidates: HexCoord[]): HexCoord | null {
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

function chooseCounterCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  const topItem = state.stack[state.stack.length - 1];
  if (!topItem || !topItem.counterable || topItem.controllerId === botPlayerId) {
    return null;
  }

  const hand = [...state.zones[botPlayerId].hand].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  for (const cardInstance of hand) {
    const card = getCardDefinition(cardInstance.cardId);
    if (!card || card.kind !== "tactic") {
      continue;
    }
    if (!isCounterResponse(card.stackEffectId)) {
      continue;
    }
    if (!canAfford(state, botPlayerId, card.cost)) {
      continue;
    }

    return {
      type: "PLAY_CARD",
      playerId: botPlayerId,
      cardInstanceId: cardInstance.instanceId,
      targetStackItemId: topItem.id,
    };
  }

  return null;
}

function chooseMainPhaseCardCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  const deployOpen = getFirstOpenBaseAdjacentTile(state, botPlayerId);
  const hand = [...state.zones[botPlayerId].hand].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  const resources = state.players[botPlayerId].resources;
  const focusCards = getEconomyFocusCards(state, botPlayerId);
  const hasMissingResourceForHand = focusCards.some((card) => {
    for (const resource of RESOURCE_ORDER) {
      if ((card.cost[resource] ?? 0) > resources[resource]) {
        return true;
      }
    }
    return false;
  });

  const scored = hand
    .map((cardInstance) => {
      const card = getCardDefinition(cardInstance.cardId);
      if (!card || !canAfford(state, botPlayerId, card.cost)) {
        return null;
      }

      if (card.kind === "unit") {
        if (!deployOpen) {
          return null;
        }

        const totalCost = (card.cost.credits ?? 0) + (card.cost.alloy ?? 0) + (card.cost.flux ?? 0) + (card.cost.biomass ?? 0);
        const roleScore =
          card.unit.role === "resource"
            ? hasMissingResourceForHand
              ? 45
              : 26
            : card.unit.role === "combat"
              ? 30 + card.unit.attackDamage + card.unit.hp * 0.25
              : 20;
        return {
          cardInstanceId: cardInstance.instanceId,
          score: roleScore - totalCost,
        };
      }

      return null;
    })
    .filter((entry): entry is { cardInstanceId: string; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score || a.cardInstanceId.localeCompare(b.cardInstanceId));

  const best = scored[0];
  if (!best) {
    return null;
  }

  return {
    type: "PLAY_CARD",
    playerId: botPlayerId,
    cardInstanceId: best.cardInstanceId,
  };
}

function chooseAttackCommand(state: GameState, botPlayerId: PlayerId, unit: UnitEntity): GameCommand | null {
  if (unit.role !== "combat" || unit.attacksRemaining <= 0 || unit.hasSummoningSickness) {
    return null;
  }

  const targets = getEnemyEntities(state, botPlayerId)
    .filter((target) => hexDistance(unit.coord, target.coord) <= unit.attackRange)
    .map((target) => {
      const preview = resolveCombatAttack(state, unit, target);
      const killScore = preview.targetDestroyed ? 100 : 0;
      const baseScore = target.kind === "base" ? 50 : 0;
      return {
        target,
        preview,
        score: killScore + baseScore + preview.finalDamage,
      };
    })
    .sort((a, b) => b.score - a.score || a.target.id.localeCompare(b.target.id));

  const best = targets[0];
  if (!best) {
    return null;
  }

  return {
    type: "ATTACK_UNIT",
    playerId: botPlayerId,
    attackerId: unit.id,
    targetId: best.target.id,
  };
}

function chooseHarvestCommand(state: GameState, botPlayerId: PlayerId, unit: UnitEntity): GameCommand | null {
  if (unit.role !== "resource" || unit.carries) {
    return null;
  }

  const node = state.map.resourceNodes.find((entry) => areSameHex(entry.coord, unit.coord));
  if (!node || node.controlledBy !== botPlayerId) {
    return null;
  }
  if (!shouldHarvestResourceType(state, botPlayerId, node.resourceType)) {
    return null;
  }

  return {
    type: "HARVEST_NODE",
    playerId: botPlayerId,
    entityId: unit.id,
    nodeId: node.id,
  };
}

function chooseResourceNodeObjective(state: GameState, botPlayerId: PlayerId, unit: UnitEntity): HexCoord | null {
  const resourcePriority = getPriorityResourceOrderFromHand(state, botPlayerId);

  for (const resource of resourcePriority) {
    const contestedNodes = state.map.resourceNodes
      .filter((node) => node.resourceType === resource && node.controlledBy !== botPlayerId)
      .map((node) => node.coord);
    const contestedTarget = getClosestCoord(unit.coord, contestedNodes);
    if (contestedTarget) {
      return contestedTarget;
    }

    const controlledNodes = state.map.resourceNodes
      .filter((node) => node.resourceType === resource && node.controlledBy === botPlayerId)
      .map((node) => node.coord);
    const controlledTarget = getClosestCoord(unit.coord, controlledNodes);
    if (controlledTarget) {
      return controlledTarget;
    }
  }

  const anyContested = getClosestCoord(
    unit.coord,
    state.map.resourceNodes.filter((node) => node.controlledBy !== botPlayerId).map((node) => node.coord)
  );
  if (anyContested) {
    return anyContested;
  }

  return getClosestCoord(
    unit.coord,
    state.map.resourceNodes.filter((node) => node.controlledBy === botPlayerId).map((node) => node.coord)
  );
}

function chooseObjectiveCoord(state: GameState, botPlayerId: PlayerId, unit: UnitEntity): HexCoord | null {
  const opponentId = getOpponentPlayer(botPlayerId);
  const botBase = state.entities[state.players[botPlayerId].baseEntityId];
  const enemyBase = state.entities[state.players[opponentId].baseEntityId];

  if (unit.role === "resource") {
    if (unit.carries && botBase && botBase.kind === "base") {
      const dropoffTiles = HEX_DIRECTIONS.map((dir) => ({ q: botBase.coord.q + dir.q, r: botBase.coord.r + dir.r })).filter((coord) =>
        isWithinMapBounds(coord, state.map)
      );
      return getClosestCoord(unit.coord, dropoffTiles);
    }

    return chooseResourceNodeObjective(state, botPlayerId, unit);
  }

  if (unit.role === "combat") {
    if (botBase && botBase.kind === "base") {
      const nearbyEnemies = getEnemyEntities(state, botPlayerId)
        .filter((entity) => entity.kind === "unit" && hexDistance(entity.coord, botBase.coord) <= 3)
        .map((entity) => entity.coord);
      if (nearbyEnemies.length > 0) {
        return getClosestCoord(unit.coord, nearbyEnemies);
      }
    }

    if (enemyBase && enemyBase.kind === "base") {
      return enemyBase.coord;
    }
  }

  return enemyBase && enemyBase.kind === "base" ? enemyBase.coord : null;
}

function chooseMoveCommand(state: GameState, botPlayerId: PlayerId, unit: UnitEntity): GameCommand | null {
  if (unit.hasSummoningSickness || unit.movesRemaining <= 0) {
    return null;
  }

  const objective = chooseObjectiveCoord(state, botPlayerId, unit);
  if (!objective) {
    return null;
  }
  if (areSameHex(unit.coord, objective)) {
    return null;
  }

  const candidateSteps = HEX_DIRECTIONS.map((dir) => ({ q: unit.coord.q + dir.q, r: unit.coord.r + dir.r }))
    .filter((coord) => isWithinMapBounds(coord, state.map))
    .filter((coord) => !isCoordOccupied(state, coord))
    .map((coord) => ({
      coord,
      distance: hexDistance(coord, objective),
    }))
    .sort((a, b) => a.distance - b.distance || a.coord.q - b.coord.q || a.coord.r - b.coord.r);

  const best = candidateSteps[0];
  if (!best) {
    return null;
  }

  return {
    type: "MOVE_UNIT",
    playerId: botPlayerId,
    entityId: unit.id,
    to: best.coord,
  };
}

function chooseSelectionCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  const units = getPlayerUnits(state, botPlayerId);

  const attackers = units.filter((unit) => chooseAttackCommand(state, botPlayerId, unit) !== null);
  if (attackers.length > 0) {
    return {
      type: "SELECT_ENTITY",
      playerId: botPlayerId,
      entityId: attackers[0].id,
    };
  }

  const harvesters = units.filter((unit) => chooseHarvestCommand(state, botPlayerId, unit) !== null);
  if (harvesters.length > 0) {
    return {
      type: "SELECT_ENTITY",
      playerId: botPlayerId,
      entityId: harvesters[0].id,
    };
  }

  const movers = units.filter((unit) => chooseMoveCommand(state, botPlayerId, unit) !== null);
  if (movers.length > 0) {
    return {
      type: "SELECT_ENTITY",
      playerId: botPlayerId,
      entityId: movers[0].id,
    };
  }

  return null;
}

function chooseTacticalCommand(state: GameState, botPlayerId: PlayerId): GameCommand {
  const selected = getSelectedOwnedUnit(state, botPlayerId);

  if (selected) {
    const attack = chooseAttackCommand(state, botPlayerId, selected);
    if (attack) {
      return attack;
    }

    const harvest = chooseHarvestCommand(state, botPlayerId, selected);
    if (harvest) {
      return harvest;
    }

    const move = chooseMoveCommand(state, botPlayerId, selected);
    if (move) {
      return move;
    }
  }

  const select = chooseSelectionCommand(state, botPlayerId);
  if (select) {
    return select;
  }

  return {
    type: "END_PHASE",
    playerId: botPlayerId,
  };
}

export function decideMvpBotCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  if (state.winner) {
    return null;
  }

  if (state.priorityPlayerId !== botPlayerId) {
    return null;
  }

  if (state.activePlayerId !== botPlayerId) {
    const reaction = chooseCounterCommand(state, botPlayerId);
    if (reaction) {
      return reaction;
    }

    return {
      type: "PASS_PRIORITY",
      playerId: botPlayerId,
    };
  }

  if (state.stack.length > 0) {
    const reaction = chooseCounterCommand(state, botPlayerId);
    if (reaction) {
      return reaction;
    }

    return {
      type: "PASS_PRIORITY",
      playerId: botPlayerId,
    };
  }

  if (state.phase === "main") {
    const playCard = chooseMainPhaseCardCommand(state, botPlayerId);
    if (playCard) {
      return playCard;
    }
  }

  if (state.phase === "tactical") {
    return chooseTacticalCommand(state, botPlayerId);
  }

  return {
    type: "END_PHASE",
    playerId: botPlayerId,
  };
}
