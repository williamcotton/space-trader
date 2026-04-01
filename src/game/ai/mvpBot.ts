import type { GameCommand } from "../actions/commands";
import { getCardDefinition, getResolvedCardPlayEffectConfigs, type CardDefinition } from "../content/cards/catalog";
import { getRegisteredCurrencyResourceId, getRegisteredResourceIds } from "../content/registry";
import { getStackEffectDefinition, isCounterResponse } from "../content/stackEffects";
import { areSameHex, getMapAxialBounds, hexDistance, isWithinMapBounds } from "../model/hex";
import type { ResourceType } from "../model/enums";
import type { PlayerId } from "../model/ids";
import { getPrimaryResourceForFaction, MAX_HAND_SIZE, type GameState, type HexCoord, type UnitEntity } from "../model/state";
import { resolveCombatAttack } from "../systems/combat";
import { canAffordCardCost, getEnemyEntities, getFirstOpenBaseAdjacentTile, getPlayerBase, getPlayerUnits, hasEntityAtCoord, HEX_DIRECTIONS } from "../model/queries";
import {
  canAttackEntityDirectly,
  canUnitAttack,
  canUnitMove,
} from "../rules/directInteraction";
import { getOpponentPlayer } from "../turn/stack";
import { getLegalPlayCardTargetOptions } from "../rules/cardPlayOptions";
import { getActiveCardPlayModifierIds } from "../registries/cardPlayModifiers";
import { getSpellScoringResolver } from "../registries/spellScoring";
import { getTriggerConditionScoreBonus } from "../registries/aiMechanics";

function getResourceOrder(): ResourceType[] {
  const resourceIds = getRegisteredResourceIds();
  return resourceIds.length > 0 ? resourceIds : [getRegisteredCurrencyResourceId()];
}

