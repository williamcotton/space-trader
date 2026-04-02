import type { GameCommand } from "../commands";
import type { GameEvent } from "../events";
import { getCardDefinition, type CardCost } from "../../content/cards/catalog";
import { getStackEffectDefinition, getStackEffectMagnitude, type CounterDestination } from "../../content/stackEffects";
import { getOpponentPlayer, popTopStackItem, reserveStackItemId } from "../../turn/stack";
import type { PlayerId } from "../../model/ids";
import type { ResourceType } from "../../model/enums";
import { syncPlayerZoneCounts, type CardInstance, type GameState } from "../../model/state";
import type { InstructionContext } from "../instructions";
import { createSummonedUnitId, deployUnitFromCard } from "../deployment";
import { executeInstructions } from "../instructionHandlers";
import { resetResolutionMechanicState } from "../../mechanics";
import { resolveCardCounterable } from "../../registries/cardCounterability";
import {
  getActiveCardPlayModifierIds,
  getCardPlayModifierLabels,
  runCardPlayedToStackModifierHooks,
} from "../../registries/cardPlayModifiers";

function applyCardCost(state: GameState, playerId: PlayerId, cost: CardCost): void {
  const pool = state.players[playerId].resources;
  for (const [resource, amount] of Object.entries(cost)) {
    pool[resource as ResourceType] = Math.max(0, pool[resource as ResourceType] - (amount ?? 0));
  }
}

function removeCardFromHand(state: GameState, playerId: PlayerId, cardInstanceId: string): CardInstance | null {
  const hand = state.zones[playerId].hand;
  const index = hand.findIndex((card) => card.instanceId === cardInstanceId);
  if (index < 0) {
    return null;
  }
  const [removed] = hand.splice(index, 1);
  return removed ?? null;
}

function addCardToZone(state: GameState, playerId: PlayerId, zone: "hand" | "discard" | "exile", card: CardInstance): void {
  state.zones[playerId][zone].push(card);
}

export function drawCardForPlayer(state: GameState, playerId: PlayerId, drawReason: "opening_hand" | "start_phase_draw"): void {
  const deck = state.zones[playerId].deck;
  const next = deck.shift();
  if (!next) {
    state.log.push({
      turn: state.turn,
      text: `${playerId} attempted satellite download (${drawReason}) but deck is empty.`,
    });
    syncPlayerZoneCounts(state);
    return;
  }

  state.zones[playerId].hand.push(next);
  syncPlayerZoneCounts(state);
  state.log.push({
    turn: state.turn,
    text: `${playerId} downloaded ${next.cardId} from satellite (${drawReason}).`,
  });
}

function moveStackSourceCardToZone(state: GameState, stackItem: GameState["stack"][number], destination: "hand" | "discard" | "exile" | "none"): void {
  if (destination === "none") {
    return;
  }
  if (!stackItem.sourceCardInstanceId || !stackItem.sourceCardId || !stackItem.sourceCardOwnerId) {
    return;
  }

  const card: CardInstance = {
    instanceId: stackItem.sourceCardInstanceId,
    cardId: stackItem.sourceCardId,
    ownerId: stackItem.sourceCardOwnerId,
  };
  addCardToZone(state, stackItem.sourceCardOwnerId, destination, card);
  syncPlayerZoneCounts(state);
}

