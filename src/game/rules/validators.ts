import type { GameCommand } from "../actions/commands";
import { getCardDefinition, type CardCost } from "../content/cards/catalog";
import { getStackEffectDefinition } from "../content/stackEffects";
import { areSameHex, hexDistance, isWithinMapBounds } from "../model/hex";
import type { EntityState, GameState } from "../model/state";
import type { PlayerId } from "../model/ids";
import { canUnitHarvestNode, getResourceNodeById } from "../systems/harvesting";

export type CommandValidationResult = {
  ok: boolean;
  reason?: string;
};

function getEntity(state: GameState, entityId: string): EntityState | undefined {
  return state.entities[entityId];
}

function hasEntityAtCoord(state: GameState, q: number, r: number): boolean {
  return Object.values(state.entities).some((entity) => areSameHex(entity.coord, { q, r }));
}

function canAffordCardCost(state: GameState, playerId: PlayerId, cost: CardCost): boolean {
  const pool = state.players[playerId].resources;
  for (const resource of ["credits", "alloy", "flux", "biomass"] as const) {
    const required = cost[resource] ?? 0;
    if (pool[resource] < required) {
      return false;
    }
  }
  return true;
}

function getFirstOpenBaseAdjacentTile(state: GameState, playerId: PlayerId): { q: number; r: number } | null {
  const baseId = state.players[playerId].baseEntityId;
  const base = state.entities[baseId];
  if (!base || base.kind !== "base") {
    return null;
  }

  const candidates = [
    { q: base.coord.q + 1, r: base.coord.r },
    { q: base.coord.q + 1, r: base.coord.r - 1 },
    { q: base.coord.q, r: base.coord.r - 1 },
    { q: base.coord.q - 1, r: base.coord.r },
    { q: base.coord.q - 1, r: base.coord.r + 1 },
    { q: base.coord.q, r: base.coord.r + 1 },
  ];

  for (const coord of candidates) {
    if (!isWithinMapBounds(coord, state.map)) {
      continue;
    }
    if (!hasEntityAtCoord(state, coord.q, coord.r)) {
      return coord;
    }
  }

  return null;
}

function validateAdvancePhase(state: GameState, playerId: string): CommandValidationResult {
  if (state.activePlayerId !== playerId) {
    return { ok: false, reason: "Only the active player can advance the phase." };
  }

  return { ok: true };
}

function validateEndPhase(state: GameState, playerId: string): CommandValidationResult {
  if (state.activePlayerId !== playerId) {
    return { ok: false, reason: "Only the active player can end the phase." };
  }

  return { ok: true };
}

function validatePassPriority(state: GameState, playerId: string): CommandValidationResult {
  if (!state.priorityPlayerId) {
    return { ok: false, reason: "No player currently has priority." };
  }

  if (state.priorityPlayerId !== playerId) {
    return { ok: false, reason: "Only the priority player can pass priority." };
  }

  return { ok: true };
}

function validateRespondStack(state: GameState, command: Extract<GameCommand, { type: "RESPOND_STACK" }>): CommandValidationResult {
  if (!state.priorityPlayerId) {
    return { ok: false, reason: "No player currently has priority." };
  }

  if (state.priorityPlayerId !== command.playerId) {
    return { ok: false, reason: "Only the priority player can respond." };
  }

  if (!command.label.trim()) {
    return { ok: false, reason: "Response label is required." };
  }

  const effect = getStackEffectDefinition(command.effectId);
  if (!effect) {
    return { ok: false, reason: `Unknown stack effect: ${command.effectId}` };
  }

  const isCounterEffect = effect.resolution.type === "counter";
  if (isCounterEffect) {
    if (!command.targetStackItemId) {
      return { ok: false, reason: "Counter response requires a target stack item." };
    }

    const topItem = state.stack[state.stack.length - 1];
    if (!topItem) {
      return { ok: false, reason: "No stack item available to counter." };
    }

    if (topItem.id !== command.targetStackItemId) {
      return { ok: false, reason: "Counter target must be the current top stack item." };
    }

    if (!topItem.counterable) {
      return { ok: false, reason: "Target stack item is uncounterable." };
    }
  } else if (command.targetStackItemId) {
    return { ok: false, reason: "This response type does not accept a stack target." };
  }

  return { ok: true };
}

