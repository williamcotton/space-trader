import { hexDistance } from "../model/hex";
import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, UnitEntity } from "../model/state";
import {
  getDirectAttackBlockReasonFromRegistry,
  getDirectTargetingBlockReasonFromRegistry,
  getUnitActionBlockReason,
  unitHasRegisteredAttackPermission,
} from "../registries/directInteraction";
import { getEffectiveUnitAttackRange } from "../systems/unitStats";

export function getUnitMoveActionBlockReason(unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>): string | null {
  return getUnitActionBlockReason(unit, "move");
}

export function getUnitAttackActionBlockReason(unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>): string | null {
  return getUnitActionBlockReason(unit, "attack");
}

export function canUnitMove(unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>): boolean {
  return getUnitMoveActionBlockReason(unit) === null;
}

export function canUnitAttack(unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>): boolean {
  return getUnitAttackActionBlockReason(unit) === null;
}

export function getUnitAttackDeclarationBlockReason(
  state: Readonly<GameState>,
  unit: Readonly<UnitEntity>
): string | null {
  const actionBlockReason = getUnitAttackActionBlockReason(unit);
  if (actionBlockReason) {
    return actionBlockReason;
  }

  if (unit.role === "combat" || unitHasRegisteredAttackPermission(state, unit)) {
    return null;
  }

  return "Only combat units can attack.";
}

export function canUnitDeclareAttack(
  state: Readonly<GameState>,
  unit: Readonly<UnitEntity>
): boolean {
  return getUnitAttackDeclarationBlockReason(state, unit) === null;
}

export function getDirectTargetingBlockReason(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): string | null {
  return getDirectTargetingBlockReasonFromRegistry(state, sourcePlayerId, target);
}

export function canTargetEntityDirectly(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): boolean {
  return getDirectTargetingBlockReason(state, sourcePlayerId, target) === null;
}

export function getDirectAttackBlockReason(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): string | null {
  return getDirectAttackBlockReasonFromRegistry(state, sourcePlayerId, target);
}

export function canAttackEntityDirectly(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): boolean {
  return getDirectAttackBlockReason(state, sourcePlayerId, target) === null;
}

export function canUnitAttackTarget(
  state: Readonly<GameState>,
  attacker: Readonly<UnitEntity>,
  target: Readonly<EntityState>
): boolean {
  if (attacker.ownerId === target.ownerId) {
    return false;
  }

  if (!canUnitDeclareAttack(state, attacker) || attacker.attacksRemaining <= 0) {
    return false;
  }

  if (!canAttackEntityDirectly(state, attacker.ownerId, target)) {
    return false;
  }

  return hexDistance(attacker.coord, target.coord) <= getEffectiveUnitAttackRange(state, attacker);
}

export function getAttackableEntitiesForUnit(
  state: Readonly<GameState>,
  attacker: Readonly<UnitEntity>
): EntityState[] {
  return Object.values(state.entities)
    .filter((target) => canUnitAttackTarget(state, attacker, target))
    .sort((a, b) => a.id.localeCompare(b.id));
}
