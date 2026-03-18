import type { GameCommand } from "./commands";
import type { GameEvent, UnitAttackDeclaredEvent, UnitMovedEvent } from "./events";
import { advancePhase } from "../turn/phaseMachine";
import { validateCommand } from "../rules/validators";
import type { GameState } from "../model/state";
import { hexDistance } from "../model/hex";

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
    case "SELECT_ENTITY":
      return [
        {
          type: "ENTITY_SELECTED",
          playerId: command.playerId,
          entityId: command.entityId,
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
    default:
      return [];
  }
}

function reduceEvent(state: GameState, event: GameEvent): void {
  switch (event.type) {
    case "PHASE_ADVANCED":
      advancePhase(state);
      return;
    case "ENTITY_SELECTED":
      state.selectedEntityId = event.entityId;
      state.log.push({
        turn: state.turn,
        text: `${event.playerId} selected ${event.entityId}.`,
      });
      return;
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
