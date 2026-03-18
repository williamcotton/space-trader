import type { GameCommand } from "../actions/commands";
import { areSameHex, hexDistance, isWithinMapBounds } from "../model/hex";
import type { EntityState, GameState } from "../model/state";

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

export function validateCommand(state: GameState, command: GameCommand): CommandValidationResult {
  if (state.winner) {
    return { ok: false, reason: "Match is already over." };
  }

  switch (command.type) {
    case "ADVANCE_PHASE":
      return validateAdvancePhase(state, command.playerId);
    case "END_PHASE":
      return validateEndPhase(state, command.playerId);
    case "SELECT_ENTITY":
      return validateSelectEntity(state, command);
    case "MOVE_UNIT":
      return validateMoveUnit(state, command);
    case "ATTACK_UNIT":
      return validateAttackUnit(state, command);
    default:
      return { ok: false, reason: "Unknown command type." };
  }
}
