import type { PlayCardCommand } from "../actions/commands";
import { getCardDefinition, type CardDefinition } from "../content/cards/catalog";
import { getStackEffectDefinition } from "../content/stackEffects";
import { getMapAxialBounds, isWithinMapBounds } from "../model/hex";
import type { PlayerId } from "../model/ids";
import type { GameState, HexCoord } from "../model/state";
import { canAffordCardCost, getFirstOpenBaseAdjacentTile } from "../model/queries";
import { getDirectTargetingBlockReason } from "./directInteraction";
import type { CommandValidationResult } from "./validators";

export type PlayCardTargetOption = Pick<PlayCardCommand, "targetStackItemId" | "targetEntityId" | "targetHex">;

function getCandidateHexes(state: Readonly<GameState>): HexCoord[] {
  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  const hexes: HexCoord[] = [];
  for (let q = qMin; q <= qMax; q += 1) {
    for (let r = rMin; r <= rMax; r += 1) {
      const coord = { q, r };
      if (isWithinMapBounds(coord, state.map)) {
        hexes.push(coord);
      }
    }
  }
  return hexes;
}

export function getRequiredPlayCardTargetMode(definition: CardDefinition): "entity" | "hex" | null {
  if (definition.play.targetMode === "entity" || definition.play.targetMode === "hex") {
    return definition.play.targetMode;
  }
  return null;
}

export function getPlayCardTargetPrompt(cardName: string, definition: CardDefinition): string {
  const targetMode = getRequiredPlayCardTargetMode(definition);
  return `Select ${targetMode === "hex" ? "hex" : "target"} for ${cardName}.`;
}

export function validatePlayCardBaseConditions(
  state: Readonly<GameState>,
  playerId: PlayerId,
  cardInstanceId: string,
  definition: CardDefinition
): CommandValidationResult {
  if (state.phase === "discard") {
    return { ok: false, reason: "Cannot play cards during discard phase." };
  }

  if (!state.priorityPlayerId) {
    return { ok: false, reason: "No player currently has priority." };
  }

  if (state.priorityPlayerId !== playerId) {
    return { ok: false, reason: "Only the priority player can play a card." };
  }

  const handCard = state.zones[playerId].hand.find((card) => card.instanceId === cardInstanceId);
  if (!handCard) {
    return { ok: false, reason: "Card is not in hand." };
  }

  if (!canAffordCardCost(state as GameState, playerId, definition.cost)) {
    return { ok: false, reason: "Insufficient resources for card cost." };
  }

  if (definition.speed === "main") {
    if (state.activePlayerId !== playerId) {
      return { ok: false, reason: "Main-speed cards can only be played by the active player." };
    }
    if (state.phase !== "main") {
      return { ok: false, reason: "Main-speed cards can only be played during main phase." };
    }
    if (state.stack.length > 0) {
      return { ok: false, reason: "Main-speed cards require an empty stack." };
    }
  }

  return { ok: true };
}

function validateEntityTargetForCard(
  state: Readonly<GameState>,
  playerId: PlayerId,
  targetEntityId: string | undefined,
  definition: CardDefinition
): CommandValidationResult {
  if (!targetEntityId) {
    return { ok: false, reason: "This card requires a battlefield target." };
  }

  const target = state.entities[targetEntityId];
  if (!target) {
    return { ok: false, reason: "Target entity does not exist." };
  }

  if (definition.play.targetMode !== "entity") {
    return { ok: true };
  }

  if (!definition.play.isValidTarget(state as GameState, target, playerId)) {
    return { ok: false, reason: "Target does not meet card requirements." };
  }

  const blockReason = getDirectTargetingBlockReason(state, playerId, target);
  if (blockReason) {
    return { ok: false, reason: blockReason };
  }

  return { ok: true };
}

function validateHexTargetForCard(
  state: Readonly<GameState>,
  playerId: PlayerId,
  targetHex: HexCoord | undefined,
  definition: CardDefinition
): CommandValidationResult {
  if (!targetHex) {
    return { ok: false, reason: "This card requires a hex target." };
  }

  if (definition.play.targetMode !== "hex") {
    return { ok: true };
  }

  if (!isWithinMapBounds(targetHex, state.map)) {
    return { ok: false, reason: "Target hex is outside map bounds." };
  }

  if (!definition.play.isValidHexTarget(state as GameState, targetHex, playerId)) {
    return { ok: false, reason: "Target hex does not meet card requirements." };
  }

  return { ok: true };
}

