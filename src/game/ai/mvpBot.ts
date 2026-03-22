import type { GameCommand } from "../actions/commands";
import { getCardDefinition, type CardDefinition } from "../content/cards/catalog";
import { getStackEffectDefinition, isCounterResponse } from "../content/stackEffects";
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

type ScoredCardCommand = {
  command: GameCommand;
  score: number;
  cardInstanceId: string;
  targetEntityId?: string;
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

function getUnitRoleCounts(state: GameState, playerId: PlayerId): Record<"combat" | "resource" | "utility", number> {
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

function scoreEnemyEntityThreat(state: GameState, botPlayerId: PlayerId, target: EntityState): number {
  if (target.kind === "base") {
    return 0;
  }

  let score = target.role === "combat" ? 34 : target.role === "resource" ? 20 : 15;
  score += target.attackDamage * 4 + target.armor * 4 + target.attackRange * 2;

  const botBase = state.entities[state.players[botPlayerId].baseEntityId];
  if (botBase && botBase.kind === "base") {
    const distanceToBase = hexDistance(target.coord, botBase.coord);
    if (distanceToBase <= 2) {
      score += 22;
    } else if (distanceToBase <= 4) {
      score += 12;
    }
  }

  return score;
}

function scoreDamageSpellTarget(
  state: GameState,
  botPlayerId: PlayerId,
  target: EntityState,
  amount: number,
  phase: GameState["phase"]
): number {
  if (target.kind === "base") {
    if (amount >= target.hp) {
      return 320;
    }

    if (phase !== "tactical") {
      return -Infinity;
    }

    const enemyUnits = getEnemyEntities(state, botPlayerId).filter((entity) => entity.kind === "unit");
    const boardPressureBonus = enemyUnits.length === 0 ? 30 : 0;
    return boardPressureBonus + (target.maxHp - target.hp) * 4 + amount * 5;
  }

  const appliedDamage = Math.min(amount, target.hp);
  const killBonus = amount >= target.hp ? 96 : 0;
  const woundedBonus = target.hp < target.maxHp ? 12 : 0;
  const timingPenalty = phase === "main" && killBonus === 0 ? 30 : 0;

  return scoreEnemyEntityThreat(state, botPlayerId, target) + appliedDamage * 10 + killBonus + woundedBonus - timingPenalty;
}

function scoreDestroySpellTarget(state: GameState, botPlayerId: PlayerId, target: UnitEntity): number {
  if (target.hp >= target.maxHp) {
    return -Infinity;
  }

  return 110 + scoreEnemyEntityThreat(state, botPlayerId, target) + (target.maxHp - target.hp) * 4;
}

function scoreBraceProtocolTarget(state: GameState, botPlayerId: PlayerId, target: UnitEntity): number {
  const threateningEnemies = getPlayerUnits(state, getOpponentPlayer(botPlayerId)).filter((enemy) => {
    return enemy.role === "combat" && !enemy.hasSummoningSickness && enemy.attacksRemaining > 0 && hexDistance(enemy.coord, target.coord) <= enemy.attackRange;
  });

  if (threateningEnemies.length === 0) {
    return -Infinity;
  }

  let preventedDamage = 0;
  let preventsKill = false;
  target.temporaryArmorBonus += 2;
  try {
    for (const enemy of threateningEnemies) {
      target.temporaryArmorBonus -= 2;
      const before = resolveCombatAttack(state, enemy, target);
      target.temporaryArmorBonus += 2;
      const after = resolveCombatAttack(state, enemy, target);
      preventedDamage += before.finalDamage - after.finalDamage;
      if (before.targetDestroyed && !after.targetDestroyed) {
        preventsKill = true;
      }
    }
  } finally {
    target.temporaryArmorBonus -= 2;
  }

  if (preventedDamage <= 0) {
    return -Infinity;
  }

  return 26 + preventedDamage * 15 + (preventsKill ? 80 : 0) + (target.role === "combat" ? 18 : 0);
}

function chooseTacticCardCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  if (state.phase !== "main" && state.phase !== "tactical") {
    return null;
  }

  const hand = [...state.zones[botPlayerId].hand].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  const candidates: ScoredCardCommand[] = [];

  for (const cardInstance of hand) {
    const card = getCardDefinition(cardInstance.cardId);
    if (!card || card.kind !== "tactic" || !canAfford(state, botPlayerId, card.cost)) {
      continue;
    }

    const effect = getStackEffectDefinition(card.stackEffectId);
    if (!effect) {
      continue;
    }

    if (effect.targeting.type === "entity") {
      for (const entity of Object.values(state.entities).sort((a, b) => a.id.localeCompare(b.id))) {
        if (effect.targeting.relation === "ally" && entity.ownerId !== botPlayerId) {
          continue;
        }
        if (effect.targeting.relation === "enemy" && entity.ownerId === botPlayerId) {
          continue;
        }
        if (effect.targeting.entityKind === "unit" && entity.kind !== "unit") {
          continue;
        }
        if (effect.targeting.requireDamaged && entity.hp >= entity.maxHp) {
          continue;
        }

        let score = -Infinity;
        if (effect.resolution.type === "damage_entity") {
          score = scoreDamageSpellTarget(state, botPlayerId, entity, effect.resolution.amount, state.phase);
        } else if (effect.resolution.type === "destroy_entity" && entity.kind === "unit") {
          score = scoreDestroySpellTarget(state, botPlayerId, entity);
        } else if (effect.resolution.type === "modify_unit_until_end_of_turn" && entity.kind === "unit") {
          score = scoreBraceProtocolTarget(state, botPlayerId, entity);
        }

        if (score === -Infinity) {
          continue;
        }

        candidates.push({
          command: {
            type: "PLAY_CARD",
            playerId: botPlayerId,
            cardInstanceId: cardInstance.instanceId,
            targetEntityId: entity.id,
          },
          score,
          cardInstanceId: cardInstance.instanceId,
          targetEntityId: entity.id,
        });
      }
      continue;
    }

    if (effect.resolution.type === "damage_enemy_base") {
      const enemyBase = state.entities[state.players[getOpponentPlayer(botPlayerId)].baseEntityId];
      if (!enemyBase || enemyBase.kind !== "base") {
        continue;
      }

      const score = effect.resolution.amount >= enemyBase.hp ? 300 : state.phase === "tactical" ? 18 : -Infinity;
      if (score === -Infinity) {
        continue;
      }

      candidates.push({
        command: {
          type: "PLAY_CARD",
          playerId: botPlayerId,
          cardInstanceId: cardInstance.instanceId,
        },
        score,
        cardInstanceId: cardInstance.instanceId,
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const targetCompare = (a.targetEntityId ?? "").localeCompare(b.targetEntityId ?? "");
    if (targetCompare !== 0) {
      return targetCompare;
    }
    return a.cardInstanceId.localeCompare(b.cardInstanceId);
  });

  const best = candidates[0];
  if (!best) {
    return null;
  }

  const threshold = state.phase === "main" ? 90 : 55;
  return best.score >= threshold ? best.command : null;
}

function chooseMainPhaseCardCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  const deployOpen = getFirstOpenBaseAdjacentTile(state, botPlayerId);
  const hand = [...state.zones[botPlayerId].hand].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  const resources = state.players[botPlayerId].resources;
  const playerFaction = state.players[botPlayerId].faction;
  const focusCards = getEconomyFocusCards(state, botPlayerId);
  const boardCounts = getUnitRoleCounts(state, botPlayerId);
  const enemyCombatCount = getUnitRoleCounts(state, getOpponentPlayer(botPlayerId)).combat;
  const hasMissingResourceForHand = focusCards.some((card) => {
    for (const resource of RESOURCE_ORDER) {
      if ((card.cost[resource] ?? 0) > resources[resource]) {
        return true;
      }
    }
    return false;
  });
  const desiredResourceUnits = hasMissingResourceForHand ? 2 : 1;

  const candidates = hand
    .map((cardInstance) => {
      const card = getCardDefinition(cardInstance.cardId);
      if (!card || card.kind !== "unit" || !canAfford(state, botPlayerId, card.cost) || !deployOpen) {
        return null;
      }

      const totalCost = (card.cost.credits ?? 0) + (card.cost.alloy ?? 0) + (card.cost.flux ?? 0) + (card.cost.biomass ?? 0);
      const isFactionCard = card.faction === playerFaction;
      const isNeutralCard = card.faction === "neutral";
      const isCoreCard = isFactionCard || isNeutralCard;

      return {
        cardInstanceId: cardInstance.instanceId,
        card,
        totalCost,
        isCoreCard,
        isFactionCard,
        isNeutralCard,
      };
    })
    .filter(
      (
        entry
      ): entry is {
        cardInstanceId: string;
        card: Extract<CardDefinition, { kind: "unit" }>;
        totalCost: number;
        isCoreCard: boolean;
        isFactionCard: boolean;
        isNeutralCard: boolean;
      } => Boolean(entry)
    );

  const candidatePool = candidates.some((entry) => entry.isCoreCard)
    ? candidates.filter((entry) => entry.isCoreCard)
    : candidates;

  const emergencyCombatCandidates = candidatePool
    .filter((entry) => entry.card.unit.role === "combat")
    .sort((a, b) => {
      const scoreA =
        (a.isFactionCard ? 12 : a.isNeutralCard ? 4 : -8) +
        a.card.unit.attackDamage * 4 +
        a.card.unit.hp * 2 +
        a.card.unit.armor * 5 -
        a.totalCost * 3;
      const scoreB =
        (b.isFactionCard ? 12 : b.isNeutralCard ? 4 : -8) +
        b.card.unit.attackDamage * 4 +
        b.card.unit.hp * 2 +
        b.card.unit.armor * 5 -
        b.totalCost * 3;
      return scoreB - scoreA || a.cardInstanceId.localeCompare(b.cardInstanceId);
    });

  if ((boardCounts.combat === 0 || enemyCombatCount > boardCounts.combat) && emergencyCombatCandidates[0]) {
    return {
      type: "PLAY_CARD",
      playerId: botPlayerId,
      cardInstanceId: emergencyCombatCandidates[0].cardInstanceId,
    };
  }

  const scored = candidatePool
    .map((entry) => {
      let score = 0;

      if (entry.card.unit.role === "combat") {
        score += 34 + entry.card.unit.attackDamage * 5 + entry.card.unit.hp * 1.5 + entry.card.unit.armor * 6 + entry.card.unit.moveRange;
        if (boardCounts.combat === 1) {
          score += 10;
        }
        if (entry.isFactionCard) {
          score += 10;
        } else if (!entry.isNeutralCard) {
          score -= 8;
        }
      } else if (entry.card.unit.role === "resource") {
        score += boardCounts.resource === 0 ? 50 : 22;
        if (hasMissingResourceForHand && boardCounts.resource < desiredResourceUnits) {
          score += 12;
        }
        if (boardCounts.resource >= desiredResourceUnits) {
          score -= 28 + (boardCounts.resource - desiredResourceUnits) * 10;
        }
        if (enemyCombatCount > boardCounts.combat) {
          score -= 18;
        }
        if (!entry.isNeutralCard && !entry.isFactionCard) {
          score -= 16;
        }
      } else {
        score += boardCounts.utility === 0 ? 16 : 8;
        if (enemyCombatCount > boardCounts.combat) {
          score -= 10;
        }
      }

      score -= entry.totalCost * 4;

      return {
        cardInstanceId: entry.cardInstanceId,
        score,
      };
    })
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
    const tactic = chooseTacticCardCommand(state, botPlayerId);
    if (tactic) {
      return tactic;
    }

    const playCard = chooseMainPhaseCardCommand(state, botPlayerId);
    if (playCard) {
      return playCard;
    }
  }

  if (state.phase === "tactical") {
    const tactic = chooseTacticCardCommand(state, botPlayerId);
    if (tactic) {
      return tactic;
    }

    return chooseTacticalCommand(state, botPlayerId);
  }

  return {
    type: "END_PHASE",
    playerId: botPlayerId,
  };
}
