import { getRegisteredCardDefinition, getRegisteredCardDefinitions } from "../registry";
import {
  cardHasKeyword,
  getCardKeywords,
  getCardPlayEffectConfig,
  getCardPlayEffectConfigsByType,
  getCardPlayEffectMagnitude,
  getCardPlayModifierEffectConfig,
  getResolvedCardPlayEffectConfigs,
  getUnitCardKeywords,
} from "./helpers";
import type { CardDefinition } from "./types";

export type {
  AutoTargetStrategy,
  CardAnimationAccent,
  CardAnimationProfile,
  CardCost,
  CardDefinition,
  CardKeyword,
  CardPlayEffectConfig,
  CardPlayModifierEffectConfigs,
  CardPlayProfile,
  CardResolveAnimationProfile,
  CardSourceDestination,
  CardSpeed,
  CardTargetMode,
  HexTargetPredicate,
  TargetPredicate,
  TacticCardDefinition,
  UnitAura,
  UnitCardDefinition,
  UnitTemplate,
  UnitTrigger,
} from "./types";

export {
  cardHasKeyword,
  getCardKeywords,
  getCardPlayEffectConfig,
  getCardPlayEffectConfigsByType,
  getCardPlayEffectMagnitude,
  getCardPlayModifierEffectConfig,
  getResolvedCardPlayEffectConfigs,
  getUnitCardKeywords,
};

export function getCardDefinition(cardId: string): CardDefinition | undefined {
  return getRegisteredCardDefinition(cardId);
}

export function getCardCatalog(): Record<string, CardDefinition> {
  return getRegisteredCardDefinitions();
}