export function validatePlayCardTargetSelection(
  state: Readonly<GameState>,
  playerId: PlayerId,
  definition: CardDefinition,
  targeting: PlayCardTargetOption
): CommandValidationResult {
  const effect = getStackEffectDefinition(definition.play.stackEffectId);
  if (!effect) {
    return { ok: false, reason: `Unknown stack effect: ${definition.play.stackEffectId}` };
  }

  if (definition.play.targetMode === "stack_item") {
    if (!targeting.targetStackItemId) {
      return { ok: false, reason: "Counter cards require a target stack item." };
    }
    const topItem = state.stack[state.stack.length - 1];
    if (!topItem) {
      return { ok: false, reason: "No stack item available to counter." };
    }
    if (topItem.id !== targeting.targetStackItemId) {
      return { ok: false, reason: "Counter target must be the current top stack item." };
    }
    if (!topItem.counterable) {
      return { ok: false, reason: "Target stack item is uncounterable." };
    }
    if (targeting.targetEntityId) {
      return { ok: false, reason: "This card does not accept a battlefield target." };
    }
    if (targeting.targetHex) {
      return { ok: false, reason: "This card does not accept a hex target." };
    }
    return { ok: true };
  }

  if (definition.play.targetMode === "entity") {
    if (targeting.targetStackItemId) {
      return { ok: false, reason: "This card does not accept a stack target." };
    }
    if (targeting.targetHex) {
      return { ok: false, reason: "This card does not accept a hex target." };
    }
    return validateEntityTargetForCard(state, playerId, targeting.targetEntityId, definition);
  }

  if (definition.play.targetMode === "hex") {
    if (targeting.targetStackItemId) {
      return { ok: false, reason: "This card does not accept a stack target." };
    }
    if (targeting.targetEntityId) {
      return { ok: false, reason: "This card does not accept a battlefield target." };
    }
    return validateHexTargetForCard(state, playerId, targeting.targetHex, definition);
  }

  if (targeting.targetStackItemId) {
    return { ok: false, reason: "This card does not accept a stack target." };
  }
  if (targeting.targetEntityId) {
    return { ok: false, reason: "This card does not accept a battlefield target." };
  }
  if (targeting.targetHex) {
    return { ok: false, reason: "This card does not accept a hex target." };
  }

  if (definition.play.requiresOpenBaseAdjacentTile && !getFirstOpenBaseAdjacentTile(state as GameState, playerId)) {
    return { ok: false, reason: "No open base-adjacent tile to deploy unit." };
  }

  return { ok: true };
}

function getCandidateTargetOptions(
  state: Readonly<GameState>,
  definition: CardDefinition
): PlayCardTargetOption[] {
  switch (definition.play.targetMode) {
    case "none":
      return [{}];
    case "stack_item": {
      const topItemId = state.stack[state.stack.length - 1]?.id;
      return topItemId ? [{ targetStackItemId: topItemId }] : [];
    }
    case "entity":
      return Object.values(state.entities)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((entity) => ({ targetEntityId: entity.id }));
    case "hex":
      return getCandidateHexes(state).map((targetHex) => ({ targetHex }));
  }
}

export function validatePlayCardCommand(
  state: Readonly<GameState>,
  playerId: PlayerId,
  cardInstanceId: string,
  definition: CardDefinition,
  targeting: PlayCardTargetOption
): CommandValidationResult {
  const baseResult = validatePlayCardBaseConditions(state, playerId, cardInstanceId, definition);
  if (!baseResult.ok) {
    return baseResult;
  }
  return validatePlayCardTargetSelection(state, playerId, definition, targeting);
}

export function getLegalPlayCardTargetOptions(
  state: Readonly<GameState>,
  playerId: PlayerId,
  cardInstanceId: string,
  definition: CardDefinition
): PlayCardTargetOption[] {
  const baseResult = validatePlayCardBaseConditions(state, playerId, cardInstanceId, definition);
  if (!baseResult.ok) {
    return [];
  }

  return getCandidateTargetOptions(state, definition).filter((targeting) =>
    validatePlayCardTargetSelection(state, playerId, definition, targeting).ok
  );
}

export function hasLegalPlayCardTargetOption(
  state: Readonly<GameState>,
  playerId: PlayerId,
  cardInstanceId: string,
  definition: CardDefinition
): boolean {
  return getLegalPlayCardTargetOptions(state, playerId, cardInstanceId, definition).length > 0;
}

export function getCardDefinitionForInstance(
  state: Readonly<GameState>,
  playerId: PlayerId,
  cardInstanceId: string
): CardDefinition | undefined {
  const handCard = state.zones[playerId].hand.find((card) => card.instanceId === cardInstanceId);
  return handCard ? getCardDefinition(handCard.cardId) : undefined;
}
