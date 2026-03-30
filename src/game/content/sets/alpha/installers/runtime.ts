import type { SetInstallerModule } from "../../types";
import { combineConfiguredSpellScores, scoreCascadeAttackBuffTarget } from "../ai/spellScoring";
import { getCardDefinition, getCardPlayEffectConfigsByType } from "../../../cards/catalog";
import { installAlphaPlayEffectRegistrations, installAlphaStackEffectMagnitudeRegistrations } from "../stackEffects";
import { registerSpellScoringResolver } from "../../../../registries/spellScoring";
import { registerStackResolveAnimationBuilder } from "../../../../registries/stackResolveAnimations";
import { registerTriggerConditionEvaluator } from "../../../../registries/triggerConditions";
import { buildHexShowerAnimation, getCardAnimationAccent } from "../../../../render/animations";
import { getCascadeAffectedHexes } from "../../../../systems/cascade";

function registerAlphaTriggerConditions(): void {
  registerTriggerConditionEvaluator("on_cascaded", (state, event, _condition, unit) => {
    if (event.type !== "STACK_ITEM_RESOLVED" || event.controllerId !== unit.ownerId || !event.targetHex || !event.sourceCardId) {
      return false;
    }

    const sourceCard = getCardDefinition(event.sourceCardId);
    const cascadeConfig = getCardPlayEffectConfigsByType(sourceCard, "cascade_unit_buff")[0];
    const waves = Number(cascadeConfig?.waves ?? Number.NaN);
    if (!Number.isFinite(waves)) {
      return false;
    }

    const affectedHexes = getCascadeAffectedHexes(state, event.controllerId, event.targetHex, waves, {
      excludeKeywordEffectIdPrefix: `ce_${event.itemId}_`,
    });
    return affectedHexes.some((coord) => coord.q === unit.coord.q && coord.r === unit.coord.r);
  });
}

function registerAlphaSpellScoring(): void {
  registerSpellScoringResolver("cascade_unit_buff", ({ state, botPlayerId, targeting, effectConfigs }) => {
    if (!targeting.targetHex) {
      return -Infinity;
    }
    const targetHex = targeting.targetHex;
    return combineConfiguredSpellScores(
      effectConfigs
        .filter((effectConfig) => effectConfig.type === "cascade_unit_buff")
        .map((effectConfig) =>
          scoreCascadeAttackBuffTarget(state, botPlayerId, targetHex, {
            attackBonus: Number(effectConfig.attackBonus ?? 0),
            armorBonus: Number(effectConfig.armorBonus ?? 0),
            waves: Number(effectConfig.waves ?? 0),
            roleFilter:
              effectConfig.roleFilter === "combat" ||
              effectConfig.roleFilter === "resource" ||
              effectConfig.roleFilter === "utility"
                ? effectConfig.roleFilter
                : undefined,
            grantedKeywords: Array.isArray(effectConfig.grantedKeywords) ? effectConfig.grantedKeywords : undefined,
            reward: typeof effectConfig.reward === "object" && effectConfig.reward !== null ? effectConfig.reward as never : undefined,
          })
        )
    );
  });
}

function registerAlphaStackResolveAnimations(): void {
  registerStackResolveAnimationBuilder("cascade_unit_buff", ({ event, state, baseId, sourceCard, behavior }) =>
    buildHexShowerAnimation(
      event,
      state,
      baseId,
      event.label,
      Number(getCardPlayEffectConfigsByType(sourceCard, "cascade_unit_buff")[0]?.waves ?? behavior.waves ?? 0),
      getCardAnimationAccent(event.sourceCardId)
    )
  );
}

export function installAlphaRuntimeExtensions(): void {
  installAlphaPlayEffectRegistrations();
  installAlphaStackEffectMagnitudeRegistrations();
  registerAlphaTriggerConditions();
  registerAlphaSpellScoring();
  registerAlphaStackResolveAnimations();
}

export const ALPHA_RUNTIME_INSTALLER: SetInstallerModule = {
  id: "alpha_runtime_extensions",
  install: installAlphaRuntimeExtensions,
};
