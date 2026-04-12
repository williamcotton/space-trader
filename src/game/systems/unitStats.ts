import type { GameState, UnitEntity } from "../model/state";
import { getEffectiveStatValue, purgeExpiredEffects } from "./continuousEffects";
import type { EffectResolver } from "./effectPipeline";

type EffectResolutionOptions = {
  resolver?: EffectResolver;
};

export function getEffectiveUnitAttackDamage(state: GameState, unit: UnitEntity, options?: EffectResolutionOptions): number {
  return getEffectiveStatValue(state, unit, "attackDamage", options);
}

export function getEffectiveUnitArmor(state: GameState, unit: UnitEntity, options?: EffectResolutionOptions): number {
  return getEffectiveStatValue(state, unit, "armor", options);
}

export function getEffectiveUnitSiegeDamageBonus(state: GameState, unit: UnitEntity, options?: EffectResolutionOptions): number {
  return getEffectiveStatValue(state, unit, "siegeDamageBonus", options);
}

export function getEffectiveUnitMoveRange(state: GameState, unit: UnitEntity, options?: EffectResolutionOptions): number {
  return Math.max(0, getEffectiveStatValue(state, unit, "moveRange", options));
}

export function getEffectiveUnitAttackRange(state: GameState, unit: UnitEntity, options?: EffectResolutionOptions): number {
  return Math.max(0, getEffectiveStatValue(state, unit, "attackRange", options));
}

export function clearTemporaryUnitModifiers(state: GameState): void {
  purgeExpiredEffects(state);
}
