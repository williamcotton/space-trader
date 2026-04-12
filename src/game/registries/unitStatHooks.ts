import type { GameState, UnitEntity } from "../model/state";
import type { UnitStatName } from "../systems/effectPipeline";

export type UnitStatHookContext = {
  keywords: readonly string[];
};

export type UnitStatHook = (
  state: Readonly<GameState>,
  unit: Readonly<UnitEntity>,
  stat: UnitStatName,
  context: UnitStatHookContext
) => number;

const unitStatHooks = new Map<string, UnitStatHook>();

export function registerUnitStatHook(id: string, hook: UnitStatHook): void {
  unitStatHooks.set(id, hook);
}

export function getRegisteredUnitStatAdjustments(
  state: Readonly<GameState>,
  unit: Readonly<UnitEntity>,
  stat: UnitStatName,
  context: UnitStatHookContext = { keywords: unit.keywords ?? [] }
): number {
  let total = 0;
  for (const hook of unitStatHooks.values()) {
    total += hook(state, unit, stat, context);
  }
  return total;
}

export function resetUnitStatHookRegistry(): void {
  unitStatHooks.clear();
}
