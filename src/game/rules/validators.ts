import type { GameCommand } from "../actions/commands";
import { getCardDefinition, type CardDefinition, type TacticCardDefinition } from "../content/cards/catalog";
import { getStackEffectDefinition } from "../content/stackEffects";
import { areSameHex, hexDistance, isWithinMapBounds } from "../model/hex";
import { MAX_HAND_SIZE, type EntityState, type GameState } from "../model/state";
import type { PlayerId } from "../model/ids";
import { canUnitHarvestNode, getResourceNodeById } from "../systems/harvesting";
import { canAffordCardCost, getFirstOpenBaseAdjacentTile, hasEntityAtCoord } from "../model/queries";

export type CommandValidationResult = {
  ok: boolean;
  reason?: string;
};

// --- Reusable Rule Functions ---

function getEntity(state: GameState, entityId: string): EntityState | undefined {
  return state.entities[entityId];
}

function requireActivePlayer(state: GameState, playerId: string, action: string): CommandValidationResult | null {
  return state.activePlayerId !== playerId ? { ok: false, reason: `Only the active player can ${action}.` } : null;
}

function requireEmptyStack(state: GameState, action: string): CommandValidationResult | null {
  return state.stack.length > 0 ? { ok: false, reason: `Cannot ${action} while stack items are unresolved.` } : null;
}

function requirePriority(state: GameState, playerId: string, action: string): CommandValidationResult | null {
  if (!state.priorityPlayerId) return { ok: false, reason: "No player currently has priority." };
  return state.priorityPlayerId !== playerId ? { ok: false, reason: `Only the priority player can ${action}.` } : null;
}

function requireTacticalPhase(state: GameState, action: string): CommandValidationResult | null {
  return state.phase !== "tactical" ? { ok: false, reason: `${action} can only occur during tactical phase.` } : null;
}

function requireNotDiscardPhase(state: GameState, action: string): CommandValidationResult | null {
  return state.phase === "discard" ? { ok: false, reason: `Cannot ${action} during discard phase.` } : null;
}

function requireDiscardPhase(state: GameState): CommandValidationResult | null {
  return state.phase !== "discard" ? { ok: false, reason: "Cards can only be discarded during discard phase." } : null;
}

// --- Entity Target Validation ---

function validateEntityTargetForEffect(
  state: GameState,
  playerId: PlayerId,
  targetEntityId: string | undefined,
  effectId: string,
  card?: TacticCardDefinition
): CommandValidationResult {
  // New path: card-level predicate
  if (card?.isValidTarget) {
    if (!targetEntityId) {
      return { ok: false, reason: "This card requires a battlefield target." };
    }
    const target = getEntity(state, targetEntityId);
    if (!target) {
      return { ok: false, reason: "Target entity does not exist." };
    }
    if (!card.isValidTarget(state, target, playerId)) {
      return { ok: false, reason: "Target does not meet card requirements." };
    }
    return { ok: true };
  }

  // Legacy fallback: enum-based targeting from stack effect definition
  const effect = getStackEffectDefinition(effectId);
  if (!effect || effect.targeting.type !== "entity") {
    return { ok: true };
  }

  if (!targetEntityId) {
    return { ok: false, reason: "This card requires a battlefield target." };
  }

  const target = getEntity(state, targetEntityId);
  if (!target) {
    return { ok: false, reason: "Target entity does not exist." };
  }

  if (effect.targeting.entityKind === "unit" && target.kind !== "unit") {
    return { ok: false, reason: "This card must target a unit." };
  }

  if (effect.targeting.relation === "ally" && target.ownerId !== playerId) {
    return { ok: false, reason: "This card must target an allied unit." };
  }

  if (effect.targeting.relation === "enemy" && target.ownerId === playerId) {
    return { ok: false, reason: "This card must target an enemy entity." };
  }

  if (effect.targeting.requireDamaged && target.hp >= target.maxHp) {
    return { ok: false, reason: "This card requires a damaged target." };
  }

  return { ok: true };
}

// --- Command Validators ---

function validateAdvancePhase(state: GameState, playerId: string): CommandValidationResult {
  return requireActivePlayer(state, playerId, "advance the phase")
    ?? requireEmptyStack(state, "advance phases")
    ?? (state.phase === "discard" && state.zones[state.activePlayerId].hand.length > MAX_HAND_SIZE
      ? { ok: false, reason: `Discard down to ${MAX_HAND_SIZE} cards before ending the turn.` }
      : null)
    ?? { ok: true };
}

function validateEndPhase(state: GameState, playerId: string): CommandValidationResult {
  return requireActivePlayer(state, playerId, "end the phase")
    ?? requireEmptyStack(state, "end phases")
    ?? (state.phase === "discard" && state.zones[state.activePlayerId].hand.length > MAX_HAND_SIZE
      ? { ok: false, reason: `Discard down to ${MAX_HAND_SIZE} cards before ending the turn.` }
      : null)
    ?? { ok: true };
}

function validatePassPriority(state: GameState, playerId: string): CommandValidationResult {
  return requireNotDiscardPhase(state, "pass priority")
    ?? requirePriority(state, playerId, "pass priority")
    ?? { ok: true };
}

