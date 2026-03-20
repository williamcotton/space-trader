import type { GameCommand } from "./commands";
import type { GameEvent, UnitAttackDeclaredEvent, UnitMovedEvent } from "./events";
import { getCardDefinition, type CardCost } from "../content/cards/catalog";
import { getStackEffectDefinition } from "../content/stackEffects";
import { advancePhase } from "../turn/phaseMachine";
import { createStackItemId, getOpponentPlayer, peekTopStackItem, popTopStackItem, removeStackItemById } from "../turn/stack";
import { validateCommand } from "../rules/validators";
import type { PlayerId } from "../model/ids";
import { MAX_HAND_SIZE, syncPlayerZoneCounts, type CardInstance, type GameState, type HexCoord } from "../model/state";
import { hexDistance, isWithinMapBounds } from "../model/hex";
import { resolveCombatAttack } from "../systems/combat";
import { getResourceNodeById, resolveEconomyDeposits } from "../systems/harvesting";
import { resolveEndPhaseNodeControl } from "../systems/nodeControl";
import { resolveBaseHpVictory } from "../systems/victory";

export type DispatchResult =
  | {
      ok: true;
      events: GameEvent[];
    }
  | {
      ok: false;
      reason: string;
      events: [];
    };

function getStackEffectMagnitude(effectId: string): number {
  const definition = getStackEffectDefinition(effectId);
  if (!definition) {
    return 0;
  }
  if (definition.resolution.type === "damage_enemy_base") {
    return definition.resolution.amount;
  }
  return 0;
}

