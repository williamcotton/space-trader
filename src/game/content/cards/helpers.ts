import { getPlayEffectMagnitudeCalculator } from "../../registries/playEffects";
import { getRegisteredCardDefinition } from "../registry";
import type {
  CardDefinition,
  CardKeyword,
  CardPlayEffectConfig,
} from "./types";

function cloneKeywords(keywords?: readonly CardKeyword[]): CardKeyword[] {
  return keywords ? [...keywords] : [];
}

export function getCardPlayEffectConfig(card: CardDefinition | undefined): CardPlayEffectConfig | undefined {
  return card?.play.effectConfig;
}

export function getCardPlayModifierEffectConfig(
  card: CardDefinition | undefined,
  modifierId: string
): CardPlayEffectConfig | undefined {
  return card?.play.modifierEffectConfigs?.[modifierId];
}

export function getResolvedCardPlayEffectConfigs(
  card: CardDefinition | undefined,
  activeModifierIds: readonly string[] = []
): CardPlayEffectConfig[] {
  const baseEffectConfig = getCardPlayEffectConfig(card);
  const modifierEffectConfigs = [...new Set(activeModifierIds)]
    .map((modifierId) => getCardPlayModifierEffectConfig(card, modifierId))
    .filter((effectConfig): effectConfig is CardPlayEffectConfig => Boolean(effectConfig));

  return [baseEffectConfig, ...modifierEffectConfigs].filter(
    (effectConfig): effectConfig is CardPlayEffectConfig => Boolean(effectConfig)
  );
}

export function getCardPlayEffectConfigsByType(
  card: CardDefinition | undefined,
  effectType: string,
  activeModifierIds: readonly string[] = []
): CardPlayEffectConfig[] {
  return getResolvedCardPlayEffectConfigs(card, activeModifierIds).filter((effectConfig) => effectConfig.type === effectType);
}

function getEffectConfigMagnitude(effectConfig: CardPlayEffectConfig): number {
  const calculator = getPlayEffectMagnitudeCalculator(effectConfig.type);
  return calculator ? calculator(effectConfig as never) : 0;
}

export function getCardPlayEffectMagnitude(card: CardDefinition | undefined, activeModifierIds: readonly string[] = []): number {
  const effectConfigs = getResolvedCardPlayEffectConfigs(card, activeModifierIds);
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