function validateRespondStack(state: GameState, command: Extract<GameCommand, { type: "RESPOND_STACK" }>): CommandValidationResult {
  const fail = requireNotDiscardPhase(state, "respond")
    ?? requirePriority(state, command.playerId, "respond");
  if (fail) return fail;

  if (!command.label.trim()) {
    return { ok: false, reason: "Response label is required." };
  }

  const effect = getStackEffectDefinition(command.effectId);
  if (!effect) {
    return { ok: false, reason: `Unknown stack effect: ${command.effectId}` };
  }

  const isCounterEffect = effect.behavior.type === "counter";
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
  const fail = requireActivePlayer(state, command.playerId, "select entities")
    ?? requireNotDiscardPhase(state, "select entities")
    ?? requireEmptyStack(state, "select units");
  if (fail) return fail;

  const entity = getEntity(state, command.entityId);
  if (!entity) return { ok: false, reason: "Entity does not exist." };
  if (entity.ownerId !== command.playerId) return { ok: false, reason: "Cannot select an entity owned by the opponent." };
  if (entity.kind !== "unit") return { ok: false, reason: "Only units are selectable in Phase 2." };

  return { ok: true };
}

function validateClearSelection(state: GameState, command: Extract<GameCommand, { type: "CLEAR_SELECTION" }>): CommandValidationResult {
  return requireActivePlayer(state, command.playerId, "clear selection")
    ?? requireNotDiscardPhase(state, "clear selection")
    ?? requireEmptyStack(state, "clear selection")
    ?? (!state.selectedEntityId ? { ok: false, reason: "No selected entity to clear." } : null)
    ?? { ok: true };
}

function validateMoveUnit(state: GameState, command: Extract<GameCommand, { type: "MOVE_UNIT" }>): CommandValidationResult {
  const fail = requireActivePlayer(state, command.playerId, "move units")
    ?? requireEmptyStack(state, "move units")
    ?? requireTacticalPhase(state, "Moving units");
  if (fail) return fail;

  const entity = getEntity(state, command.entityId);
  if (!entity) return { ok: false, reason: "Unit does not exist." };
  if (entity.kind !== "unit") return { ok: false, reason: "Only units can move." };
  if (entity.ownerId !== command.playerId) return { ok: false, reason: "Cannot move opponent unit." };
  if (state.selectedEntityId !== command.entityId) return { ok: false, reason: "Unit must be selected before moving." };
  if (entity.hasSummoningSickness) return { ok: false, reason: "Unit has summoning sickness." };

  const distance = hexDistance(entity.coord, command.to);
  if (distance === 0) return { ok: false, reason: "Unit is already on target tile." };
  if (distance > entity.movesRemaining) return { ok: false, reason: "Target tile is out of movement range." };
  if (!isWithinMapBounds(command.to, state.map)) return { ok: false, reason: "Target tile is outside map bounds." };
  if (hasEntityAtCoord(state, command.to)) return { ok: false, reason: "Target tile is occupied." };

  return { ok: true };
}

function validateAttackUnit(state: GameState, command: Extract<GameCommand, { type: "ATTACK_UNIT" }>): CommandValidationResult {
  const fail = requireActivePlayer(state, command.playerId, "attack")
    ?? requireEmptyStack(state, "attack")
    ?? requireTacticalPhase(state, "Attacking");
  if (fail) return fail;

  const attacker = getEntity(state, command.attackerId);
  if (!attacker || attacker.kind !== "unit") return { ok: false, reason: "Attacker must be a valid unit." };
  if (attacker.ownerId !== command.playerId) return { ok: false, reason: "Cannot attack with opponent unit." };
  if (attacker.role !== "combat") return { ok: false, reason: "Only combat units can attack." };
  if (state.selectedEntityId !== command.attackerId) return { ok: false, reason: "Attacker must be selected before attacking." };
  if (attacker.hasSummoningSickness) return { ok: false, reason: "Unit has summoning sickness." };
  if (attacker.attacksRemaining <= 0) return { ok: false, reason: "Unit has no attacks remaining." };

  const target = getEntity(state, command.targetId);
  if (!target) return { ok: false, reason: "Target does not exist." };
  if (target.ownerId === command.playerId) return { ok: false, reason: "Cannot attack friendly entity." };

  const distance = hexDistance(attacker.coord, target.coord);
  if (distance > attacker.attackRange) return { ok: false, reason: "Target is out of attack range." };

  return { ok: true };
}

