import type { GameCommand } from "../actions/commands";
import { getMapAxialBounds, hexDistance, isWithinMapBounds } from "../model/hex";
import { MAX_HAND_SIZE, type GameState, type UnitEntity } from "../model/state";
import type { PlayerId } from "../model/ids";
import { canUnitHarvestNode, getResourceNodeAtCoord } from "../systems/harvesting";
import {
  canAttackEntityDirectly,
  canUnitDeclareAttack,
  canUnitMove,
} from "../rules/directInteraction";
import { hasEntityAtCoord } from "../model/queries";
import { hasAnyPlayableCard } from "./playableCards";

function hasAvailableMove(state: GameState, unit: UnitEntity): boolean {
  if (!canUnitMove(unit) || unit.movesRemaining <= 0) {
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
  if (!canUnitDeclareAttack(state, unit) || unit.attacksRemaining <= 0) {
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
