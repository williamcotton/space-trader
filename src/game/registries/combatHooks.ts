import type { UnitAttackDeclaredEvent } from "../actions/events";
import type { GameState, UnitEntity } from "../model/state";

export type UnitDestroyedByAttackContext = {
  state: GameState;
  event: UnitAttackDeclaredEvent;
  attacker: UnitEntity;
  target: UnitEntity;
};

export type CombatHook = {
  onUnitDestroyedByAttack?: (context: UnitDestroyedByAttackContext) => void;
};

const combatHooks = new Map<string, CombatHook>();

export function registerCombatHook(id: string, hook: CombatHook): void {
  combatHooks.set(id, hook);
}

export function runUnitDestroyedByAttackHooks(context: UnitDestroyedByAttackContext): void {
  for (const hook of combatHooks.values()) {
    hook.onUnitDestroyedByAttack?.(context);
  }
}
