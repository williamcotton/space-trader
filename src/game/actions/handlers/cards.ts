import type { GameCommand } from "../commands";
import type { GameEvent } from "../events";
import { getCardDefinition, type CardCost } from "../../content/cards/catalog";
import { getStackEffectDefinition, type CounterDestination, type StackResolutionRules } from "../../content/stackEffects";
import { createStackItemId, getOpponentPlayer, popTopStackItem, removeStackItemById } from "../../turn/stack";
import type { PlayerId } from "../../model/ids";
import { syncPlayerZoneCounts, type CardInstance, type GameState, type HexCoord } from "../../model/state";
import { getPlayerBase, getFirstOpenBaseAdjacentTile } from "../../model/queries";
import { getStackEffectMagnitude } from "../../systems/triggerEngine";
import { createContinuousEffectId, LAYER, nextEffectTimestamp, removeEffectsForEntity } from "../../systems/continuousEffects";
import type { InstructionContext } from "../instructions";
import { executeInstructions } from "../instructionHandlers";

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
    carries: null,
    sourceCardId: cardId,
    hasSummoningSickness: true,
    movesRemaining: 0,
    attacksRemaining: 0,
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

function destroyUnit(state: GameState, unitId: string, reasonText: string): void {
  const target = state.entities[unitId];
  if (!target || target.kind !== "unit") {
    return;
  }

  if (target.carries) {
    state.log.push({
      turn: state.turn,
      text: `${target.id} was destroyed and cargo lost (${target.carries}).`,
    });
  }
  if (state.selectedEntityId === target.id) {
    state.selectedEntityId = null;
  }
  removeEffectsForEntity(state, target.id);
  delete state.entities[target.id];
  state.log.push({
    turn: state.turn,
    text: reasonText,
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
type EffectResolver = (state: GameState, item: StackItem, resolution: StackResolutionRules) => CounterDestination;

function resolveNoopLog(state: GameState, item: StackItem): CounterDestination {
  state.log.push({
    turn: state.turn,
    text: `Resolved stack item ${item.label}: no-op.`,
  });
  return "discard";
}

function resolveDeployUnit(state: GameState, item: StackItem): CounterDestination {
  const sourceCardId = item.sourceCardId;
  const sourceCard = sourceCardId ? getCardDefinition(sourceCardId) : undefined;
  if (!sourceCard || sourceCard.kind !== "unit") {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${item.label}: missing unit card definition.`,
    });
    return "discard";
  }

  const spawnCoord = getFirstOpenBaseAdjacentTile(state, item.controllerId);
  if (!spawnCoord) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${item.label}: no open base-adjacent tile; card discarded.`,
    });
    return "discard";
  }

  const unitEntityId =
    item.pendingUnitEntityId && !state.entities[item.pendingUnitEntityId]
      ? item.pendingUnitEntityId
      : createSummonedUnitId(state, item.controllerId, sourceCard.id);
  deployUnitToBattlefield(state, item.controllerId, sourceCard.id, sourceCard.name, unitEntityId, spawnCoord);
  return "none";
}

function resolveDamageEnemyBase(state: GameState, item: StackItem, resolution: StackResolutionRules): CounterDestination {
  if (resolution.type !== "damage_enemy_base") {
    return "discard";
  }
  const enemyPlayerId = getOpponentPlayer(item.controllerId);
  const targetBase = getPlayerBase(state, enemyPlayerId);
  if (!targetBase) {
    return "discard";
  }

  const damage = resolution.amount;
  const beforeHp = targetBase.hp;
  targetBase.hp = Math.max(0, targetBase.hp - damage);
  state.log.push({
    turn: state.turn,
    text: `Resolved ${item.label}: dealt ${damage} to ${enemyPlayerId} base (${beforeHp} -> ${targetBase.hp}).`,
  });
  return "discard";
}

function resolveDamageEntity(state: GameState, item: StackItem, resolution: StackResolutionRules): CounterDestination {
  if (resolution.type !== "damage_entity") {
    return "discard";
  }
  const targetId = item.targetEntityId;
  if (!targetId) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${item.label}: no battlefield target configured.`,
    });
    return "discard";
  }

  const target = state.entities[targetId];
  if (!target) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${item.label}: target entity not found.`,
    });
    return "discard";
  }

  const damage = resolution.amount;
  const beforeHp = target.hp;
  target.hp = Math.max(0, target.hp - damage);
  state.log.push({
    turn: state.turn,
    text: `Resolved ${item.label}: dealt ${damage} to ${targetId} (${beforeHp} -> ${target.hp}).`,
  });

  if (target.kind === "unit" && target.hp === 0) {
    destroyUnit(state, target.id, `${target.id} was destroyed.`);
  }

  return "discard";
}