type StackItem = GameState["stack"][number];
function applyResolvedStackEffect(state: GameState, resolvedItem: StackItem): CounterDestination {
  const sourceCard = resolvedItem.sourceCardId ? getCardDefinition(resolvedItem.sourceCardId) : undefined;
  const definition = getStackEffectDefinition(resolvedItem.effectId);

  if (!sourceCard?.onResolve && !definition) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${resolvedItem.label}: unknown effect id ${resolvedItem.effectId}.`,
    });
    return "discard";
  }

  const context: InstructionContext = {
    state,
    item: resolvedItem,
    controllerId: resolvedItem.controllerId,
    targetEntityId: resolvedItem.targetEntityId,
    targetStackItemId: resolvedItem.targetStackItemId,
    targetHex: resolvedItem.targetHex ?? null,
  };
  const instructions = sourceCard?.onResolve
    ? sourceCard.onResolve(context)
    : definition!.createInstructions(context);
  executeInstructions(state, instructions);

  return sourceCard?.play.sourceDestinationOnResolve ?? "discard";
}

export function handleRespondStack(
  state: GameState,
  command: Extract<GameCommand, { type: "RESPOND_STACK" }>
): GameEvent[] {
  const definition = getStackEffectDefinition(command.effectId);
  if (!definition) {
    return [];
  }
  return [
    {
      type: "STACK_ITEM_PUSHED",
      playerId: command.playerId,
      itemId: reserveStackItemId(state),
      label: command.label,
      controllerId: command.playerId,
      ownerId: command.playerId,
      effectId: command.effectId,
      effectMagnitude: getStackEffectMagnitude(command.effectId),
      activeModifierIds: [],
      targetStackItemId: command.targetStackItemId ?? null,
      targetEntityId: null,
      objectKind: definition.object.kind,
      counterable: definition.object.counterable,
      defaultCounterDestination: definition.object.defaultCounterDestination,
      sourceCardInstanceId: null,
      sourceCardId: null,
      sourceCardOwnerId: null,
      nextPriorityPlayerId: getOpponentPlayer(command.playerId),
      pendingUnitEntityId: null,
    },
  ];
}

export function handlePlayCard(
  state: GameState,
  command: Extract<GameCommand, { type: "PLAY_CARD" }>
): GameEvent[] {
  const handCard = state.zones[command.playerId].hand.find((card) => card.instanceId === command.cardInstanceId);
  if (!handCard) {
    return [];
  }

  const card = getCardDefinition(handCard.cardId);
  if (!card) {
    return [];
  }

  const activeModifierIds = getActiveCardPlayModifierIds(state, command.playerId, card);
  const effectId = card.play.stackEffectId;
  const effectDefinition = getStackEffectDefinition(effectId);
  if (!effectDefinition) {
    return [];
  }

  const events: GameEvent[] = [
    {
      type: "CARD_PLAYED_TO_STACK",
      playerId: command.playerId,
      cardInstanceId: handCard.instanceId,
      cardId: handCard.cardId,
      cardName: card.name,
      cost: card.cost,
      stackItemId: reserveStackItemId(state),
      effectId,
      effectMagnitude: getStackEffectMagnitude(effectId, handCard.cardId, activeModifierIds),
      activeModifierIds,
      targetStackItemId: command.targetStackItemId ?? null,
      targetEntityId: command.targetEntityId ?? null,
      targetHex: command.targetHex ?? null,
      objectKind: effectDefinition.object.kind,
      counterable: resolveCardCounterable(card, effectDefinition, effectDefinition.object.counterable),
      defaultCounterDestination: effectDefinition.object.defaultCounterDestination,
      nextPriorityPlayerId: getOpponentPlayer(command.playerId),
      pendingUnitEntityId: card.play.reserveEntityId
        ? createSummonedUnitId(state, command.playerId, card.id, handCard.instanceId)
        : null,
    },
  ];

  return events;
}

export function handleDiscardCard(
  state: GameState,
  command: Extract<GameCommand, { type: "DISCARD_CARD" }>
): GameEvent[] {
  const handCard = state.zones[command.playerId].hand.find((card) => card.instanceId === command.cardInstanceId);
  if (!handCard) {
    return [];
  }

  return [
    {
      type: "CARD_DISCARDED",
      playerId: command.playerId,
      cardInstanceId: handCard.instanceId,
      cardId: handCard.cardId,
    },
  ];
}

export function reduceCardPlayedToStack(
  state: GameState,
  event: Extract<GameEvent, { type: "CARD_PLAYED_TO_STACK" }>
): void {
  const card = removeCardFromHand(state, event.playerId, event.cardInstanceId);
  const cardDefinition = getCardDefinition(event.cardId);
  if (!card || !cardDefinition) {
    return;
  }

  applyCardCost(state, event.playerId, event.cost);
  syncPlayerZoneCounts(state);
  state.stack.push({
    id: event.stackItemId,
    label: event.cardName,
    controllerId: event.playerId,
    ownerId: event.playerId,
    effectId: event.effectId,
    effectMagnitude: event.effectMagnitude,
    activeModifierIds: [...(event.activeModifierIds ?? [])],
    targetStackItemId: event.targetStackItemId,
    targetEntityId: event.targetEntityId,
    targetHex: event.targetHex ?? null,
    objectKind: event.objectKind,
    counterable: event.counterable,
    defaultCounterDestination: event.defaultCounterDestination,
    sourceCardInstanceId: card.instanceId,
    sourceCardId: card.cardId,
    sourceCardOwnerId: card.ownerId,
    pendingUnitEntityId: event.pendingUnitEntityId,
  });
  state.priorityPlayerId = event.nextPriorityPlayerId;
  state.consecutivePriorityPasses = 0;
  runCardPlayedToStackModifierHooks(state, event.playerId, cardDefinition, event.activeModifierIds ?? []);
  const modifierLabels = getCardPlayModifierLabels(event.activeModifierIds ?? []);
  state.log.push({
    turn: state.turn,
    text: `${event.playerId} cast ${event.cardName} from hand to stack${modifierLabels.length > 0 ? ` with ${modifierLabels.join(", ")}` : ""}.`,
  });
}

export function reduceCardPlayedToBattlefield(
  state: GameState,
  event: Extract<GameEvent, { type: "CARD_PLAYED_TO_BATTLEFIELD" }>
): void {
  const card = removeCardFromHand(state, event.playerId, event.cardInstanceId);
  const cardDefinition = getCardDefinition(event.cardId);
  if (!card || !cardDefinition || cardDefinition.kind !== "unit") {
    return;
  }

  applyCardCost(state, event.playerId, event.cost);
  syncPlayerZoneCounts(state);
  deployUnitFromCard(state, {
    controllerId: event.playerId,
    cardId: event.cardId,
    cardName: event.cardName,
    entityId: event.unitEntityId,
    spawnCoord: event.spawnCoord,
  });
}

export function reduceCardDiscarded(
  state: GameState,
  event: Extract<GameEvent, { type: "CARD_DISCARDED" }>
): void {
  const card = removeCardFromHand(state, event.playerId, event.cardInstanceId);
  if (!card) {
    return;
  }

  addCardToZone(state, event.playerId, "discard", card);
  syncPlayerZoneCounts(state);
  state.log.push({
    turn: state.turn,
    text: `${event.playerId} discarded ${event.cardId}.`,
  });
}

export function reduceStackItemPushed(
  state: GameState,
  event: Extract<GameEvent, { type: "STACK_ITEM_PUSHED" }>
): void {
  state.stack.push({
    id: event.itemId,
    label: event.label,
    controllerId: event.controllerId,
    ownerId: event.ownerId,
    effectId: event.effectId,
    effectMagnitude: event.effectMagnitude,
    activeModifierIds: [...(event.activeModifierIds ?? [])],
    targetStackItemId: event.targetStackItemId,
    targetEntityId: event.targetEntityId,
    targetHex: event.targetHex ?? null,
    objectKind: event.objectKind,
    counterable: event.counterable,
    defaultCounterDestination: event.defaultCounterDestination,
    sourceCardInstanceId: event.sourceCardInstanceId,
    sourceCardId: event.sourceCardId,
    sourceCardOwnerId: event.sourceCardOwnerId,
    pendingUnitEntityId: event.pendingUnitEntityId,
  });
  state.priorityPlayerId = event.nextPriorityPlayerId;
  state.consecutivePriorityPasses = 0;
  state.log.push({
    turn: state.turn,
    text: `${event.playerId} added stack item: ${event.label} [${event.effectId}].`,
  });
}

export function reduceStackItemResolved(
  state: GameState,
  _event: Extract<GameEvent, { type: "STACK_ITEM_RESOLVED" }>
): void {
  const resolvedItem = popTopStackItem(state.stack);
  if (!resolvedItem) {
    return;
  }

  resetResolutionMechanicState(state);
  state.priorityPlayerId = state.activePlayerId;
  state.consecutivePriorityPasses = 0;
  const resolvedSourceDestination = applyResolvedStackEffect(state, resolvedItem);
  moveStackSourceCardToZone(state, resolvedItem, resolvedSourceDestination);
}
