import type { GameCommand } from "../actions/commands";
import { getCardDefinition, type CardDefinition } from "../content/cards/catalog";
import { getStackEffectDefinition, isCounterResponse } from "../content/stackEffects";
import { areSameHex, hexDistance, isWithinMapBounds } from "../model/hex";
import type { Faction, ResourceType } from "../model/enums";
import type { PlayerId } from "../model/ids";
import { MAX_HAND_SIZE, type EntityState, type GameState, type HexCoord, type UnitEntity } from "../model/state";
import { resolveCombatAttack } from "../systems/combat";
import { canAffordCardCost, getEnemyEntities, getFirstOpenBaseAdjacentTile, getPlayerUnits, hasEntityAtCoord, HEX_DIRECTIONS } from "../model/queries";
import { getOpponentPlayer } from "../turn/stack";

const RESOURCE_ORDER: ResourceType[] = ["credits", "alloy", "flux", "biomass"];
const PRIMARY_RESOURCE_BY_FACTION: Record<Faction, ResourceType> = {
  alloy_clan: "alloy",
  flux_collective: "flux",
  biomass_swarm: "biomass",
};

const AI_WEIGHTS = {
  // scoreEnemyEntityThreat
  threatCombatBase: 34,
  threatResourceBase: 20,
  threatUtilityBase: 15,
  threatAttackMult: 4,
  threatArmorMult: 4,
  threatRangeMult: 2,
  threatNearBaseBonus: 22,
  threatNearBaseRadius: 2,
  threatMedBaseBonus: 12,
  threatMedBaseRadius: 4,

  // scoreDamageSpellTarget
  damageLethalBaseScore: 320,
  damageBoardPressureBonus: 30,
  damageBaseHpDeltaMult: 4,
  damageBaseAmountMult: 5,
  damageKillBonus: 96,
  damageWoundedBonus: 12,
  damageTimingPenalty: 30,
  damageAppliedMult: 10,

  // scoreDestroySpellTarget
  destroyBase: 110,
  destroyHpDeltaMult: 4,

  // scoreBraceProtocolTarget
  braceBase: 26,
  bracePreventedDmgMult: 15,
  bracePreventKillBonus: 80,
  braceCombatBonus: 18,

  // chooseTacticCardCommand thresholds
  tacticMainThreshold: 90,
  tacticTacticalThreshold: 55,
  basePingLethalScore: 300,
  basePingTacticalScore: 18,

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
  attackBaseScore: 50,

  // movement
  nearbyEnemyRadius: 3,
} as const;

