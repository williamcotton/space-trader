import type { PlayerId } from "../../../../model/ids";
import type { EntityState, GameState } from "../../../../model/state";
import { registerDirectAttackBlocker, registerDirectTargetingBlocker } from "../../../../registries/directInteraction";
import { STEALTH_KEYWORD, unitHasActiveKeyword } from "../../../../systems/keywords";

function isEnemyStealthedUnit(
  state: Readonly<GameState>,
  sourcePlayerId: PlayerId,
  target: EntityState
): boolean {
  return target.kind === "unit" && target.ownerId !== sourcePlayerId && unitHasActiveKeyword(state, target, STEALTH_KEYWORD);
}

let installed = false;

export function installStealthMechanic(): void {
  if (installed) {
    return;
  }
  installed = true;

  registerDirectTargetingBlocker("stealth_targeting", (state, sourcePlayerId, target) =>
    isEnemyStealthedUnit(state, sourcePlayerId, target) ? "Stealthed enemy units cannot be targeted directly." : null
  );

  registerDirectAttackBlocker("stealth_attack", (state, sourcePlayerId, target) =>
    isEnemyStealthedUnit(state, sourcePlayerId, target) ? "Stealthed enemy units cannot be attacked directly." : null
  );
}
