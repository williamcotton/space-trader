import type { PlayerId } from "../../model/ids";
import type { GameState } from "../../model/state";
import { getPlayerUnits } from "../../model/queries";
import { getOpponentPlayer } from "../../turn/stack";
import { evaluateState } from "./evaluate";
import { generateActionPlans } from "./generate";
import { applyCommandSequence, cloneGameState } from "./simulate";
import type { SearchActionPlan, SearchConfig } from "./types";

type SearchBudget = {
  nodeCount: number;
  maxNodes: number;
};

function getSearchConfig(state: Readonly<GameState>, playerId: PlayerId): SearchConfig {
  const totalUnits = getPlayerUnits(state as GameState, playerId).length + getPlayerUnits(state as GameState, getOpponentPlayer(playerId)).length;

  if (state.stack.length > 0) {
    return {
      maxDepth: 2,
      maxNodes: totalUnits > 8 ? 120 : 160,
    };
  }

  if (state.phase === "tactical" && state.activePlayerId === playerId) {
    return {
      maxDepth: 3,
      maxNodes: totalUnits > 8 ? 180 : 260,
    };
  }

  if (state.phase === "main" && state.activePlayerId === playerId) {
    return {
      maxDepth: 2,
      maxNodes: totalUnits > 8 ? 140 : 180,
    };
  }

  return {
    maxDepth: 2,
    maxNodes: 120,
  };
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

  budget.nodeCount += 1;

  if (actor === rootPlayerId) {
    let best = Number.NEGATIVE_INFINITY;

    for (const plan of plans) {
      if (budget.nodeCount >= budget.maxNodes) {
        break;
      }

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
