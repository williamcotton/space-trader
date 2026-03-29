import { registerCascadeScoreContributor, registerTriggerConditionScoreContributor } from "../registries/aiMechanics";
import { registerCascadeBranchProvider } from "../registries/cascadeBranches";
import { RELAY_KEYWORD, unitHasActiveKeyword } from "../systems/keywords";

const USED_RELAY_UNITS_MEMORY_KEY = "relay.usedUnits";

registerCascadeBranchProvider("relay_repeat_branch", ({ state, waveAffectedHexes, branch, options, getFriendlyUnitsOnHexes, memory }) => {
  const usedRelayUnits = (memory.get(USED_RELAY_UNITS_MEMORY_KEY) as Set<string> | undefined) ?? new Set<string>();
  memory.set(USED_RELAY_UNITS_MEMORY_KEY, usedRelayUnits);

  return getFriendlyUnitsOnHexes(waveAffectedHexes)
    .filter((unit) =>
      unitHasActiveKeyword(state, unit, RELAY_KEYWORD, {
        excludeEffectIdPrefix: options?.excludeKeywordEffectIdPrefix,
      }) && !usedRelayUnits.has(unit.id)
    )
    .map((unit) => {
      usedRelayUnits.add(unit.id);
      return {
        origin: { ...unit.coord },
        totalWaves: branch.totalWaves,
      };
    });
});

registerCascadeScoreContributor("relay_keyword_grant", ({ state, affectedUnits, options }) => {
  if (!options.grantedKeywords?.includes(RELAY_KEYWORD)) {
    return 0;
  }

  const newlyRelayedUnits = affectedUnits.filter((unit) => !unitHasActiveKeyword(state, unit, RELAY_KEYWORD));
  return newlyRelayedUnits.length * 18;
});

registerTriggerConditionScoreContributor("relay_trigger_default", (condition) =>
  condition.type === "on_cascaded" ? 12 : null
);
