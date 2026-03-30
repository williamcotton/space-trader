import { registerUnitActionBlocker } from "../../../../registries/directInteraction";
import { registerUnitDeploymentAdjustmentHook } from "../../../../registries/unitDeployment";
import { SPROUT_KEYWORD } from "./keywordIds";

export function installSproutMechanic(): void {
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
