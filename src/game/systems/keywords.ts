import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, UnitEntity } from "../model/state";
import { unitHasKeyword } from "../model/state";

export const STEALTH_KEYWORD = "stealth";

function isEnemyStealthedUnit(
  _state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): target is UnitEntity {
  return target.kind === "unit" && target.ownerId !== sourcePlayerId && unitHasKeyword(target, STEALTH_KEYWORD);
}

export function getTargetingKeywordBlockReason(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): string | null {
  if (isEnemyStealthedUnit(state, sourcePlayerId, target)) {
    return "Stealthed enemy units cannot be targeted directly.";
  }

  return null;
}

export function canTargetEntityDirectly(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): boolean {
  return getTargetingKeywordBlockReason(state, sourcePlayerId, target) === null;
}

export function getAttackKeywordBlockReason(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): string | null {
  if (isEnemyStealthedUnit(state, sourcePlayerId, target)) {
    return "Stealthed enemy units cannot be attacked directly.";
  }

  return null;
}

export function canAttackEntityDirectly(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): boolean {
  return getAttackKeywordBlockReason(state, sourcePlayerId, target) === null;
}