function getPlayerBase(state: GameState, playerId: PlayerId) {
  const baseId = state.players[playerId].baseEntityId;
  const base = state.entities[baseId];
  if (!base || base.kind !== "base") {
    return null;
  }
  return base;
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

function drawCardForPlayer(state: GameState, playerId: PlayerId, drawReason: "opening_hand" | "start_phase_draw"): void {
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

function hasEntityAtCoord(state: GameState, coord: HexCoord): boolean {
  return Object.values(state.entities).some((entity) => entity.coord.q === coord.q && entity.coord.r === coord.r);
}

function getFirstOpenBaseAdjacentTile(state: GameState, playerId: PlayerId): HexCoord | null {
  const base = getPlayerBase(state, playerId);
  if (!base) {
    return null;
  }

  const candidates: HexCoord[] = [
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
    if (!hasEntityAtCoord(state, coord)) {
      return coord;
    }
  }

  return null;
}

function createSummonedUnitId(state: GameState, playerId: PlayerId, cardId: string): string {
  const suffix = Object.keys(state.entities).length + state.log.length + state.turn;
  return `unit_${playerId}_${cardId}_${suffix}`;
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

function applyResolvedStackEffect(state: GameState, resolvedItem: GameState["stack"][number]): void {
  const definition = getStackEffectDefinition(resolvedItem.effectId);
  if (!definition) {
    state.log.push({
      turn: state.turn,
      text: `Resolved ${resolvedItem.label}: unknown effect id ${resolvedItem.effectId}.`,
    });
    return;
  }

  switch (definition.resolution.type) {
    case "noop_log":
      state.log.push({
        turn: state.turn,
        text: `Resolved stack item ${resolvedItem.label}: no-op.`,
      });
      return;
    case "damage_enemy_base": {
      const enemyPlayerId = getOpponentPlayer(resolvedItem.controllerId);
      const targetBase = getPlayerBase(state, enemyPlayerId);
      if (!targetBase) {
        return;
      }

      const damage = definition.resolution.amount;
      const beforeHp = targetBase.hp;
      targetBase.hp = Math.max(0, targetBase.hp - damage);
      state.log.push({
        turn: state.turn,
        text: `Resolved ${resolvedItem.label}: dealt ${damage} to ${enemyPlayerId} base (${beforeHp} -> ${targetBase.hp}).`,
      });
      return;
    }
    case "counter": {
      const targetId = resolvedItem.targetStackItemId;
      if (!targetId) {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: no stack target configured.`,
        });
        return;
      }

      const countered = removeStackItemById(state.stack, targetId);
      if (!countered) {
        state.log.push({
          turn: state.turn,
          text: `Resolved ${resolvedItem.label}: target stack item not found.`,
        });
        return;
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
      return;
    }
    default:
      return;
  }
}

function createEventsFromCommand(state: GameState, command: GameCommand): GameEvent[] {
  switch (command.type) {
    case "ADVANCE_PHASE":
    case "END_PHASE":
      return [
        {
          type: "PHASE_ADVANCED",
          activePlayerId: state.activePlayerId,
          turn: state.turn,
          phase: state.phase,
        },
      ];
    case "PASS_PRIORITY": {
      const nextPasses = state.consecutivePriorityPasses + 1;
      if (nextPasses < 2) {
        return [
          {
            type: "PRIORITY_PASSED",
            playerId: command.playerId,
            nextPriorityPlayerId: getOpponentPlayer(command.playerId),
            consecutivePasses: nextPasses,
          },
        ];
      }

      const events: GameEvent[] = [
        {
          type: "PRIORITY_PASSED",
          playerId: command.playerId,
          nextPriorityPlayerId: state.activePlayerId,
          consecutivePasses: 0,
        },
      ];

      const topItem = peekTopStackItem(state.stack);
      if (topItem) {
        events.push({
          type: "STACK_ITEM_RESOLVED",
          itemId: topItem.id,
          label: topItem.label,
          controllerId: topItem.controllerId,
          ownerId: topItem.ownerId,
          effectId: topItem.effectId,
          effectMagnitude: topItem.effectMagnitude,
          targetStackItemId: topItem.targetStackItemId,
          objectKind: topItem.objectKind,
          counterable: topItem.counterable,
          defaultCounterDestination: topItem.defaultCounterDestination,
          sourceCardInstanceId: topItem.sourceCardInstanceId,
          sourceCardId: topItem.sourceCardId,
          sourceCardOwnerId: topItem.sourceCardOwnerId,
        });
      }

      return events;
    }
    case "RESPOND_STACK": {
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
          objectKind: definition.object.kind,
          counterable: definition.object.counterable,
          defaultCounterDestination: definition.object.defaultCounterDestination,
          sourceCardInstanceId: null,
          sourceCardId: null,
          sourceCardOwnerId: null,
          nextPriorityPlayerId: getOpponentPlayer(command.playerId),
        },
      ];
    }
    case "SELECT_ENTITY":
      return [
        {
          type: "ENTITY_SELECTED",
          playerId: command.playerId,
          entityId: command.entityId,
        },
      ];
    case "CLEAR_SELECTION":
      return [
        {
          type: "SELECTION_CLEARED",
          playerId: command.playerId,
          previousEntityId: state.selectedEntityId,
          reason: command.reason,
        },
      ];
    case "MOVE_UNIT": {
      const entity = state.entities[command.entityId];
      if (!entity || entity.kind !== "unit") {
        return [];
      }

      const distance = hexDistance(entity.coord, command.to);
      const remaining = Math.max(0, entity.movesRemaining - distance);
      const event: UnitMovedEvent = {
        type: "UNIT_MOVED",
        playerId: command.playerId,
        entityId: command.entityId,
        from: { ...entity.coord },
        to: { ...command.to },
        movesRemaining: remaining,
      };
      return [event];
    }
    case "ATTACK_UNIT": {
      const attacker = state.entities[command.attackerId];
      const target = state.entities[command.targetId];
      if (!attacker || attacker.kind !== "unit" || !target) {
        return [];
      }

      const resolution = resolveCombatAttack(state, attacker, target);

      const event: UnitAttackDeclaredEvent = {
        type: "UNIT_ATTACK_DECLARED",
        playerId: command.playerId,
        attackerId: command.attackerId,
        targetId: command.targetId,
        attacksRemaining: Math.max(0, attacker.attacksRemaining - 1),
        damageDealt: resolution.finalDamage,
        targetHpRemaining: resolution.targetHpAfter,
        targetDestroyed: resolution.targetDestroyed,
      };
      return [event];
    }
    case "HARVEST_NODE": {
      const entity = state.entities[command.entityId];
      if (!entity || entity.kind !== "unit") {
        return [];
      }
      const node = getResourceNodeById(state, command.nodeId);
      if (!node) {
        return [];
      }

      return [
        {
          type: "UNIT_HARVESTED_NODE",
          playerId: command.playerId,
          entityId: command.entityId,
          nodeId: node.id,
          resourceType: node.resourceType,
        },
      ];
    }
    case "PLAY_CARD": {
      const handCard = state.zones[command.playerId].hand.find((card) => card.instanceId === command.cardInstanceId);
      if (!handCard) {
        return [];
      }

      const card = getCardDefinition(handCard.cardId);
      if (!card) {
        return [];
      }

      if (card.kind === "tactic") {
        const effectDefinition = getStackEffectDefinition(card.stackEffectId);
        if (!effectDefinition) {
          return [];
        }

        return [
          {
            type: "CARD_PLAYED_TO_STACK",
            playerId: command.playerId,
            cardInstanceId: handCard.instanceId,
            cardId: handCard.cardId,
            cardName: card.name,
            cost: card.cost,
            stackItemId: createStackItemId(state.turn, state.log.length),
            effectId: card.stackEffectId,
            effectMagnitude: getStackEffectMagnitude(card.stackEffectId),
            targetStackItemId: command.targetStackItemId ?? null,
            objectKind: effectDefinition.object.kind,
            counterable: effectDefinition.object.counterable,
            defaultCounterDestination: effectDefinition.object.defaultCounterDestination,
            nextPriorityPlayerId: getOpponentPlayer(command.playerId),
          },
        ];
      }

      const spawnCoord = getFirstOpenBaseAdjacentTile(state, command.playerId);
      if (!spawnCoord) {
        return [];
      }

      return [
        {
          type: "CARD_PLAYED_TO_BATTLEFIELD",
          playerId: command.playerId,
          cardInstanceId: handCard.instanceId,
          cardId: handCard.cardId,
          cardName: card.name,
          cost: card.cost,
          unitEntityId: createSummonedUnitId(state, command.playerId, card.id),
          spawnCoord,
          unit: card.unit,
        },
      ];
    }
    default:
      return [];
  }
}

function reduceEvent(state: GameState, event: GameEvent): void {
  switch (event.type) {
    case "PHASE_ADVANCED": {
      const previousPhase = state.phase;
      const previousActivePlayer = state.activePlayerId;
      if (previousPhase === "start") {
        resolveEconomyDeposits(state, previousActivePlayer);
      }
      if (previousPhase === "end") {
        resolveEndPhaseNodeControl(state, previousActivePlayer);
      }
      advancePhase(state);
      if (state.phase === "start") {
        drawCardForPlayer(state, state.activePlayerId, "start_phase_draw");
      }
      return;
    }
    case "ENTITY_SELECTED":
      state.selectedEntityId = event.entityId;
      state.log.push({
        turn: state.turn,
        text: `${event.playerId} selected ${event.entityId}.`,
      });
      return;
    case "SELECTION_CLEARED":
      state.selectedEntityId = null;
      state.log.push({
        turn: state.turn,
        text: `${event.playerId} cleared selection (${event.reason}) from ${event.previousEntityId ?? "none"}.`,
      });
      return;
    case "PRIORITY_PASSED":
      state.consecutivePriorityPasses = event.consecutivePasses;
      state.priorityPlayerId = event.nextPriorityPlayerId;
      state.log.push({
        turn: state.turn,
        text: `${event.playerId} passed priority.`,
      });
      return;
    case "STACK_ITEM_PUSHED":
      state.stack.push({
        id: event.itemId,
        label: event.label,
        controllerId: event.controllerId,
        ownerId: event.ownerId,
        effectId: event.effectId,
        effectMagnitude: event.effectMagnitude,
        targetStackItemId: event.targetStackItemId,
        objectKind: event.objectKind,
        counterable: event.counterable,
        defaultCounterDestination: event.defaultCounterDestination,
        sourceCardInstanceId: event.sourceCardInstanceId,
        sourceCardId: event.sourceCardId,
        sourceCardOwnerId: event.sourceCardOwnerId,
      });
      state.priorityPlayerId = event.nextPriorityPlayerId;
      state.consecutivePriorityPasses = 0;
      state.log.push({
        turn: state.turn,
        text: `${event.playerId} added stack item: ${event.label} [${event.effectId}].`,
      });
      return;
    case "STACK_ITEM_RESOLVED": {
      const resolvedItem = popTopStackItem(state.stack);
      if (!resolvedItem) {
        return;
      }

      state.priorityPlayerId = state.activePlayerId;
      state.consecutivePriorityPasses = 0;
      applyResolvedStackEffect(state, resolvedItem);
      moveStackSourceCardToZone(state, resolvedItem, "discard");
      return;
    }
    case "CARD_PLAYED_TO_STACK": {
      const card = removeCardFromHand(state, event.playerId, event.cardInstanceId);
      const cardDefinition = getCardDefinition(event.cardId);
      if (!card || !cardDefinition || cardDefinition.kind !== "tactic") {
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
        objectKind: event.objectKind,
        counterable: event.counterable,
        defaultCounterDestination: event.defaultCounterDestination,
        sourceCardInstanceId: card.instanceId,
        sourceCardId: card.cardId,
        sourceCardOwnerId: card.ownerId,
      });
      state.priorityPlayerId = event.nextPriorityPlayerId;
      state.consecutivePriorityPasses = 0;
      state.log.push({
        turn: state.turn,
        text: `${event.playerId} played ${event.cardName} from hand to stack.`,
      });
      return;
    }
    case "CARD_PLAYED_TO_BATTLEFIELD": {
      const card = removeCardFromHand(state, event.playerId, event.cardInstanceId);
      const cardDefinition = getCardDefinition(event.cardId);
      if (!card || !cardDefinition || cardDefinition.kind !== "unit") {
        return;
      }

      applyCardCost(state, event.playerId, event.cost);
      syncPlayerZoneCounts(state);
      state.entities[event.unitEntityId] = {
        id: event.unitEntityId,
        kind: "unit",
        name: event.cardName,
        ownerId: event.playerId,
        role: event.unit.role,
        hp: event.unit.hp,
        maxHp: event.unit.hp,
        attackDamage: event.unit.attackDamage,
        armor: event.unit.armor,
        moveRange: event.unit.moveRange,
        attackRange: event.unit.attackRange,
        attackActionsPerTurn: event.unit.attackActionsPerTurn,
        coord: { ...event.spawnCoord },
        carries: null,
        sourceCardId: event.cardId,
        hasSummoningSickness: true,
        movesRemaining: 0,
        attacksRemaining: 0,
      };
      state.log.push({
        turn: state.turn,
        text: `${event.playerId} deployed ${event.cardName} to (${event.spawnCoord.q}, ${event.spawnCoord.r}).`,
      });
      return;
    }
    case "UNIT_MOVED": {
      const entity = state.entities[event.entityId];
      if (!entity || entity.kind !== "unit") {
        return;
      }

      entity.coord = { ...event.to };
      entity.movesRemaining = event.movesRemaining;
      state.log.push({
        turn: state.turn,
        text: `${event.playerId} moved ${event.entityId} to (${event.to.q}, ${event.to.r}).`,
      });
      return;
    }
    case "UNIT_ATTACK_DECLARED": {
      const attacker = state.entities[event.attackerId];
      const target = state.entities[event.targetId];
      if (!attacker || attacker.kind !== "unit") {
        return;
      }

      attacker.attacksRemaining = event.attacksRemaining;
      if (target) {
        target.hp = event.targetHpRemaining;
      }

      if (event.targetDestroyed && target?.kind === "unit") {
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
      }

      state.log.push({
        turn: state.turn,
        text: `${event.playerId} attacked ${event.targetId} with ${event.attackerId} for ${event.damageDealt} damage.`,
      });
      if (event.targetDestroyed) {
        state.log.push({
          turn: state.turn,
          text: `${event.targetId} was destroyed.`,
        });
      }
      return;
    }
    case "UNIT_HARVESTED_NODE": {
      const entity = state.entities[event.entityId];
      if (!entity || entity.kind !== "unit") {
        return;
      }

      entity.carries = event.resourceType;
      state.log.push({
        turn: state.turn,
        text: `${event.playerId} harvested ${event.resourceType} at ${event.nodeId} with ${event.entityId}.`,
      });
      return;
    }
    default:
      return;
  }
}

export function dispatchCommand(state: GameState, command: GameCommand): DispatchResult {
  const validation = validateCommand(state, command);
  if (!validation.ok) {
    const reason = validation.reason ?? "Command rejected.";
    state.lastRejectedReason = reason;
    state.log.push({
      turn: state.turn,
      text: `Rejected ${command.type}: ${reason}`,
    });
    return {
      ok: false,
      reason,
      events: [],
    };
  }

  const events = createEventsFromCommand(state, command);
  for (const event of events) {
    reduceEvent(state, event);
  }
  resolveBaseHpVictory(state);
  syncPlayerZoneCounts(state);
  state.lastRejectedReason = null;

  return {
    ok: true,
    events,
  };
}
