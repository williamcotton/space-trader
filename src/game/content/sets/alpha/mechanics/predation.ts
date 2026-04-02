import { hexDistance } from "../../../../model/hex";
import { getEnemyEntities } from "../../../../model/queries";
import { registerUnitBuffScoreContributor } from "../../../../registries/aiMechanics";
import { registerUnitAttackPermissionChecker } from "../../../../registries/directInteraction";
import { canAttackEntityDirectly, canUnitAttack } from "../../../../rules/directInteraction";
import { resolveCombatAttack } from "../../../../systems/combat";
import { unitHasActiveKeyword } from "../../../../systems/keywords";
import { PREDATION_KEYWORD } from "./keywordIds";

const AI_WEIGHTS = {
  baseOpportunity: 24,
  damageMult: 18,
  killBonus: 72,
  baseAttackBonus: 28,
  enemyResourceBonus: 18,
  enemyUtilityBonus: 10,
} as const;

export function installPredationMechanic(): void {
  registerUnitAttackPermissionChecker("predation_resource_attack", (state, unit) =>
    unit.role === "resource" && unitHasActiveKeyword(state, unit, PREDATION_KEYWORD)
  );

  registerUnitBuffScoreContributor("predation_attack_permission", ({ state, botPlayerId, affectedUnits, options }) => {
    if (!options.grantedKeywords?.includes(PREDATION_KEYWORD)) {
      return null;
    }

    let scoreDelta = 0;
    let hasMeaningfulOpportunity = false;

    for (const unit of affectedUnits) {
      if (unit.role !== "resource" || unit.attacksRemaining <= 0 || !canUnitAttack(unit)) {
        continue;
      }

      const bestTarget = getEnemyEntities(state, botPlayerId)
        .filter((target) => canAttackEntityDirectly(state, botPlayerId, target))
        .filter((target) => hexDistance(unit.coord, target.coord) <= unit.attackRange)
        .map((target) => ({
          target,
          preview: resolveCombatAttack(state, unit, target),
        }))
        .sort((a, b) => {
          const aScore =
            a.preview.finalDamage +
            (a.preview.targetDestroyed ? AI_WEIGHTS.killBonus : 0) +
            (a.target.kind === "base"
              ? AI_WEIGHTS.baseAttackBonus
              : a.target.kind === "unit" && a.target.role === "resource"
                ? AI_WEIGHTS.enemyResourceBonus
                : a.target.kind === "unit" && a.target.role === "utility"
                  ? AI_WEIGHTS.enemyUtilityBonus
                  : 0);
          const bScore =
            b.preview.finalDamage +
            (b.preview.targetDestroyed ? AI_WEIGHTS.killBonus : 0) +
            (b.target.kind === "base"
              ? AI_WEIGHTS.baseAttackBonus
              : b.target.kind === "unit" && b.target.role === "resource"
                ? AI_WEIGHTS.enemyResourceBonus
                : b.target.kind === "unit" && b.target.role === "utility"
                  ? AI_WEIGHTS.enemyUtilityBonus
                  : 0);
          return bScore - aScore || a.target.id.localeCompare(b.target.id);
        })[0];

      if (!bestTarget) {
        continue;
      }

      hasMeaningfulOpportunity = true;
      scoreDelta +=
        AI_WEIGHTS.baseOpportunity +
        bestTarget.preview.finalDamage * AI_WEIGHTS.damageMult +
        (bestTarget.preview.targetDestroyed ? AI_WEIGHTS.killBonus : 0) +
        (bestTarget.target.kind === "base"
          ? AI_WEIGHTS.baseAttackBonus
          : bestTarget.target.kind === "unit" && bestTarget.target.role === "resource"
            ? AI_WEIGHTS.enemyResourceBonus
            : bestTarget.target.kind === "unit" && bestTarget.target.role === "utility"
              ? AI_WEIGHTS.enemyUtilityBonus
              : 0);
    }

    return {
      scoreDelta,
      hasMeaningfulOpportunity,
    };
  });
}
