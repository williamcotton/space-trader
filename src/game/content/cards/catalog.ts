import { getRegisteredCardDefinition, getRegisteredCardDefinitions } from "../registry";
import {
  cardHasKeyword,
  getCardCascadeUnitBuffConfig,
  getCardKeywords,
  getCardPlayEffectConfig,
  getCardPlayEffectMagnitude,
  getCardSurgeEffectConfig,
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
  CardPlayProfile,
  CardResolveAnimationProfile,
  CardSourceDestination,
  CardSpeed,
  CardTargetMode,
  CascadeUnitBuffPlayEffectConfig,
  DestroyDamagedUnitsPlayEffectConfig,
  DrawAndGainResourcesPlayEffectConfig,
  GlobalUnitBuffPlayEffectConfig,
  HexAreaDamagePlayEffectConfig,
  HexTargetPredicate,
  MassDamagePlayEffectConfig,
  ResourcesByBloomCountPlayEffectConfig,
  ResourcesBySalvageCountPlayEffectConfig,
  ResourcesByUnitCountPlayEffectConfig,
  TargetPredicate,
  TacticCardDefinition,
  UnitAura,
  UnitCardDefinition,
  UnitTemplate,
  UnitTrigger,
} from "./types";

export {
  cardHasKeyword,
  getCardCascadeUnitBuffConfig,
  getCardKeywords,
  getCardPlayEffectConfig,
  getCardPlayEffectMagnitude,
  getCardSurgeEffectConfig,
  getResolvedCardPlayEffectConfigs,
  getUnitCardKeywords,
};

export function getCardDefinition(cardId: string): CardDefinition | undefined {
  return getRegisteredCardDefinition(cardId);
}

export function getCardCatalog(): Record<string, CardDefinition> {
  return getRegisteredCardDefinitions();
}
