import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, UnitEntity } from "../model/state";
import { getEffectiveKeywordsForUnit } from "./continuousEffects";

export const STEALTH_KEYWORD = "stealth";
export const SPROUT_KEYWORD = "sprout";
export const RELAY_KEYWORD = "relay";

export function hasSproutKeyword(keywords?: readonly string[]): boolean {
  return Boolean(keywords?.includes(SPROUT_KEYWORD));
}

export function hasRelayKeyword(keywords?: readonly string[]): boolean {
  return Boolean(keywords?.includes(RELAY_KEYWORD));
}

export function unitHasActiveKeyword(
  state: Readonly<GameState>,
  unit: Readonly<UnitEntity>,
  keyword: string,
  options?: {
    excludeEffectIdPrefix?: string;
  }
): boolean {
  return getEffectiveKeywordsForUnit(state, unit as UnitEntity, options).includes(keyword);
}

export function isUnitBlockedFromMovingBySummoningSickness(
  unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>
): boolean {
  return unit.hasSummoningSickness && !hasSproutKeyword(unit.keywords);
}

export function isUnitBlockedFromAttackingBySummoningSickness(
  unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>
): boolean {
  return unit.hasSummoningSickness && !hasSproutKeyword(unit.keywords);
}

function isEnemyStealthedUnit(
  _state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): target is UnitEntity {
  return target.kind === "unit" && target.ownerId !== sourcePlayerId && unitHasActiveKeyword(_state, target, STEALTH_KEYWORD);
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
