import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, UnitEntity } from "../model/state";
import {
  canAttackEntityDirectly as canAttackEntityDirectlyFromKeywords,
  canTargetEntityDirectly as canTargetEntityDirectlyFromKeywords,
  getAttackKeywordBlockReason,
  getTargetingKeywordBlockReason,
  isUnitBlockedFromAttackingBySummoningSickness,
  isUnitBlockedFromMovingBySummoningSickness,
} from "../systems/keywords";

export function getUnitMoveActionBlockReason(unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>): string | null {
  return isUnitBlockedFromMovingBySummoningSickness(unit) ? "Unit has summoning sickness." : null;
}

export function getUnitAttackActionBlockReason(unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>): string | null {
  return isUnitBlockedFromAttackingBySummoningSickness(unit) ? "Unit has summoning sickness." : null;
}

export function canUnitMove(unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>): boolean {
  return getUnitMoveActionBlockReason(unit) === null;
}

export function canUnitAttack(unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>): boolean {
  return getUnitAttackActionBlockReason(unit) === null;
}

export function getDirectTargetingBlockReason(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): string | null {
  return getTargetingKeywordBlockReason(state, sourcePlayerId, target);
}

export function canTargetEntityDirectly(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): boolean {
  return canTargetEntityDirectlyFromKeywords(state, sourcePlayerId, target);
}

export function getDirectAttackBlockReason(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): string | null {
  return getAttackKeywordBlockReason(state, sourcePlayerId, target);
}

export function canAttackEntityDirectly(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): boolean {
  return canAttackEntityDirectlyFromKeywords(state, sourcePlayerId, target);
}
