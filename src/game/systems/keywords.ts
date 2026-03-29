import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, UnitEntity } from "../model/state";
import { getEffectiveKeywordsForUnit } from "./continuousEffects";
import {
  getDirectAttackBlockReasonFromRegistry,
  getDirectTargetingBlockReasonFromRegistry,
  getUnitActionBlockReason,
} from "../registries/directInteraction";

export function keywordListHas(keywords?: readonly string[], keyword?: string): boolean {
  return Boolean(keyword && keywords?.includes(keyword));
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
  return getUnitActionBlockReason(unit, "move") !== null;
}

export function isUnitBlockedFromAttackingBySummoningSickness(
  unit: Readonly<Pick<UnitEntity, "hasSummoningSickness" | "keywords">>
): boolean {
  return getUnitActionBlockReason(unit, "attack") !== null;
}

export function getTargetingKeywordBlockReason(
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
  return getDirectTargetingBlockReasonFromRegistry(state, sourcePlayerId, target) === null;
}

export function getAttackKeywordBlockReason(
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
  return getDirectAttackBlockReasonFromRegistry(state, sourcePlayerId, target) === null;
}
