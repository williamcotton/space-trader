import { getPlayEffectMagnitudeCalculator, registerPlayEffectMagnitudeCalculator } from "../../registries/playEffects";
import { getRegisteredCardDefinition, getRegisteredResourceIds } from "../registry";
import type {
  CardDefinition,
  CardKeyword,
  CardPlayEffectConfig,
  CascadeUnitBuffPlayEffectConfig,
} from "./types";

function cloneKeywords(keywords?: readonly CardKeyword[]): CardKeyword[] {
  return keywords ? [...keywords] : [];
}

export function getCardPlayEffectConfig(card: CardDefinition | undefined): CardPlayEffectConfig | undefined {
  return card?.play.effectConfig;
}

export function getCardSurgeEffectConfig(card: CardDefinition | undefined): CardPlayEffectConfig | undefined {
  return card?.play.surgeEffectConfig;
}

export function getResolvedCardPlayEffectConfigs(card: CardDefinition | undefined, surgeActive = false): CardPlayEffectConfig[] {
  const baseEffectConfig = getCardPlayEffectConfig(card);
  const surgeEffectConfig = surgeActive ? getCardSurgeEffectConfig(card) : undefined;

  return [baseEffectConfig, surgeEffectConfig].filter((effectConfig): effectConfig is CardPlayEffectConfig => Boolean(effectConfig));
}

export function getCardCascadeUnitBuffConfig(card: CardDefinition | undefined): CascadeUnitBuffPlayEffectConfig | undefined {
  const effectConfig = getCardPlayEffectConfig(card);
  return effectConfig?.type === "cascade_unit_buff" ? effectConfig : undefined;
}

registerPlayEffectMagnitudeCalculator("mass_damage", (effectConfig) => effectConfig.amount);
registerPlayEffectMagnitudeCalculator("global_unit_buff", (effectConfig) =>
  Math.max(Math.abs(effectConfig.attackBonus), Math.abs(effectConfig.armorBonus))
);
registerPlayEffectMagnitudeCalculator("destroy_damaged_units", () => 0);
registerPlayEffectMagnitudeCalculator("draw_and_gain_resources", (effectConfig) =>
  Math.max(
    effectConfig.drawCount,
    ...getRegisteredResourceIds().map((resource) => effectConfig.resources[resource] ?? 0),
    0
  )
);
registerPlayEffectMagnitudeCalculator("resources_by_unit_count", (effectConfig) =>
  Math.max(
    ...getRegisteredResourceIds().map(
      (resource) => (effectConfig.resourcesPerThreshold[resource] ?? 0) * (effectConfig.maxThresholds ?? 1)
    ),
    0
  )
);
registerPlayEffectMagnitudeCalculator("resources_by_bloom_count", (effectConfig) =>
  Math.max(
    ...getRegisteredResourceIds().map(
      (resource) => (effectConfig.resourcesPerThreshold[resource] ?? 0) * (effectConfig.maxThresholds ?? 1)
    ),
    0
  )
);
registerPlayEffectMagnitudeCalculator("resources_by_salvage_count", (effectConfig) =>
  Math.max(
    ...getRegisteredResourceIds().map(
      (resource) => (effectConfig.resourcesPerThreshold[resource] ?? 0) * (effectConfig.maxThresholds ?? 1)
    ),
    0
  )
);
registerPlayEffectMagnitudeCalculator("hex_area_damage", (effectConfig) => effectConfig.amount);
registerPlayEffectMagnitudeCalculator("cascade_unit_buff", (effectConfig) =>
  Math.max(
    Math.abs(effectConfig.attackBonus),
    Math.abs(effectConfig.armorBonus),
    effectConfig.grantedKeywords && effectConfig.grantedKeywords.length > 0 ? 1 : 0
  )
);

function getEffectConfigMagnitude(effectConfig: CardPlayEffectConfig): number {
  const calculator = getPlayEffectMagnitudeCalculator(effectConfig.type);
  return calculator ? calculator(effectConfig as never) : 0;
}

export function getCardPlayEffectMagnitude(card: CardDefinition | undefined, surgeActive = false): number {
  const effectConfigs = getResolvedCardPlayEffectConfigs(card, surgeActive);
  if (effectConfigs.length === 0) {
    return 0;
  }

  return effectConfigs.reduce((sum, effectConfig) => sum + getEffectConfigMagnitude(effectConfig), 0);
}

export function getCardKeywords(definition: CardDefinition): CardKeyword[] {
  const merged = definition.kind === "unit"
    ? [...cloneKeywords(definition.keywords), ...cloneKeywords(definition.unit.keywords)]
    : cloneKeywords(definition.keywords);

  return [...new Set(merged)];
}

export function getUnitCardKeywords(cardId: string | null | undefined): CardKeyword[] {
  if (!cardId) return [];
  const definition = getRegisteredCardDefinition(cardId);
  if (!definition || definition.kind !== "unit") return [];
  return cloneKeywords(definition.unit.keywords);
}

export function cardHasKeyword(definition: CardDefinition, keyword: CardKeyword): boolean {
  return getCardKeywords(definition).includes(keyword);
}

