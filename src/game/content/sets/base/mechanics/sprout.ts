import { registerUnitActionBlocker } from "../../../../registries/directInteraction";
import { registerUnitDeploymentAdjustmentHook } from "../../../../registries/unitDeployment";
import { SPROUT_KEYWORD } from "../../../../systems/keywords";

let installed = false;

export function installSproutMechanic(): void {
  if (installed) {
    return;
  }
  installed = true;

  registerUnitActionBlocker("sprout_summoning_sickness", (unit, _action) => {
    if (!unit.hasSummoningSickness || unit.keywords?.includes(SPROUT_KEYWORD)) {
      return null;
    }

    return "Unit has summoning sickness.";
  });

  registerUnitDeploymentAdjustmentHook("sprout_immediate_actions", (card, keywords) => {
    if (!keywords.includes(SPROUT_KEYWORD)) {
      return null;
    }

    return {
      movesRemaining: card.unit.moveRange,
      attacksRemaining: card.unit.attackActionsPerTurn,
    };
  });
}