function validateHarvestNode(state: GameState, command: Extract<GameCommand, { type: "HARVEST_NODE" }>): CommandValidationResult {
  const fail = requireActivePlayer(state, command.playerId, "harvest")
    ?? requireEmptyStack(state, "harvest")
    ?? requireTacticalPhase(state, "Harvesting");
  if (fail) return fail;

  const entity = getEntity(state, command.entityId);
  if (!entity || entity.kind !== "unit") return { ok: false, reason: "Harvester must be a valid unit." };

  if (!canUnitHarvestNode(entity, command.playerId)) {
    if (entity.ownerId !== command.playerId) return { ok: false, reason: "Cannot harvest with opponent unit." };
    if (entity.role !== "resource") return { ok: false, reason: "Only resource units can harvest." };
    return { ok: false, reason: "Unit is already carrying cargo." };
  }

  if (state.selectedEntityId !== command.entityId) return { ok: false, reason: "Harvester must be selected before harvesting." };

  const node = getResourceNodeById(state, command.nodeId);
  if (!node) return { ok: false, reason: "Resource node does not exist." };
  if (!areSameHex(entity.coord, node.coord)) return { ok: false, reason: "Harvester must occupy the target node tile." };
  if (node.controlledBy !== command.playerId) return { ok: false, reason: "Node must be controlled before harvesting." };

  return { ok: true };
}

// --- Card Validation Helpers ---

function validateCardSpeed(
  state: GameState,
  command: Extract<GameCommand, { type: "PLAY_CARD" }>,
  card: CardDefinition
): CommandValidationResult {
  if (card.speed !== "main") return { ok: true };
  if (state.activePlayerId !== command.playerId) return { ok: false, reason: "Main-speed cards can only be played by the active player." };
  if (state.phase !== "main") return { ok: false, reason: "Main-speed cards can only be played during main phase." };
  if (state.stack.length > 0) return { ok: false, reason: "Main-speed cards require an empty stack." };
  return { ok: true };
}

function validateTacticTargeting(
  state: GameState,
  command: Extract<GameCommand, { type: "PLAY_CARD" }>,
  card: Extract<CardDefinition, { kind: "tactic" }>
): CommandValidationResult {
  // Determine targeting mode: card-level targetHint takes priority, then legacy effect definition
  const targetHint = card.targetHint;
  const effect = getStackEffectDefinition(card.stackEffectId);
  if (!effect) return { ok: false, reason: `Unknown stack effect: ${card.stackEffectId}` };

  const targetingType = targetHint ?? effect.targeting.type;

  if (targetingType === "stack_item") {
    if (!command.targetStackItemId) return { ok: false, reason: "Counter cards require a target stack item." };
    const topItem = state.stack[state.stack.length - 1];
    if (!topItem) return { ok: false, reason: "No stack item available to counter." };
    if (topItem.id !== command.targetStackItemId) return { ok: false, reason: "Counter target must be the current top stack item." };
    if (!topItem.counterable) return { ok: false, reason: "Target stack item is uncounterable." };
    if (command.targetEntityId) return { ok: false, reason: "This card does not accept a battlefield target." };
    return { ok: true };
  }

  if (targetingType === "entity") {
    if (command.targetStackItemId) return { ok: false, reason: "This card does not accept a stack target." };
    return validateEntityTargetForEffect(state, command.playerId, command.targetEntityId, card.stackEffectId, card);
  }

  if (command.targetStackItemId) return { ok: false, reason: "This card does not accept a stack target." };
  if (command.targetEntityId) return { ok: false, reason: "This card does not accept a battlefield target." };
  return { ok: true };
}

function validateUnitTargeting(
  state: GameState,
  command: Extract<GameCommand, { type: "PLAY_CARD" }>
): CommandValidationResult {
  if (command.targetStackItemId) return { ok: false, reason: "Unit cards do not accept stack targets." };
  if (command.targetEntityId) return { ok: false, reason: "Unit cards do not accept battlefield targets." };
  if (!getFirstOpenBaseAdjacentTile(state, command.playerId)) return { ok: false, reason: "No open base-adjacent tile to deploy unit." };
  return { ok: true };
}

function validatePlayCard(state: GameState, command: Extract<GameCommand, { type: "PLAY_CARD" }>): CommandValidationResult {
  const fail = requireNotDiscardPhase(state, "play cards")
    ?? requirePriority(state, command.playerId, "play a card");
  if (fail) return fail;

  const handCard = state.zones[command.playerId].hand.find((card) => card.instanceId === command.cardInstanceId);
  if (!handCard) return { ok: false, reason: "Card is not in hand." };

  const card = getCardDefinition(handCard.cardId);
  if (!card) return { ok: false, reason: `Unknown card definition: ${handCard.cardId}` };
  if (!canAffordCardCost(state, command.playerId, card.cost)) return { ok: false, reason: "Insufficient resources for card cost." };

  const speedResult = validateCardSpeed(state, command, card);
  if (!speedResult.ok) return speedResult;

  if (card.kind === "tactic") return validateTacticTargeting(state, command, card);
  return validateUnitTargeting(state, command);
}

function validateDiscardCard(state: GameState, command: Extract<GameCommand, { type: "DISCARD_CARD" }>): CommandValidationResult {
  return requireActivePlayer(state, command.playerId, "discard cards")
    ?? requireDiscardPhase(state)
    ?? (!state.zones[command.playerId].hand.some((card) => card.instanceId === command.cardInstanceId)
      ? { ok: false, reason: "Card is not in hand." }
      : null)
    ?? { ok: true };
}

// --- Command Dispatcher ---

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
    case "DISCARD_CARD":
      return validateDiscardCard(state, command);
    default:
      return { ok: false, reason: "Unknown command type." };
  }
}
