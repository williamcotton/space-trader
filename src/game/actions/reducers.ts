import type { GameCommand } from "./commands";
import type { GameEvent, UnitAttackDeclaredEvent, UnitMovedEvent } from "./events";
import { getStackEffectDefinition } from "../content/stackEffects";
import { advancePhase } from "../turn/phaseMachine";
import { createStackItemId, getOpponentPlayer, peekTopStackItem, popTopStackItem, removeStackItemById } from "../turn/stack";
import { validateCommand } from "../rules/validators";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import { hexDistance } from "../model/hex";
import { getResourceNodeById, resolveEconomyDeposits } from "../systems/harvesting";
import { resolveEndPhaseNodeControl } from "../systems/nodeControl";

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

function getAttackDamage(attackerDamage: number, defenderArmor: number): number {
  return Math.max(1, attackerDamage - defenderArmor);
}

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

      if (targetBase.hp === 0) {
        state.winner = resolvedItem.controllerId;
        state.log.push({
          turn: state.turn,
          text: `${resolvedItem.controllerId} wins by stack damage to enemy base.`,
        });
      }
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

      const targetArmor = target.kind === "unit" ? target.armor : 0;
      const damageDealt = getAttackDamage(attacker.attackDamage, targetArmor);
      const targetHpRemaining = Math.max(0, target.hp - damageDealt);
      const targetDestroyed = targetHpRemaining === 0;
      const winnerPlayerId = target.kind === "base" && targetDestroyed ? command.playerId : null;

      const event: UnitAttackDeclaredEvent = {
        type: "UNIT_ATTACK_DECLARED",
        playerId: command.playerId,
        attackerId: command.attackerId,
        targetId: command.targetId,
        attacksRemaining: Math.max(0, attacker.attacksRemaining - 1),
        damageDealt,
        targetHpRemaining,
        targetDestroyed,
        winnerPlayerId,
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

      if (event.winnerPlayerId) {
        state.winner = event.winnerPlayerId;
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
      if (event.winnerPlayerId) {
        state.log.push({
          turn: state.turn,
          text: `${event.winnerPlayerId} wins by destroying the enemy base.`,
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
  state.lastRejectedReason = null;

  return {
    ok: true,
    events,
  };
}
