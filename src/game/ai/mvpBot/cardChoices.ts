import type { GameCommand } from "../../actions/commands";
import { getCardDefinition, getResolvedCardPlayEffectConfigs, type CardDefinition } from "../../content/cards/catalog";
import { getStackEffectDefinition, isCounterResponse } from "../../content/stackEffects";
import type { PlayerId } from "../../model/ids";
import { MAX_HAND_SIZE, type GameState } from "../../model/state";
import { canAffordCardCost, getFirstOpenBaseAdjacentTile } from "../../model/queries";
import { getLegalPlayCardTargetOptions } from "../../rules/cardPlayOptions";
import { getActiveCardPlayModifierIds } from "../../registries/cardPlayModifiers";
import { getSpellScoringResolver } from "../../registries/spellScoring";
import { getTriggerConditionScoreBonus } from "../../registries/aiMechanics";
import { getOpponentPlayer } from "../../turn/stack";
import {
  AI_WEIGHTS,
  getEconomyFocusCards,
  getResourceOrder,
  getUnitRoleCounts,
  type ScoredCardCommand,
} from "./shared";

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

function compareScoredCardCommands(a: ScoredCardCommand, b: ScoredCardCommand): number {
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
}

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

export function chooseCounterCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
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

export function chooseDiscardCardCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
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

export function chooseTacticCardCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
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

  candidates.sort(compareScoredCardCommands);

  const best = candidates[0];
  if (!best) {
    return null;
  }

  const threshold = state.phase === "main" ? AI_WEIGHTS.tacticMainThreshold : AI_WEIGHTS.tacticTacticalThreshold;
  return best.score >= threshold ? best.command : null;
}

export function chooseMainPhaseCardCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
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