function resolveDestroyEntity(state: GameState, item: StackItem, resolution: StackResolutionRules): CounterDestination {
  if (resolution.type !== "destroy_entity") {
    return "discard";
  }
  const targetId = item.targetEntityId;
  if (!targetId) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${item.label}: no battlefield target configured.`,
    });
    return "discard";
  }

  const target = state.entities[targetId];
  if (!target || target.kind !== "unit") {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${item.label}: target unit not found.`,
    });
    return "discard";
  }

  if (resolution.requireDamaged && target.hp >= target.maxHp) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${item.label}: target ${targetId} was no longer damaged.`,
    });
    return "discard";
  }

  destroyUnit(state, target.id, `${item.label} destroyed ${target.id}.`);
  return "discard";
}

function resolveModifyUnitUntilEndOfTurn(state: GameState, item: StackItem, resolution: StackResolutionRules): CounterDestination {
  if (resolution.type !== "modify_unit_until_end_of_turn") {
    return "discard";
  }
  const targetId = item.targetEntityId;
  if (!targetId) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${item.label}: no battlefield target configured.`,
    });
    return "discard";
  }

  const target = state.entities[targetId];
  if (!target || target.kind !== "unit") {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${item.label}: target unit not found.`,
    });
    return "discard";
  }

  const expiry = { type: "end_of_turn" as const, turn: state.turn };

  if (resolution.attackBonus !== 0) {
    const ts = nextEffectTimestamp(state);
    state.continuousEffects.push({
      id: createContinuousEffectId(state, `${item.id}_atk`),
      sourceEntityId: null,
      sourceCardId: item.sourceCardId,
      controllerId: item.controllerId,
      payload: { type: "stat_modifier", stat: "attackDamage", amount: resolution.attackBonus },
      target: { type: "specific_entity", entityId: targetId },
      expiry,
      layer: LAYER.TEMPORARY,
      timestamp: ts,
    });
  }

  if (resolution.armorBonus !== 0) {
    const ts = nextEffectTimestamp(state);
    state.continuousEffects.push({
      id: createContinuousEffectId(state, `${item.id}_arm`),
      sourceEntityId: null,
      sourceCardId: item.sourceCardId,
      controllerId: item.controllerId,
      payload: { type: "stat_modifier", stat: "armor", amount: resolution.armorBonus },
      target: { type: "specific_entity", entityId: targetId },
      expiry,
      layer: LAYER.TEMPORARY,
      timestamp: ts,
    });
  }

  state.log.push({
    turn: state.turn,
    text: `Resolved ${item.label}: ${targetId} gains +${resolution.attackBonus} ATK and +${resolution.armorBonus} ARM until end of turn.`,
  });
  return "discard";
}

function resolveCounter(state: GameState, item: StackItem, resolution: StackResolutionRules): CounterDestination {
  if (resolution.type !== "counter") {
    return "discard";
  }
  const targetId = item.targetStackItemId;
  if (!targetId) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${item.label}: no stack target configured.`,
    });
    return "discard";
  }

  const countered = removeStackItemById(state.stack, targetId);
  if (!countered) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${item.label}: target stack item not found.`,
    });
    return "discard";
  }

  const destination =
    resolution.destination === "none"
      ? countered.defaultCounterDestination
      : resolution.destination;

  moveStackSourceCardToZone(state, countered, destination);
  state.log.push({
    turn: state.turn,
    text: `Resolved ${item.label}: countered ${countered.label} -> ${destination}.`,
  });
  return "discard";
}

const EFFECT_RESOLVERS: Record<string, EffectResolver> = {
  noop_log: resolveNoopLog,
  deploy_unit: resolveDeployUnit,
  damage_enemy_base: resolveDamageEnemyBase,
  damage_entity: resolveDamageEntity,
  destroy_entity: resolveDestroyEntity,
  modify_unit_until_end_of_turn: resolveModifyUnitUntilEndOfTurn,
  counter: resolveCounter,
};

function applyResolvedStackEffect(state: GameState, resolvedItem: StackItem): CounterDestination {
  const sourceCard = resolvedItem.sourceCardId ? getCardDefinition(resolvedItem.sourceCardId) : undefined;

  if (sourceCard?.onResolve) {
    const context: InstructionContext = {
      state,
      item: resolvedItem,
      controllerId: resolvedItem.controllerId,
      targetEntityId: resolvedItem.targetEntityId,
      targetStackItemId: resolvedItem.targetStackItemId,
    };
    const instructions = sourceCard.onResolve(context);
    executeInstructions(state, instructions);
    return sourceCard.kind === "tactic" ? "discard" : "none";
  }

  const definition = getStackEffectDefinition(resolvedItem.effectId);
  if (!definition) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${resolvedItem.label}: unknown effect id ${resolvedItem.effectId}.`,
    });
    return "discard";
  }

  const resolver = EFFECT_RESOLVERS[definition.resolution.type];
  return resolver ? resolver(state, resolvedItem, definition.resolution) : "discard";
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

  const effectId = card.kind === "tactic" ? card.stackEffectId : "deploy_unit_card";
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
      objectKind: effectDefinition.object.kind,
      counterable: effectDefinition.object.counterable,
      defaultCounterDestination: effectDefinition.object.defaultCounterDestination,
      nextPriorityPlayerId: getOpponentPlayer(command.playerId),
      pendingUnitEntityId: card.kind === "unit" ? createSummonedUnitId(state, command.playerId, card.id) : null,
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
