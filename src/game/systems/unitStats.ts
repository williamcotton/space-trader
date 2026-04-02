import type { GameState, UnitEntity } from "../model/state";
import { getEffectiveStatValue, purgeExpiredEffects } from "./continuousEffects";

export function getEffectiveUnitAttackDamage(state: GameState, unit: UnitEntity): number {
  return getEffectiveStatValue(state, unit, "attackDamage");
}

export function getEffectiveUnitArmor(state: GameState, unit: UnitEntity): number {
  return getEffectiveStatValue(state, unit, "armor");
}

export function getEffectiveUnitSiegeDamageBonus(state: GameState, unit: UnitEntity): number {
  return getEffectiveStatValue(state, unit, "siegeDamageBonus");
}

export function getEffectiveUnitMoveRange(state: GameState, unit: UnitEntity): number {
  return Math.max(0, getEffectiveStatValue(state, unit, "moveRange"));
}

export function getEffectiveUnitAttackRange(state: GameState, unit: UnitEntity): number {
  return Math.max(0, getEffectiveStatValue(state, unit, "attackRange"));
}

export function clearTemporaryUnitModifiers(state: GameState): void {
  purgeExpiredEffects(state);
}
