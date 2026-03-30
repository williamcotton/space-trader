import type { GameState, UnitEntity } from "../model/state";

export type UnitStatHook = (
  state: Readonly<GameState>,
  unit: UnitEntity,
  stat: "attackDamage" | "armor" | "siegeDamageBonus"
) => number;

const unitStatHooks = new Map<string, UnitStatHook>();

export function registerUnitStatHook(id: string, hook: UnitStatHook): void {
  unitStatHooks.set(id, hook);
}

export function getRegisteredUnitStatAdjustments(
  state: Readonly<GameState>,
  unit: UnitEntity,
  stat: "attackDamage" | "armor" | "siegeDamageBonus"
): number {
  let total = 0;
  for (const hook of unitStatHooks.values()) {
    total += hook(state, unit, stat);
  }
  return total;
}

export function resetUnitStatHookRegistry(): void {
  unitStatHooks.clear();
}