function validateSelectEntity(state: GameState, command: Extract<GameCommand, { type: "SELECT_ENTITY" }>): CommandValidationResult {
  if (state.activePlayerId !== command.playerId) {
    return { ok: false, reason: "Only the active player can select entities." };
  }

  const entity = getEntity(state, command.entityId);
  if (!entity) {
    return { ok: false, reason: "Entity does not exist." };
  }

  if (entity.ownerId !== command.playerId) {
    return { ok: false, reason: "Cannot select an entity owned by the opponent." };
  }

  if (entity.kind !== "unit") {
    return { ok: false, reason: "Only units are selectable in Phase 2." };
  }

  return { ok: true };
}

function validateClearSelection(state: GameState, command: Extract<GameCommand, { type: "CLEAR_SELECTION" }>): CommandValidationResult {
  if (state.activePlayerId !== command.playerId) {
    return { ok: false, reason: "Only the active player can clear selection." };
  }

  if (!state.selectedEntityId) {
    return { ok: false, reason: "No selected entity to clear." };
  }

  return { ok: true };
}

function validateMoveUnit(state: GameState, command: Extract<GameCommand, { type: "MOVE_UNIT" }>): CommandValidationResult {
  if (state.activePlayerId !== command.playerId) {
    return { ok: false, reason: "Only the active player can move units." };
  }

  if (state.phase !== "tactical") {
    return { ok: false, reason: "Units can only move during tactical phase." };
  }

  const entity = getEntity(state, command.entityId);
  if (!entity) {
    return { ok: false, reason: "Unit does not exist." };
  }

  if (entity.kind !== "unit") {
    return { ok: false, reason: "Only units can move." };
  }

  if (entity.ownerId !== command.playerId) {
    return { ok: false, reason: "Cannot move opponent unit." };
  }

  if (state.selectedEntityId !== command.entityId) {
    return { ok: false, reason: "Unit must be selected before moving." };
  }

  if (entity.hasSummoningSickness) {
    return { ok: false, reason: "Unit has summoning sickness." };
  }

  const distance = hexDistance(entity.coord, command.to);
  if (distance === 0) {
    return { ok: false, reason: "Unit is already on target tile." };
  }

  if (distance > entity.movesRemaining) {
    return { ok: false, reason: "Target tile is out of movement range." };
  }

  if (!isWithinMapBounds(command.to, state.map)) {
    return { ok: false, reason: "Target tile is outside map bounds." };
  }

  if (hasEntityAtCoord(state, command.to.q, command.to.r)) {
    return { ok: false, reason: "Target tile is occupied." };
  }

  return { ok: true };
}

function validateAttackUnit(state: GameState, command: Extract<GameCommand, { type: "ATTACK_UNIT" }>): CommandValidationResult {
  if (state.activePlayerId !== command.playerId) {
    return { ok: false, reason: "Only the active player can attack." };
  }

  if (state.phase !== "tactical") {
    return { ok: false, reason: "Units can only attack during tactical phase." };
  }

  const attacker = getEntity(state, command.attackerId);
  if (!attacker || attacker.kind !== "unit") {
    return { ok: false, reason: "Attacker must be a valid unit." };
  }

  if (attacker.ownerId !== command.playerId) {
    return { ok: false, reason: "Cannot attack with opponent unit." };
  }

  if (attacker.role !== "combat") {
    return { ok: false, reason: "Only combat units can attack." };
  }

  if (state.selectedEntityId !== command.attackerId) {
    return { ok: false, reason: "Attacker must be selected before attacking." };
  }

  if (attacker.hasSummoningSickness) {
    return { ok: false, reason: "Unit has summoning sickness." };
  }

  if (attacker.attacksRemaining <= 0) {
    return { ok: false, reason: "Unit has no attacks remaining." };
  }

  const target = getEntity(state, command.targetId);
  if (!target) {
    return { ok: false, reason: "Target does not exist." };
  }

  if (target.ownerId === command.playerId) {
    return { ok: false, reason: "Cannot attack friendly entity." };
  }

  const distance = hexDistance(attacker.coord, target.coord);
  if (distance > attacker.attackRange) {
    return { ok: false, reason: "Target is out of attack range." };
  }

  return { ok: true };
}

