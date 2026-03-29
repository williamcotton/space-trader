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

export function clearTemporaryUnitModifiers(state: GameState): void {
  purgeExpiredEffects(state);
}