type ScoredCardCommand = {
  command: GameCommand;
  score: number;
  cardInstanceId: string;
  targetEntityId?: string;
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

      const totalCost = RESOURCE_ORDER.reduce((sum, resource) => sum + (card.cost[resource] ?? 0), 0);
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

function scoreEnemyEntityThreat(state: GameState, botPlayerId: PlayerId, target: EntityState): number {
  if (target.kind === "base") {
    return 0;
  }

  let score = target.role === "combat" ? AI_WEIGHTS.threatCombatBase : target.role === "resource" ? AI_WEIGHTS.threatResourceBase : AI_WEIGHTS.threatUtilityBase;
  score += target.attackDamage * AI_WEIGHTS.threatAttackMult + target.armor * AI_WEIGHTS.threatArmorMult + target.attackRange * AI_WEIGHTS.threatRangeMult;

  const botBase = state.entities[state.players[botPlayerId].baseEntityId];
  if (botBase && botBase.kind === "base") {
    const distanceToBase = hexDistance(target.coord, botBase.coord);
    if (distanceToBase <= AI_WEIGHTS.threatNearBaseRadius) {
      score += AI_WEIGHTS.threatNearBaseBonus;
    } else if (distanceToBase <= AI_WEIGHTS.threatMedBaseRadius) {
      score += AI_WEIGHTS.threatMedBaseBonus;
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
      return AI_WEIGHTS.damageLethalBaseScore;
    }

    if (phase !== "tactical") {
      return -Infinity;
    }

    const enemyUnits = getEnemyEntities(state, botPlayerId).filter((entity) => entity.kind === "unit");
    const boardPressureBonus = enemyUnits.length === 0 ? AI_WEIGHTS.damageBoardPressureBonus : 0;
    return boardPressureBonus + (target.maxHp - target.hp) * AI_WEIGHTS.damageBaseHpDeltaMult + amount * AI_WEIGHTS.damageBaseAmountMult;
  }

  const appliedDamage = Math.min(amount, target.hp);
  const killBonus = amount >= target.hp ? AI_WEIGHTS.damageKillBonus : 0;
  const woundedBonus = target.hp < target.maxHp ? AI_WEIGHTS.damageWoundedBonus : 0;
  const timingPenalty = phase === "main" && killBonus === 0 ? AI_WEIGHTS.damageTimingPenalty : 0;

  return scoreEnemyEntityThreat(state, botPlayerId, target) + appliedDamage * AI_WEIGHTS.damageAppliedMult + killBonus + woundedBonus - timingPenalty;
}

function scoreDestroySpellTarget(state: GameState, botPlayerId: PlayerId, target: UnitEntity): number {
  if (target.hp >= target.maxHp) {
    return -Infinity;
  }

  return AI_WEIGHTS.destroyBase + scoreEnemyEntityThreat(state, botPlayerId, target) + (target.maxHp - target.hp) * AI_WEIGHTS.destroyHpDeltaMult;
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
  const hypotheticalEffect = {
    id: `hyp_brace_${target.id}`,
    sourceEntityId: null,
    sourceCardId: null,
    controllerId: botPlayerId,
    payload: { type: "stat_modifier" as const, stat: "armor" as const, amount: 2 },
    target: { type: "specific_entity" as const, entityId: target.id },
    expiry: { type: "permanent" as const },
    layer: 4,
    timestamp: 0,
  };
  try {
    for (const enemy of threateningEnemies) {
      const before = resolveCombatAttack(state, enemy, target);
      state.continuousEffects.push(hypotheticalEffect);
      const after = resolveCombatAttack(state, enemy, target);
      state.continuousEffects.pop();
      preventedDamage += before.finalDamage - after.finalDamage;
      if (before.targetDestroyed && !after.targetDestroyed) {
        preventsKill = true;
      }
    }
  } finally {
    const idx = state.continuousEffects.indexOf(hypotheticalEffect);
    if (idx >= 0) state.continuousEffects.splice(idx, 1);
  }

  if (preventedDamage <= 0) {
    return -Infinity;
  }

  return AI_WEIGHTS.braceBase + preventedDamage * AI_WEIGHTS.bracePreventedDmgMult + (preventsKill ? AI_WEIGHTS.bracePreventKillBonus : 0) + (target.role === "combat" ? AI_WEIGHTS.braceCombatBonus : 0);
}

function chooseTacticCardCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  if (state.phase !== "main" && state.phase !== "tactical") {
    return null;
  }

  const hand = [...state.zones[botPlayerId].hand].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  const candidates: ScoredCardCommand[] = [];

  for (const cardInstance of hand) {
    const card = getCardDefinition(cardInstance.cardId);
    if (!card || card.kind !== "tactic" || !canAffordCardCost(state, botPlayerId, card.cost)) {
      continue;
    }

    const effect = getStackEffectDefinition(card.stackEffectId);
    if (!effect) {
      continue;
    }

    if (effect.targeting.type === "entity" || card.targetHint === "entity") {
      for (const entity of Object.values(state.entities).sort((a, b) => a.id.localeCompare(b.id))) {
        // New path: card-level predicate
        if (card.isValidTarget) {
          if (!card.isValidTarget(state, entity, botPlayerId)) continue;
        } else {
          // Legacy fallback: enum-based checks
          if (effect.targeting.type === "entity") {
            if (effect.targeting.relation === "ally" && entity.ownerId !== botPlayerId) continue;
            if (effect.targeting.relation === "enemy" && entity.ownerId === botPlayerId) continue;
            if (effect.targeting.entityKind === "unit" && entity.kind !== "unit") continue;
            if (effect.targeting.requireDamaged && entity.hp >= entity.maxHp) continue;
          }
        }

        let score = -Infinity;
        if (effect.behavior.type === "damage_entity") {
          score = scoreDamageSpellTarget(state, botPlayerId, entity, effect.behavior.amount, state.phase);
        } else if (effect.behavior.type === "destroy_entity" && entity.kind === "unit") {
          score = scoreDestroySpellTarget(state, botPlayerId, entity);
        } else if (effect.behavior.type === "modify_unit_until_end_of_turn" && entity.kind === "unit") {
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

    if (effect.behavior.type === "damage_enemy_base") {
      const enemyBase = state.entities[state.players[getOpponentPlayer(botPlayerId)].baseEntityId];
      if (!enemyBase || enemyBase.kind !== "base") {
        continue;
      }

      const score = effect.behavior.amount >= enemyBase.hp ? AI_WEIGHTS.basePingLethalScore : state.phase === "tactical" ? AI_WEIGHTS.basePingTacticalScore : -Infinity;
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

function scoreUtilityUnit(_candidate: DeployCandidate, ctx: DeployBoardContext): number {
  let score = ctx.boardCounts.utility === 0 ? AI_WEIGHTS.utilityFirstDeploy : AI_WEIGHTS.utilityAdditional;
  if (ctx.enemyCombatCount > ctx.boardCounts.combat) {
    score += AI_WEIGHTS.utilityOutnumberedPenalty;
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
    for (const resource of RESOURCE_ORDER) {
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

      const totalCost = (card.cost.credits ?? 0) + (card.cost.alloy ?? 0) + (card.cost.flux ?? 0) + (card.cost.biomass ?? 0);
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
  if (unit.role !== "combat" || unit.attacksRemaining <= 0 || unit.hasSummoningSickness) {
    return null;
  }

  const targets = getEnemyEntities(state, botPlayerId)
    .filter((target) => hexDistance(unit.coord, target.coord) <= unit.attackRange)
    .map((target) => {
      const preview = resolveCombatAttack(state, unit, target);
      const killScore = preview.targetDestroyed ? AI_WEIGHTS.attackKillScore : 0;
      const baseScore = target.kind === "base" ? AI_WEIGHTS.attackBaseScore : 0;
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
    .filter((coord) => !hasEntityAtCoord(state, coord))
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