function validateHarvestNode(state: GameState, command: Extract<GameCommand, { type: "HARVEST_NODE" }>): CommandValidationResult {
  if (state.activePlayerId !== command.playerId) {
    return { ok: false, reason: "Only the active player can harvest." };
  }

  if (state.phase !== "tactical") {
    return { ok: false, reason: "Harvesting can only occur during tactical phase." };
  }

  const entity = getEntity(state, command.entityId);
  if (!entity || entity.kind !== "unit") {
    return { ok: false, reason: "Harvester must be a valid unit." };
  }

  if (!canUnitHarvestNode(entity, command.playerId)) {
    if (entity.ownerId !== command.playerId) {
      return { ok: false, reason: "Cannot harvest with opponent unit." };
    }
    if (entity.role !== "resource") {
      return { ok: false, reason: "Only resource units can harvest." };
    }
    return { ok: false, reason: "Unit is already carrying cargo." };
  }

  if (state.selectedEntityId !== command.entityId) {
    return { ok: false, reason: "Harvester must be selected before harvesting." };
  }

  const node = getResourceNodeById(state, command.nodeId);
  if (!node) {
    return { ok: false, reason: "Resource node does not exist." };
  }

  if (!areSameHex(entity.coord, node.coord)) {
    return { ok: false, reason: "Harvester must occupy the target node tile." };
  }

  if (node.controlledBy !== command.playerId) {
    return { ok: false, reason: "Node must be controlled before harvesting." };
  }

  return { ok: true };
}

function validatePlayCard(state: GameState, command: Extract<GameCommand, { type: "PLAY_CARD" }>): CommandValidationResult {
  if (!state.priorityPlayerId) {
    return { ok: false, reason: "No player currently has priority." };
  }

  if (state.priorityPlayerId !== command.playerId) {
    return { ok: false, reason: "Only the priority player can play a card." };
  }

  const handCard = state.zones[command.playerId].hand.find((card) => card.instanceId === command.cardInstanceId);
  if (!handCard) {
    return { ok: false, reason: "Card is not in hand." };
  }

  const card = getCardDefinition(handCard.cardId);
  if (!card) {
    return { ok: false, reason: `Unknown card definition: ${handCard.cardId}` };
  }

  if (!canAffordCardCost(state, command.playerId, card.cost)) {
    return { ok: false, reason: "Insufficient resources for card cost." };
  }

  if (card.speed === "main") {
    if (state.activePlayerId !== command.playerId) {
      return { ok: false, reason: "Main-speed cards can only be played by the active player." };
    }
    if (state.phase !== "main") {
      return { ok: false, reason: "Main-speed cards can only be played during main phase." };
    }
    if (state.stack.length > 0) {
      return { ok: false, reason: "Main-speed cards require an empty stack." };
    }
  }

  if (card.kind === "tactic") {
    const effect = getStackEffectDefinition(card.stackEffectId);
    if (!effect) {
      return { ok: false, reason: `Unknown stack effect: ${card.stackEffectId}` };
    }

    if (effect.resolution.type === "counter") {
      if (!command.targetStackItemId) {
        return { ok: false, reason: "Counter cards require a target stack item." };
      }

      const topItem = state.stack[state.stack.length - 1];
      if (!topItem) {
        return { ok: false, reason: "No stack item available to counter." };
      }

      if (topItem.id !== command.targetStackItemId) {
        return { ok: false, reason: "Counter target must be the current top stack item." };
      }

      if (!topItem.counterable) {
        return { ok: false, reason: "Target stack item is uncounterable." };
      }
    } else if (command.targetStackItemId) {
      return { ok: false, reason: "This card does not accept a stack target." };
    }
  } else {
    if (command.targetStackItemId) {
      return { ok: false, reason: "Unit cards do not accept stack targets." };
    }

    if (!getFirstOpenBaseAdjacentTile(state, command.playerId)) {
      return { ok: false, reason: "No open base-adjacent tile to deploy unit." };
    }
  }

  return { ok: true };
}

export function validateCommand(state: GameState, command: GameCommand): CommandValidationResult {
  if (state.winner) {
    return { ok: false, reason: "Match is already over." };
  }

  switch (command.type) {
    case "ADVANCE_PHASE":
      return validateAdvancePhase(state, command.playerId);
    case "END_PHASE":
      return validateEndPhase(state, command.playerId);
    case "PASS_PRIORITY":
      return validatePassPriority(state, command.playerId);
    case "RESPOND_STACK":
      return validateRespondStack(state, command);
    case "SELECT_ENTITY":
      return validateSelectEntity(state, command);
    case "CLEAR_SELECTION":
      return validateClearSelection(state, command);
    case "MOVE_UNIT":
      return validateMoveUnit(state, command);
    case "ATTACK_UNIT":
      return validateAttackUnit(state, command);
    case "HARVEST_NODE":
      return validateHarvestNode(state, command);
    case "PLAY_CARD":
      return validatePlayCard(state, command);
    default:
      return { ok: false, reason: "Unknown command type." };
  }
}
