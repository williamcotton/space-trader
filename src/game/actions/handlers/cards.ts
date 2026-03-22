import type { GameCommand } from "../commands";
import type { GameEvent } from "../events";
import { getCardDefinition, type AutoTargetStrategy, type CardCost, type UnitCardDefinition } from "../../content/cards/catalog";
import { getStackEffectDefinition, type CounterDestination } from "../../content/stackEffects";
import { createStackItemId, getOpponentPlayer, popTopStackItem, removeStackItemById } from "../../turn/stack";
import type { PlayerId } from "../../model/ids";
import { MAX_HAND_SIZE, syncPlayerZoneCounts, type CardInstance, type GameState, type HexCoord } from "../../model/state";
import { getPlayerBase, getFirstOpenBaseAdjacentTile } from "../../model/queries";

function getStackEffectMagnitude(effectId: string): number {
  const definition = getStackEffectDefinition(effectId);
  if (!definition) {
    return 0;
  }
  if (definition.resolution.type === "damage_enemy_base" || definition.resolution.type === "damage_entity") {
    return definition.resolution.amount;
  }
  return 0;
}

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
  if (state.zones[playerId].hand.length >= MAX_HAND_SIZE) {
    state.log.push({
      turn: state.turn,
      text: `${playerId} skipped satellite download (${drawReason}) at hand limit ${MAX_HAND_SIZE}.`,
    });
    syncPlayerZoneCounts(state);
    return;
  }

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
  delete state.entities[target.id];
  state.log.push({
    turn: state.turn,
    text: reasonText,
  });
}

function resolveAutoTarget(
  state: GameState,
  controllerId: PlayerId,
  strategy: AutoTargetStrategy,
  preferredTargetId: string | null
): string | null {
  switch (strategy) {
    case "weakest_enemy_unit": {
      const preferredTarget = preferredTargetId ? state.entities[preferredTargetId] : null;
      if (preferredTarget && preferredTarget.kind === "unit" && preferredTarget.ownerId !== controllerId) {
        return preferredTarget.id;
      }

      const enemyUnits = Object.values(state.entities)
        .filter((entity): entity is Extract<GameState["entities"][string], { kind: "unit" }> => entity.kind === "unit" && entity.ownerId !== controllerId)
        .sort((a, b) => {
          const damagedDelta = Number(a.hp < a.maxHp) - Number(b.hp < b.maxHp);
          if (damagedDelta !== 0) {
            return damagedDelta > 0 ? -1 : 1;
          }
          if (a.hp !== b.hp) {
            return a.hp - b.hp;
          }
          return a.id.localeCompare(b.id);
        });

      return enemyUnits[0]?.id ?? null;
    }
  }
}

