import type { GameCommand } from "../actions/commands";
import { getCardDefinition } from "../content/cards/catalog";
import { isCounterResponse } from "../content/stackEffects";
import { getMapAxialBounds, hexDistance, isWithinMapBounds } from "../model/hex";
import { MAX_HAND_SIZE, type GameState, type UnitEntity } from "../model/state";
import type { PlayerId } from "../model/ids";
import { validateCommand } from "../rules/validators";
import { canUnitHarvestNode, getResourceNodeAtCoord } from "../systems/harvesting";
import { canAttackEntityDirectly } from "../systems/keywords";
import { hasEntityAtCoord } from "../model/queries";

function hasAnyPlayableCard(state: GameState, playerId: PlayerId): boolean {
  const topStackItemId = state.stack[state.stack.length - 1]?.id;

  for (const cardInstance of state.zones[playerId].hand) {
    const card = getCardDefinition(cardInstance.cardId);
    if (!card) {
      continue;
    }

    const targetStackItemId =
      card.play.targetMode === "stack_item" && isCounterResponse(card.play.stackEffectId)
        ? topStackItemId
        : undefined;
    const result = validateCommand(state, {
      type: "PLAY_CARD",
      playerId,
      cardInstanceId: cardInstance.instanceId,
      targetStackItemId,
    });

    if (result.ok) {
      return true;
    }
  }

  return false;
}

function hasAvailableMove(state: GameState, unit: UnitEntity): boolean {
  if (unit.hasSummoningSickness || unit.movesRemaining <= 0) {
    return false;
  }

  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  for (let q = qMin; q <= qMax; q += 1) {
    for (let r = rMin; r <= rMax; r += 1) {
      const target = { q, r };
      if (hexDistance(unit.coord, target) === 0 || hexDistance(unit.coord, target) > unit.movesRemaining) {
        continue;
      }
      if (!isWithinMapBounds(target, state.map)) {
        continue;
      }
      if (!hasEntityAtCoord(state, target, unit.id)) {
        return true;
      }
    }
  }

  return false;
}

function hasAvailableAttack(state: GameState, unit: UnitEntity): boolean {
  if (unit.role !== "combat" || unit.hasSummoningSickness || unit.attacksRemaining <= 0) {
    return false;
  }

  return Object.values(state.entities).some((entity) =>
    entity.ownerId !== unit.ownerId &&
    canAttackEntityDirectly(state, unit.ownerId, entity) &&
    hexDistance(unit.coord, entity.coord) <= unit.attackRange
  );
}

function hasAvailableHarvest(state: GameState, unit: UnitEntity): boolean {
  if (!canUnitHarvestNode(unit, unit.ownerId)) {
    return false;
  }

  const node = getResourceNodeAtCoord(state, unit.coord);
  return Boolean(node && node.controlledBy === unit.ownerId);
}

function hasAnyTacticalAction(state: GameState, playerId: PlayerId): boolean {
  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "unit" || entity.ownerId !== playerId) {
      continue;
    }

    if (hasAvailableAttack(state, entity) || hasAvailableHarvest(state, entity) || hasAvailableMove(state, entity)) {
      return true;
    }
  }

  return false;
}

function hasPendingTrackedHarvest(state: GameState, playerId: PlayerId): boolean {
  return state.tacticalHarvestEligibleUnitIds.some((entityId) => {
    const entity = state.entities[entityId];
    if (!entity || entity.kind !== "unit" || entity.ownerId !== playerId) {
      return false;
    }

    return !state.tacticalHarvestedUnitIds.includes(entityId) && entity.carries === null;
  });
}

export function getAutoFlowCommand(state: GameState): GameCommand | null {
  if (state.winner || !state.priorityPlayerId) {
    return null;
  }

  if (state.stack.length > 0) {
    return hasAnyPlayableCard(state, state.priorityPlayerId)
      ? null
      : {
          type: "PASS_PRIORITY",
          playerId: state.priorityPlayerId,
        };
  }

  if (state.priorityPlayerId !== state.activePlayerId) {
    return null;
  }

  if (state.phase === "discard") {
    return state.zones[state.activePlayerId].hand.length <= MAX_HAND_SIZE
      ? {
          type: "END_PHASE",
          playerId: state.activePlayerId,
        }
      : null;
  }

  if (state.phase === "main" && !hasAnyPlayableCard(state, state.activePlayerId)) {
    return {
      type: "END_PHASE",
      playerId: state.activePlayerId,
    };
  }

  if (state.phase === "tactical" && !hasAnyTacticalAction(state, state.activePlayerId) && !hasPendingTrackedHarvest(state, state.activePlayerId)) {
    return {
      type: "END_PHASE",
      playerId: state.activePlayerId,
    };
  }

  return null;
}