const AI_WEIGHTS = {
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

type ScoredCardCommand = {
  command: GameCommand;
  score: number;
  cardInstanceId: string;
  targetEntityId?: string;
  targetHex?: HexCoord;
};

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

function getPriorityOrderForResourceSet(resources: Set<ResourceType>, primaryResource: ResourceType, currencyFirst: boolean): ResourceType[] {
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

function getPriorityResourceOrderFromHand(state: GameState, botPlayerId: PlayerId): ResourceType[] {
  const faction = state.players[botPlayerId].faction;
  const primaryResource = getPrimaryResourceForFaction(faction);
  const resources = state.players[botPlayerId].resources;
  const missingResources = new Set<ResourceType>();
  const requiredResources = new Set<ResourceType>();
  const focusCards = getEconomyFocusCards(state, botPlayerId);
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

  const missingPriority = getPriorityOrderForResourceSet(missingResources, primaryResource, true);
  if (missingPriority.length > 0) {
    return missingPriority;
  }

  const requiredPriority = getPriorityOrderForResourceSet(requiredResources, primaryResource, false);
  if (requiredPriority.length > 0) {
    return requiredPriority;
  }

  return getPriorityOrderForResourceSet(new Set<ResourceType>(resourceOrder), primaryResource, true);
}

function shouldHarvestResourceType(state: GameState, botPlayerId: PlayerId, resourceType: ResourceType): boolean {
  const priorityOrder = getPriorityResourceOrderFromHand(state, botPlayerId);
  if (priorityOrder.length === 0) {
    return true;
  }

  return new Set(priorityOrder.slice(0, 2)).has(resourceType);
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
    if (!card) {
      continue;
    }
    if (card.play.targetMode !== "stack_item" || !isCounterResponse(card.play.stackEffectId)) {
      continue;
    }
    if (!canAffordCardCost(state, botPlayerId, card.cost)) {
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

function chooseDiscardCardCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  const hand = [...state.zones[botPlayerId].hand];
  if (hand.length <= MAX_HAND_SIZE) {
    return null;
  }

  const playerFaction = state.players[botPlayerId].faction;
  const ranked = hand
    .map((cardInstance) => {
      const card = getCardDefinition(cardInstance.cardId);
      if (!card) {
        return {
          cardInstanceId: cardInstance.instanceId,
          cardId: cardInstance.cardId,
          score: 1000,
        };
      }

      const totalCost = getResourceOrder().reduce((sum, resource) => sum + (card.cost[resource] ?? 0), 0);
      let score = totalCost * 10;

      if (card.faction !== playerFaction && card.faction !== "neutral") {
        score += 80;
      } else if (card.faction === "neutral") {
        score += 15;
      }

      if (!canAffordCardCost(state, botPlayerId, card.cost)) {
        score += 20;
      }

      if (card.kind === "tactic") {
        score += 10;
      } else if (card.unit.role === "resource") {
        score -= 30;
      } else if (card.unit.role === "combat") {
        score -= 10;
      }

      return {
        cardInstanceId: cardInstance.instanceId,
        cardId: card.id,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId) || a.cardInstanceId.localeCompare(b.cardInstanceId));

  const discard = ranked[0];
  if (!discard) {
    return null;
  }

  return {
    type: "DISCARD_CARD",
    playerId: botPlayerId,
    cardInstanceId: discard.cardInstanceId,
  };
}

function chooseTacticCardCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  if (state.phase !== "main" && state.phase !== "tactical") {
    return null;
  }

  const hand = [...state.zones[botPlayerId].hand].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  const candidates: ScoredCardCommand[] = [];

  for (const cardInstance of hand) {
    const card = getCardDefinition(cardInstance.cardId);
    if (!card || card.play.requiresOpenBaseAdjacentTile || !canAffordCardCost(state, botPlayerId, card.cost)) {
      continue;
    }

    const effect = getStackEffectDefinition(card.play.stackEffectId);
    if (!effect) {
      continue;
    }
    const activeModifierIds = getActiveCardPlayModifierIds(state, botPlayerId, card);
    const effectConfigs = getResolvedCardPlayEffectConfigs(card, activeModifierIds);

    const legalTargets = getLegalPlayCardTargetOptions(state, botPlayerId, cardInstance.instanceId, card);
    for (const targeting of legalTargets) {
      const scorer = getSpellScoringResolver(effect.behavior.type);
      const score = scorer
        ? scorer({
            state,
            botPlayerId,
            targeting,
            effect: effect.behavior as never,
            effectConfigs,
          })
        : -Infinity;

      if (score === -Infinity) {
        continue;
      }

      candidates.push({
        command: {
          type: "PLAY_CARD",
          playerId: botPlayerId,
          cardInstanceId: cardInstance.instanceId,
          ...targeting,
        },
        score,
        cardInstanceId: cardInstance.instanceId,
        targetEntityId: targeting.targetEntityId,
        targetHex: targeting.targetHex,
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
    const targetHexQCompare = (a.targetHex?.q ?? Number.MIN_SAFE_INTEGER) - (b.targetHex?.q ?? Number.MIN_SAFE_INTEGER);
    if (targetHexQCompare !== 0) {
      return targetHexQCompare;
    }
    const targetHexRCompare = (a.targetHex?.r ?? Number.MIN_SAFE_INTEGER) - (b.targetHex?.r ?? Number.MIN_SAFE_INTEGER);
    if (targetHexRCompare !== 0) {
      return targetHexRCompare;
    }
    return a.cardInstanceId.localeCompare(b.cardInstanceId);
  });

  const best = candidates[0];
  if (!best) {
    return null;
  }

  const threshold = state.phase === "main" ? AI_WEIGHTS.tacticMainThreshold : AI_WEIGHTS.tacticTacticalThreshold;
  return best.score >= threshold ? best.command : null;
}

type DeployCandidate = {
  cardInstanceId: string;
  card: Extract<CardDefinition, { kind: "unit" }>;
  totalCost: number;
  isCoreCard: boolean;
  isFactionCard: boolean;
  isNeutralCard: boolean;
};

type DeployBoardContext = {
  boardCounts: { combat: number; resource: number; utility: number };
  enemyCombatCount: number;
  hasMissingResourceForHand: boolean;
  desiredResourceUnits: number;
};

function scoreEmergencyCombat(candidate: DeployCandidate): number {
  const factionBonus = candidate.isFactionCard
    ? AI_WEIGHTS.emergencyFactionBonus
    : candidate.isNeutralCard
      ? AI_WEIGHTS.emergencyNeutralBonus
      : AI_WEIGHTS.emergencyOffFactionPenalty;
  return (
    factionBonus +
    candidate.card.unit.attackDamage * AI_WEIGHTS.emergencyAttackMult +
    candidate.card.unit.hp * AI_WEIGHTS.emergencyHpMult +
    candidate.card.unit.armor * AI_WEIGHTS.emergencyArmorMult -
    candidate.totalCost * AI_WEIGHTS.emergencyCostMult
  );
}

function scoreCombatUnit(candidate: DeployCandidate, ctx: DeployBoardContext): number {
  let score =
    AI_WEIGHTS.combatBase +
    candidate.card.unit.attackDamage * AI_WEIGHTS.combatAttackMult +
    candidate.card.unit.hp * AI_WEIGHTS.combatHpMult +
    candidate.card.unit.armor * AI_WEIGHTS.combatArmorMult +
    candidate.card.unit.moveRange;
  if (ctx.boardCounts.combat === 1) {
    score += AI_WEIGHTS.combatSecondUnitBonus;
  }
  if (candidate.isFactionCard) {
    score += AI_WEIGHTS.combatFactionBonus;
  } else if (!candidate.isNeutralCard) {
    score += AI_WEIGHTS.combatOffFactionPenalty;
  }
  return score;
}

function scoreResourceUnit(candidate: DeployCandidate, ctx: DeployBoardContext): number {
  let score = ctx.boardCounts.resource === 0 ? AI_WEIGHTS.resourceFirstDeploy : AI_WEIGHTS.resourceAdditional;
  if (ctx.hasMissingResourceForHand && ctx.boardCounts.resource < ctx.desiredResourceUnits) {
    score += AI_WEIGHTS.resourceMissingBonus;
  }
  if (ctx.boardCounts.resource >= ctx.desiredResourceUnits) {
    score += AI_WEIGHTS.resourceExcessBase - (ctx.boardCounts.resource - ctx.desiredResourceUnits) * AI_WEIGHTS.resourceExcessPerUnit;
  }
  if (ctx.enemyCombatCount > ctx.boardCounts.combat) {
    score += AI_WEIGHTS.resourceOutnumberedPenalty;
  }
  if (!candidate.isNeutralCard && !candidate.isFactionCard) {
    score += AI_WEIGHTS.resourceOffFactionPenalty;
  }
  return score;
}

function scoreUtilityUnit(candidate: DeployCandidate, ctx: DeployBoardContext): number {
  let score = ctx.boardCounts.utility === 0 ? AI_WEIGHTS.utilityFirstDeploy : AI_WEIGHTS.utilityAdditional;
  if (ctx.enemyCombatCount > ctx.boardCounts.combat) {
    score += AI_WEIGHTS.utilityOutnumberedPenalty;
  }

  const alliedCombatScale = Math.max(1, ctx.boardCounts.combat);
  for (const aura of candidate.card.unit.auras ?? []) {
    score += (aura.attackBonus ?? 0) * alliedCombatScale * 5;
    score += (aura.armorBonus ?? 0) * alliedCombatScale * 5;
    score += (aura.siegeBonus ?? 0) * alliedCombatScale * 6;
  }

  for (const trigger of candidate.card.triggers ?? []) {
    score += getTriggerConditionScoreBonus(trigger.condition) ?? 8;
  }

  return score;
}

function scoreDeployCandidate(candidate: DeployCandidate, ctx: DeployBoardContext): number {
  let score: number;
  switch (candidate.card.unit.role) {
    case "combat":
      score = scoreCombatUnit(candidate, ctx);
      break;
    case "resource":
      score = scoreResourceUnit(candidate, ctx);
      break;
    default:
      score = scoreUtilityUnit(candidate, ctx);
      break;
  }
  score -= candidate.totalCost * AI_WEIGHTS.deployCostMult;
  return score;
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
    for (const resource of getResourceOrder()) {
      if ((card.cost[resource] ?? 0) > resources[resource]) {
        return true;
      }
    }
    return false;
  });
  const desiredResourceUnits = hasMissingResourceForHand ? 2 : 1;

  const candidates: DeployCandidate[] = hand
    .map((cardInstance) => {
      const card = getCardDefinition(cardInstance.cardId);
      if (!card || card.kind !== "unit" || !canAffordCardCost(state, botPlayerId, card.cost) || !deployOpen) {
        return null;
      }

      const totalCost = getResourceOrder().reduce((sum, resource) => sum + (card.cost[resource] ?? 0), 0);
      const isFactionCard = card.faction === playerFaction;
      const isNeutralCard = card.faction === "neutral";

      return {
        cardInstanceId: cardInstance.instanceId,
        card,
        totalCost,
        isCoreCard: isFactionCard || isNeutralCard,
        isFactionCard,
        isNeutralCard,
      };
    })
    .filter((entry): entry is DeployCandidate => Boolean(entry));

  const candidatePool = candidates.some((entry) => entry.isCoreCard)
    ? candidates.filter((entry) => entry.isCoreCard)
    : candidates;

  const ctx: DeployBoardContext = { boardCounts, enemyCombatCount, hasMissingResourceForHand, desiredResourceUnits };

  const emergencyCombatCandidates = candidatePool
    .filter((entry) => entry.card.unit.role === "combat")
    .sort((a, b) => scoreEmergencyCombat(b) - scoreEmergencyCombat(a) || a.cardInstanceId.localeCompare(b.cardInstanceId));

  if ((boardCounts.combat === 0 || enemyCombatCount > boardCounts.combat) && emergencyCombatCandidates[0]) {
    return {
      type: "PLAY_CARD",
      playerId: botPlayerId,
      cardInstanceId: emergencyCombatCandidates[0].cardInstanceId,
    };
  }

  const scored = candidatePool
    .map((entry) => ({
      cardInstanceId: entry.cardInstanceId,
      score: scoreDeployCandidate(entry, ctx),
    }))
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
  if (unit.role !== "combat" || unit.attacksRemaining <= 0 || !canUnitAttack(unit)) {
    return null;
  }

  const targets = getEnemyEntities(state, botPlayerId)
    .filter((target) => canAttackEntityDirectly(state, botPlayerId, target))
    .filter((target) => hexDistance(unit.coord, target.coord) <= unit.attackRange)
    .map((target) => {
      const preview = resolveCombatAttack(state, unit, target);
      const killScore = preview.targetDestroyed ? AI_WEIGHTS.attackKillScore : 0;
      const baseScore = target.kind === "base" ? AI_WEIGHTS.attackBaseScore : 0;
      const unitRoleScore =
        target.kind !== "unit"
          ? 0
          : target.role === "resource"
            ? AI_WEIGHTS.attackResourceUnitBonus
            : target.role === "utility"
              ? AI_WEIGHTS.attackUtilityUnitBonus
              : 0;
      const cargoScore = target.kind === "unit" && target.carries ? AI_WEIGHTS.attackCargoBonus : 0;
      return {
        target,
        preview,
        score: killScore + baseScore + unitRoleScore + cargoScore + preview.finalDamage,
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

function isSafeResourceNode(state: GameState, botPlayerId: PlayerId, node: GameState["map"]["resourceNodes"][number]): boolean {
  const botBase = getPlayerBase(state, botPlayerId);
  const enemyBase = getPlayerBase(state, getOpponentPlayer(botPlayerId));
  if (!botBase || !enemyBase || botBase.kind !== "base" || enemyBase.kind !== "base") {
    return true;
  }

  const distanceToBotBase = hexDistance(botBase.coord, node.coord);
  const distanceToEnemyBase = hexDistance(enemyBase.coord, node.coord);
  return distanceToBotBase <= distanceToEnemyBase + 1;
}

function chooseResourceNodeObjective(state: GameState, botPlayerId: PlayerId, unit: UnitEntity): HexCoord | null {
  const resourcePriority = getPriorityResourceOrderFromHand(state, botPlayerId);

  for (const resource of resourcePriority) {
    const safeContestedNodes = state.map.resourceNodes
      .filter((node) => node.resourceType === resource && node.controlledBy !== botPlayerId && isSafeResourceNode(state, botPlayerId, node))
      .map((node) => node.coord);
    const safeContestedTarget = getClosestCoord(unit.coord, safeContestedNodes);
    if (safeContestedTarget) {
      return safeContestedTarget;
    }

    const safeControlledNodes = state.map.resourceNodes
      .filter((node) => node.resourceType === resource && node.controlledBy === botPlayerId && isSafeResourceNode(state, botPlayerId, node))
      .map((node) => node.coord);
    const safeControlledTarget = getClosestCoord(unit.coord, safeControlledNodes);
    if (safeControlledTarget) {
      return safeControlledTarget;
    }

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

  const safeAnyContested = getClosestCoord(
    unit.coord,
    state.map.resourceNodes.filter((node) => node.controlledBy !== botPlayerId && isSafeResourceNode(state, botPlayerId, node)).map((node) => node.coord)
  );
  if (safeAnyContested) {
    return safeAnyContested;
  }

  const safeAnyControlled = getClosestCoord(
    unit.coord,
    state.map.resourceNodes.filter((node) => node.controlledBy === botPlayerId && isSafeResourceNode(state, botPlayerId, node)).map((node) => node.coord)
  );
  if (safeAnyControlled) {
    return safeAnyControlled;
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
        .filter((entity) => entity.kind === "unit" && hexDistance(entity.coord, botBase.coord) <= AI_WEIGHTS.nearbyEnemyRadius)
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
  if (!canUnitMove(unit) || unit.movesRemaining <= 0) {
    return null;
  }

  const objective = chooseObjectiveCoord(state, botPlayerId, unit);
  if (!objective) {
    return null;
  }
  if (areSameHex(unit.coord, objective)) {
    return null;
  }

  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  const candidateSteps: { coord: HexCoord; distance: number; moveDistance: number }[] = [];
  for (let r = rMin; r <= rMax; r += 1) {
    for (let q = qMin; q <= qMax; q += 1) {
      const coord = { q, r };
      if (!isWithinMapBounds(coord, state.map) || areSameHex(coord, unit.coord) || hasEntityAtCoord(state, coord)) {
        continue;
      }

      const moveDistance = hexDistance(unit.coord, coord);
      if (moveDistance > unit.movesRemaining) {
        continue;
      }

      candidateSteps.push({
        coord,
        distance: hexDistance(coord, objective),
        moveDistance,
      });
    }
  }

  candidateSteps.sort(
    (a, b) => a.distance - b.distance || b.moveDistance - a.moveDistance || a.coord.q - b.coord.q || a.coord.r - b.coord.r
  );

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

  if (state.phase === "discard") {
    const discard = chooseDiscardCardCommand(state, botPlayerId);
    if (discard) {
      return discard;
    }
  }

  return {
    type: "END_PHASE",
    playerId: botPlayerId,
  };
}
