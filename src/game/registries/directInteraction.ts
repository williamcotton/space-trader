import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, UnitEntity } from "../model/state";

export type UnitActionType = "move" | "attack";

export type UnitActionBlocker = (
  unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>,
  action: UnitActionType
) => string | null;

export type EntityInteractionBlocker = (
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
) => string | null;

const unitActionBlockers = new Map<string, UnitActionBlocker>();
const directTargetingBlockers = new Map<string, EntityInteractionBlocker>();
const directAttackBlockers = new Map<string, EntityInteractionBlocker>();

export function registerUnitActionBlocker(id: string, blocker: UnitActionBlocker): void {
  unitActionBlockers.set(id, blocker);
}

export function registerDirectTargetingBlocker(id: string, blocker: EntityInteractionBlocker): void {
  directTargetingBlockers.set(id, blocker);
}

export function registerDirectAttackBlocker(id: string, blocker: EntityInteractionBlocker): void {
  directAttackBlockers.set(id, blocker);
}

export function getUnitActionBlockReason(
  unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>,
  action: UnitActionType
): string | null {
  for (const blocker of unitActionBlockers.values()) {
    const reason = blocker(unit, action);
    if (reason) {
      return reason;
    }
  }
  return null;
}

export function getDirectTargetingBlockReasonFromRegistry(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): string | null {
  for (const blocker of directTargetingBlockers.values()) {
    const reason = blocker(state, sourcePlayerId, target);
    if (reason) {
      return reason;
    }
  }
  return null;
}

export function getDirectAttackBlockReasonFromRegistry(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): string | null {
  for (const blocker of directAttackBlockers.values()) {
    const reason = blocker(state, sourcePlayerId, target);
    if (reason) {
      return reason;
    }
  }
  return null;
}

export function resetDirectInteractionRegistry(): void {
  unitActionBlockers.clear();
  directTargetingBlockers.clear();
  directAttackBlockers.clear();
}