function createTriggeredAbilityEvents(
  state: GameState,
  playerId: PlayerId,
  triggerEvent: "on_owner_tactic_played",
  preferredTargetId: string | null,
  idOffset: number
): GameEvent[] {
  const triggeredUnits = Object.values(state.entities)
    .filter((entity): entity is Extract<GameState["entities"][string], { kind: "unit" }> => {
      if (entity.kind !== "unit" || entity.ownerId !== playerId || !entity.sourceCardId) {
        return false;
      }
      const card = getCardDefinition(entity.sourceCardId);
      return card?.kind === "unit" && card.trigger?.event === triggerEvent;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const events: GameEvent[] = [];
  for (const [index, unit] of triggeredUnits.entries()) {
    const card = getCardDefinition(unit.sourceCardId!) as UnitCardDefinition;
    const trigger = card.trigger!;
    const effectDefinition = getStackEffectDefinition(trigger.effectId);
    if (!effectDefinition) {
      continue;
    }

    const targetEntityId = resolveAutoTarget(state, playerId, trigger.autoTarget, preferredTargetId);
    if (!targetEntityId) {
      continue;
    }

    events.push({
      type: "STACK_ITEM_PUSHED",
      playerId,
      itemId: createStackItemId(state.turn, state.log.length + idOffset + index),
      label: `${unit.name} ${trigger.labelSuffix}`,
      controllerId: playerId,
      ownerId: playerId,
      effectId: trigger.effectId,
      effectMagnitude: getStackEffectMagnitude(trigger.effectId),
      targetStackItemId: null,
      targetEntityId,
      objectKind: effectDefinition.object.kind,
      counterable: effectDefinition.object.counterable,
      defaultCounterDestination: effectDefinition.object.defaultCounterDestination,
      sourceCardInstanceId: null,
      sourceCardId: null,
      sourceCardOwnerId: null,
      nextPriorityPlayerId: getOpponentPlayer(playerId),
      pendingUnitEntityId: null,
    });
  }

  return events;
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

function applyResolvedStackEffect(state: GameState, resolvedItem: GameState["stack"][number]): CounterDestination {
  const definition = getStackEffectDefinition(resolvedItem.effectId);
  if (!definition) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${resolvedItem.label}: unknown effect id ${resolvedItem.effectId}.`,
    });
    return "discard";
  }

  switch (definition.resolution.type) {
    case "noop_log":
      state.log.push({
        turn: state.turn,
        text: `Resolved stack item ${resolvedItem.label}: no-op.`,
      });
      return "discard";
    case "deploy_unit": {
      const sourceCardId = resolvedItem.sourceCardId;
      const sourceCard = sourceCardId ? getCardDefinition(sourceCardId) : undefined;
      if (!sourceCard || sourceCard.kind !== "unit") {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: missing unit card definition.`,
        });
        return "discard";
      }

      const spawnCoord = getFirstOpenBaseAdjacentTile(state, resolvedItem.controllerId);
      if (!spawnCoord) {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: no open base-adjacent tile; card discarded.`,
        });
        return "discard";
      }

      const unitEntityId =
        resolvedItem.pendingUnitEntityId && !state.entities[resolvedItem.pendingUnitEntityId]
          ? resolvedItem.pendingUnitEntityId
          : createSummonedUnitId(state, resolvedItem.controllerId, sourceCard.id);
      deployUnitToBattlefield(state, resolvedItem.controllerId, sourceCard.id, sourceCard.name, unitEntityId, spawnCoord);
      return "none";
    }
    case "damage_enemy_base": {
      const enemyPlayerId = getOpponentPlayer(resolvedItem.controllerId);
      const targetBase = getPlayerBase(state, enemyPlayerId);
      if (!targetBase) {
        return "discard";
      }

      const damage = definition.resolution.amount;
      const beforeHp = targetBase.hp;
      targetBase.hp = Math.max(0, targetBase.hp - damage);
      state.log.push({
        turn: state.turn,
        text: `Resolved ${resolvedItem.label}: dealt ${damage} to ${enemyPlayerId} base (${beforeHp} -> ${targetBase.hp}).`,
      });
      return "discard";
    }
    case "damage_entity": {
      const targetId = resolvedItem.targetEntityId;
      if (!targetId) {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: no battlefield target configured.`,
        });
        return "discard";
      }

      const target = state.entities[targetId];
      if (!target) {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: target entity not found.`,
        });
        return "discard";
      }

      const damage = definition.resolution.amount;
      const beforeHp = target.hp;
      target.hp = Math.max(0, target.hp - damage);
      state.log.push({
        turn: state.turn,
        text: `Resolved ${resolvedItem.label}: dealt ${damage} to ${targetId} (${beforeHp} -> ${target.hp}).`,
      });

      if (target.kind === "unit" && target.hp === 0) {
        destroyUnit(state, target.id, `${target.id} was destroyed.`);
      }

      return "discard";
    }
    case "destroy_entity": {
      const targetId = resolvedItem.targetEntityId;
      if (!targetId) {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: no battlefield target configured.`,
        });
        return "discard";
      }

      const target = state.entities[targetId];
      if (!target || target.kind !== "unit") {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: target unit not found.`,
        });
        return "discard";
      }

      if (definition.resolution.requireDamaged && target.hp >= target.maxHp) {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: target ${targetId} was no longer damaged.`,
        });
        return "discard";
      }

      destroyUnit(state, target.id, `${resolvedItem.label} destroyed ${target.id}.`);
      return "discard";
    }
    case "modify_unit_until_end_of_turn": {
      const targetId = resolvedItem.targetEntityId;
      if (!targetId) {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: no battlefield target configured.`,
        });
        return "discard";
      }

      const target = state.entities[targetId];
      if (!target || target.kind !== "unit") {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: target unit not found.`,
        });
        return "discard";
      }

      target.temporaryAttackBonus += definition.resolution.attackBonus;
      target.temporaryArmorBonus += definition.resolution.armorBonus;
      state.log.push({
        turn: state.turn,
        text: `Resolved ${resolvedItem.label}: ${targetId} gains +${definition.resolution.attackBonus} ATK and +${definition.resolution.armorBonus} ARM until end of turn.`,
      });
      return "discard";
    }
    case "counter": {
      const targetId = resolvedItem.targetStackItemId;
      if (!targetId) {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: no stack target configured.`,
        });
        return "discard";
      }

      const countered = removeStackItemById(state.stack, targetId);
      if (!countered) {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: target stack item not found.`,
        });
        return "discard";
      }

      const destination =
        definition.resolution.destination === "none"
          ? countered.defaultCounterDestination
          : definition.resolution.destination;

      moveStackSourceCardToZone(state, countered, destination);
      state.log.push({
        turn: state.turn,
        text: `Resolved ${resolvedItem.label}: countered ${countered.label} -> ${destination}.`,
      });
      return "discard";
    }
    default:
      return "discard";
  }
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

  if (card.kind === "tactic") {
    events.push(...createTriggeredAbilityEvents(state, command.playerId, "on_owner_tactic_played", command.targetEntityId ?? null, events.length));
  }

  return events;
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
