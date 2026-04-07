import type { GameCommand } from "../../actions/commands";
import type { PlayerId } from "../../model/ids";
import type { GameState } from "../../model/state";
import { getPlayerUnits } from "../../model/queries";
import { resolveCombatAttack } from "../../systems/combat";
import { getLivePlayerIds } from "../../turn/playerOrder";
import { evaluateState } from "./evaluate";
import { generateActionPlans } from "./generate";
import { applyCommandSequence, cloneGameState } from "./simulate";
import type { SearchActionPlan, SearchConfig } from "./types";

type SearchBudget = {
  nodeCount: number;
  maxNodes: number;
};

function getSearchConfig(state: Readonly<GameState>, playerId: PlayerId): SearchConfig {
  const livePlayers = getLivePlayerIds(state as GameState);
  const totalUnits = livePlayers.reduce((sum, livePlayerId) => sum + getPlayerUnits(state as GameState, livePlayerId).length, 0);
  const isFreeForAll = livePlayers.length > 2;

  if (state.stack.length > 0) {
    return {
      maxDepth: isFreeForAll ? 1 : 2,
      maxNodes: isFreeForAll ? 48 : totalUnits > 8 ? 120 : 160,
    };
  }

  if (state.phase === "tactical" && state.activePlayerId === playerId) {
    return {
      maxDepth: isFreeForAll ? 2 : 3,
      maxNodes: isFreeForAll ? (totalUnits > 16 ? 72 : 96) : totalUnits > 8 ? 180 : 260,
    };
  }

  if (state.phase === "main" && state.activePlayerId === playerId) {
    return {
      maxDepth: 2,
      maxNodes: isFreeForAll ? 72 : totalUnits > 8 ? 140 : 180,
    };
  }

  return {
    maxDepth: isFreeForAll ? 1 : 2,
    maxNodes: isFreeForAll ? 48 : 120,
  };
}

function getAttackCommand(plan: SearchActionPlan): Extract<GameCommand, { type: "ATTACK_UNIT" }> | null {
  return plan.commands.find((command): command is Extract<GameCommand, { type: "ATTACK_UNIT" }> => command.type === "ATTACK_UNIT") ?? null;
}

function getLethalAttackPlanScore(state: Readonly<GameState>, plan: SearchActionPlan): { targetKind: "base" | "unit"; score: number } | null {
  const command = getAttackCommand(plan);
  if (!command) {
    return null;
  }

  const attacker = state.entities[command.attackerId];
  const target = state.entities[command.targetId];
  if (!attacker || attacker.kind !== "unit" || !target) {
    return null;
  }

  const preview = resolveCombatAttack(state as GameState, attacker, target);
  if (!preview.targetDestroyed) {
    return null;
  }

  return {
    targetKind: target.kind,
    score: plan.scoreHint + (target.kind === "base" ? 1_000_000 : 10_000),
  };
}

function chooseImmediateLethalAttackPlan(state: Readonly<GameState>, playerId: PlayerId, plans: readonly SearchActionPlan[]): SearchActionPlan | null {
  if (state.phase !== "tactical" || state.activePlayerId !== playerId || state.stack.length > 0) {
    return null;
  }

  const lethalPlans = plans
    .map((plan) => ({
      plan,
      lethal: getLethalAttackPlanScore(state, plan),
    }))
    .filter((entry): entry is { plan: SearchActionPlan; lethal: { targetKind: "base" | "unit"; score: number } } => entry.lethal !== null)
    .sort((a, b) => b.lethal.score - a.lethal.score || b.plan.scoreHint - a.plan.scoreHint || a.plan.key.localeCompare(b.plan.key));

  return lethalPlans[0]?.plan ?? null;
}

function searchScore(
  state: Readonly<GameState>,
  rootPlayerId: PlayerId,
  depth: number,
  alpha: number,
  beta: number,
  budget: SearchBudget
): number {
  if (budget.nodeCount >= budget.maxNodes || state.winner || depth <= 0) {
    return evaluateState(state, rootPlayerId);
  }

  const actor = state.priorityPlayerId;
  if (!actor) {
    return evaluateState(state, rootPlayerId);
  }

  const plans = generateActionPlans(state, actor);
  if (plans.length === 0) {
    return evaluateState(state, rootPlayerId);
  }

  if (actor === rootPlayerId) {
    let best = Number.NEGATIVE_INFINITY;

    for (const plan of plans) {
      if (budget.nodeCount >= budget.maxNodes) {
        break;
      }

      budget.nodeCount += 1;
      const nextState = cloneGameState(state);
      if (!applyCommandSequence(nextState, plan.commands)) {
        continue;
      }

      const value = searchScore(nextState, rootPlayerId, depth - 1, alpha, beta, budget);
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
      if (alpha >= beta) {
        break;
      }
    }

    return Number.isFinite(best) ? best : evaluateState(state, rootPlayerId);
  }

  let best = Number.POSITIVE_INFINITY;

  for (const plan of plans) {
    if (budget.nodeCount >= budget.maxNodes) {
      break;
    }

    budget.nodeCount += 1;
    const nextState = cloneGameState(state);
    if (!applyCommandSequence(nextState, plan.commands)) {
      continue;
    }

    const value = searchScore(nextState, rootPlayerId, depth - 1, alpha, beta, budget);
    best = Math.min(best, value);
    beta = Math.min(beta, best);
    if (alpha >= beta) {
      break;
    }
  }

  return Number.isFinite(best) ? best : evaluateState(state, rootPlayerId);
}

export function chooseBestActionPlan(state: Readonly<GameState>, rootPlayerId: PlayerId): SearchActionPlan | null {
  if (state.winner || state.priorityPlayerId !== rootPlayerId) {
    return null;
  }

  const config = getSearchConfig(state, rootPlayerId);
  const plans = generateActionPlans(state, rootPlayerId);
  if (plans.length === 0) {
    return null;
  }

  const immediateLethalAttack = chooseImmediateLethalAttackPlan(state, rootPlayerId, plans);
  if (immediateLethalAttack) {
    return immediateLethalAttack;
  }

  const budget: SearchBudget = {
    nodeCount: 0,
    maxNodes: config.maxNodes,
  };

  let bestPlan: SearchActionPlan | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let alpha = Number.NEGATIVE_INFINITY;
  const beta = Number.POSITIVE_INFINITY;

  for (const plan of plans) {
    if (budget.nodeCount >= budget.maxNodes) {
      break;
    }

    budget.nodeCount += 1;
    const nextState = cloneGameState(state);
    if (!applyCommandSequence(nextState, plan.commands)) {
      continue;
    }

    const score = searchScore(nextState, rootPlayerId, config.maxDepth - 1, alpha, beta, budget);
    if (
      score > bestScore ||
      (score === bestScore &&
        (!bestPlan ||
          plan.scoreHint > bestPlan.scoreHint ||
          (plan.scoreHint === bestPlan.scoreHint && plan.key.localeCompare(bestPlan.key) < 0)))
    ) {
      bestPlan = plan;
      bestScore = score;
    }

    alpha = Math.max(alpha, bestScore);
  }

  return bestPlan ?? plans[0] ?? null;
}
