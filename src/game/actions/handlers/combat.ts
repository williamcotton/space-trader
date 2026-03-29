import type { GameCommand } from "../commands";
import type { GameEvent, UnitAttackDeclaredEvent, UnitMovedEvent } from "../events";
import type { GameState } from "../../model/state";
import { hexDistance } from "../../model/hex";
import { resolveCombatAttack } from "../../systems/combat";
import { getResourceNodeAtCoord, getResourceNodeById } from "../../systems/harvesting";
import { SALVAGE_KEYWORD, unitHasActiveKeyword } from "../../systems/keywords";
import { registerCombatHook, runUnitDestroyedByAttackHooks } from "../../registries/combatHooks";
import { incrementSalvageTriggersThisTurn } from "../../mechanics";

export function addUniqueTrackedUnit(target: string[], entityId: string): void {
  if (!target.includes(entityId)) {
    target.push(entityId);
  }
}

export function trackTacticalHarvestOpportunity(state: GameState, entityId: string): void {
  if (state.phase !== "tactical") {
    return;
  }

  const entity = state.entities[entityId];
  if (!entity || entity.kind !== "unit" || entity.role !== "resource" || entity.carries !== null) {
    return;
  }

  const node = getResourceNodeAtCoord(state, entity.coord);
  if (!node || node.controlledBy !== entity.ownerId) {
    return;
  }

  addUniqueTrackedUnit(state.tacticalHarvestEligibleUnitIds, entityId);
}

export function handleMoveUnit(
  state: GameState,
  command: Extract<GameCommand, { type: "MOVE_UNIT" }>
): GameEvent[] {
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

export function handleAttackUnit(
  state: GameState,
  command: Extract<GameCommand, { type: "ATTACK_UNIT" }>
): GameEvent[] {
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

export function handleHarvestNode(
  state: GameState,
  command: Extract<GameCommand, { type: "HARVEST_NODE" }>
): GameEvent[] {
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

export function reduceUnitMoved(
  state: GameState,
  event: Extract<GameEvent, { type: "UNIT_MOVED" }>
): void {
  const entity = state.entities[event.entityId];
  if (!entity || entity.kind !== "unit") {
    return;
  }

  entity.coord = { ...event.to };
  entity.movesRemaining = event.movesRemaining;
  trackTacticalHarvestOpportunity(state, event.entityId);
  state.log.push({
    turn: state.turn,
    text: `${event.playerId} moved ${event.entityId} to (${event.to.q}, ${event.to.r}).`,
  });
}

export function reduceUnitAttackDeclared(
  state: GameState,
  event: Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }>
): void {
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
    runUnitDestroyedByAttackHooks({ state, event, attacker, target });

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
}

registerCombatHook("salvage_reward", {
  onUnitDestroyedByAttack: ({ state, attacker, target }) => {
    if (target.ownerId === attacker.ownerId || !unitHasActiveKeyword(state, attacker, SALVAGE_KEYWORD)) {
      return;
    }

    state.players[attacker.ownerId].resources.alloy += 1;
    incrementSalvageTriggersThisTurn(state, attacker.ownerId);
    state.log.push({
      turn: state.turn,
      text: `${attacker.id} salvaged wreckage and generated 1 alloy.`,
    });
  },
});

export function reduceUnitHarvestedNode(
  state: GameState,
  event: Extract<GameEvent, { type: "UNIT_HARVESTED_NODE" }>
): void {
  const entity = state.entities[event.entityId];
  if (!entity || entity.kind !== "unit") {
    return;
  }

  entity.carries = event.resourceType;
  addUniqueTrackedUnit(state.tacticalHarvestEligibleUnitIds, event.entityId);
  addUniqueTrackedUnit(state.tacticalHarvestedUnitIds, event.entityId);
  state.log.push({
    turn: state.turn,
    text: `${event.playerId} harvested ${event.resourceType} at ${event.nodeId} with ${event.entityId}.`,
  });
}
