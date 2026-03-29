import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, UnitEntity } from "../model/state";
import { getEffectiveKeywordsForUnit } from "./continuousEffects";
import {
  getDirectAttackBlockReasonFromRegistry,
  getDirectTargetingBlockReasonFromRegistry,
  getUnitActionBlockReason,
} from "../registries/directInteraction";

export const STEALTH_KEYWORD = "stealth";
export const SPROUT_KEYWORD = "sprout";
export const RELAY_KEYWORD = "relay";
export const BLOOM_KEYWORD = "bloom";
export const SALVAGE_KEYWORD = "salvage";
export const BASTION_KEYWORD = "bastion";
export const UNCOUNTERABLE_KEYWORD = "uncounterable";

export function hasSproutKeyword(keywords?: readonly string[]): boolean {
  return Boolean(keywords?.includes(SPROUT_KEYWORD));
}

export function hasRelayKeyword(keywords?: readonly string[]): boolean {
  return Boolean(keywords?.includes(RELAY_KEYWORD));
}

export function hasBloomKeyword(keywords?: readonly string[]): boolean {
  return Boolean(keywords?.includes(BLOOM_KEYWORD));
}

export function hasSalvageKeyword(keywords?: readonly string[]): boolean {
  return Boolean(keywords?.includes(SALVAGE_KEYWORD));
}

export function hasBastionKeyword(keywords?: readonly string[]): boolean {
  return Boolean(keywords?.includes(BASTION_KEYWORD));
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
