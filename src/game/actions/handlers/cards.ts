import type { GameCommand } from "../commands";
import type { GameEvent } from "../events";
import { getCardDefinition, getUnitCardKeywords, type CardCost } from "../../content/cards/catalog";
import { getStackEffectDefinition, getStackEffectMagnitude, type CounterDestination } from "../../content/stackEffects";
import { createStackItemId, getOpponentPlayer, popTopStackItem } from "../../turn/stack";
import type { PlayerId } from "../../model/ids";
import { syncPlayerZoneCounts, type CardInstance, type GameState, type HexCoord } from "../../model/state";
import { createContinuousEffectId, LAYER, nextEffectTimestamp } from "../../systems/continuousEffects";
import type { InstructionContext } from "../instructions";
import { executeInstructions } from "../instructionHandlers";
import { hasSproutKeyword } from "../../systems/keywords";

function applyCardCost(state: GameState, playerId: PlayerId, cost: CardCost): void {
  const pool = state.players[playerId].resources;
  for (const resource of ["credits", "alloy", "flux", "biomass"] as const) {
    pool[resource] = Math.max(0, pool[resource] - (cost[resource] ?? 0));
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

function createSummonedUnitId(state: GameState, playerId: PlayerId, cardId: string): string {
  const suffix = Object.keys(state.entities).length + state.log.length + state.turn;
  return `unit_${playerId}_${cardId}_${suffix}`;
}

function deployUnitToBattlefield(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  cardName: string,
  unitEntityId: string,
  spawnCoord: HexCoord
): void {
  const cardDefinition = getCardDefinition(cardId);
  if (!cardDefinition || cardDefinition.kind !== "unit") {
    return;
  }
  const keywords = getUnitCardKeywords(cardId);
  const gainsImmediateActions = hasSproutKeyword(keywords);
  const movesRemaining = gainsImmediateActions ? cardDefinition.unit.moveRange : 0;
  const attacksRemaining = gainsImmediateActions ? cardDefinition.unit.attackActionsPerTurn : 0;

  state.entities[unitEntityId] = {
    id: unitEntityId,
    kind: "unit",
    name: cardName,
    ownerId: playerId,
    role: cardDefinition.unit.role,
    hp: cardDefinition.unit.hp,
    maxHp: cardDefinition.unit.hp,
    attackDamage: cardDefinition.unit.attackDamage,
    siegeDamageBonus: cardDefinition.unit.siegeDamageBonus,
    armor: cardDefinition.unit.armor,
    moveRange: cardDefinition.unit.moveRange,
    attackRange: cardDefinition.unit.attackRange,
    attackActionsPerTurn: cardDefinition.unit.attackActionsPerTurn,
    coord: { ...spawnCoord },
    keywords,
    carries: null,
    sourceCardId: cardId,
    hasSummoningSickness: true,
    movesRemaining,
    attacksRemaining,
    temporaryAttackBonus: 0,
    temporaryArmorBonus: 0,
  };

  if (cardDefinition.unit.auras) {
    for (const aura of cardDefinition.unit.auras) {
      if (aura.attackBonus) {
        const ts = nextEffectTimestamp(state);
        state.continuousEffects.push({
          id: createContinuousEffectId(state, `${unitEntityId}_aura_atk`),
          sourceEntityId: unitEntityId,
          sourceCardId: cardId,
          controllerId: playerId,
          payload: { type: "stat_modifier", stat: "attackDamage", amount: aura.attackBonus },
          target: { type: "adjacent_allies", sourceEntityId: unitEntityId, roleFilter: aura.targetRole },
          expiry: { type: "while_source_alive", sourceEntityId: unitEntityId },
          layer: LAYER.STATIC,
          timestamp: ts,
        });
      }
      if (aura.armorBonus) {
        const ts = nextEffectTimestamp(state);
        state.continuousEffects.push({
          id: createContinuousEffectId(state, `${unitEntityId}_aura_arm`),
          sourceEntityId: unitEntityId,
          sourceCardId: cardId,
          controllerId: playerId,
          payload: { type: "stat_modifier", stat: "armor", amount: aura.armorBonus },
          target: { type: "adjacent_allies", sourceEntityId: unitEntityId, roleFilter: aura.targetRole },
          expiry: { type: "while_source_alive", sourceEntityId: unitEntityId },
          layer: LAYER.STATIC,
          timestamp: ts,
        });
      }
    }
  }

  state.log.push({
    turn: state.turn,
    text: `${playerId} deployed ${cardName} to (${spawnCoord.q}, ${spawnCoord.r}).`,
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
      itemId: createStackItemId(state.turn, state.log.length),
      label: command.label,
      controllerId: command.playerId,
      ownerId: command.playerId,
      effectId: command.effectId,
      effectMagnitude: getStackEffectMagnitude(command.effectId),
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
      stackItemId: createStackItemId(state.turn, state.log.length),
      effectId,
      effectMagnitude: getStackEffectMagnitude(effectId),
      targetStackItemId: command.targetStackItemId ?? null,
      targetEntityId: command.targetEntityId ?? null,
      targetHex: command.targetHex ?? null,
      objectKind: effectDefinition.object.kind,
      counterable: effectDefinition.object.counterable,
      defaultCounterDestination: effectDefinition.object.defaultCounterDestination,
      nextPriorityPlayerId: getOpponentPlayer(command.playerId),
      pendingUnitEntityId: card.play.reserveEntityId ? createSummonedUnitId(state, command.playerId, card.id) : null,
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
  state.log.push({
    turn: state.turn,
    text: `${event.playerId} cast ${event.cardName} from hand to stack.`,
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
  deployUnitToBattlefield(state, event.playerId, event.cardId, event.cardName, event.unitEntityId, event.spawnCoord);
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

  state.priorityPlayerId = state.activePlayerId;
  state.consecutivePriorityPasses = 0;
  const resolvedSourceDestination = applyResolvedStackEffect(state, resolvedItem);
  moveStackSourceCardToZone(state, resolvedItem, resolvedSourceDestination);
}
