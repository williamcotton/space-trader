import {
  cardHasKeyword,
  getCardCascadeUnitBuffConfig,
  getCardDefinition,
  getCardKeywords,
  getCardPlayEffectMagnitude,
  getCardPlayEffectConfig,
  getCardSurgeEffectConfig,
  getResolvedCardPlayEffectConfigs,
  getUnitCardKeywords,
} from "./content/cards/catalog";
import {
  getStackEffectDefinition,
  getStackEffectMagnitude,
  isCounterResponse,
  isKnownStackEffect,
} from "./content/stackEffects";
import { getStarterDeckCardIds, validateDeckCardIds } from "./content/decks/starterDecks";
import {
  configurePlayerThemes,
  ensureEntityPresentation,
  formatFactionName,
  getEntityDisplayName,
  getPlayerAnimationPalette,
  getPlayerLabel,
  getPlayerTheme,
  getResourceTheme,
  getUnitRoleTheme,
} from "./presentation";
import {
  canAttackEntityDirectly,
  canTargetEntityDirectly,
  getAttackKeywordBlockReason,
  getTargetingKeywordBlockReason,
  hasBastionKeyword,
  hasBloomKeyword,
  hasRelayKeyword,
  hasSalvageKeyword,
  hasSproutKeyword,
  isUnitBlockedFromAttackingBySummoningSickness,
  isUnitBlockedFromMovingBySummoningSickness,
  unitHasActiveKeyword,
} from "./systems/keywords";

// This file is the stable public API surface for content/presentation/keyword helpers.
// The refactor should preserve these helpers while moving their implementations behind
// registries, set loading, and mechanic modules.

export const cardCatalogFacade = {
  getCardDefinition,
  getCardKeywords,
  getUnitCardKeywords,
  cardHasKeyword,
  getCardPlayEffectConfig,
  getCardSurgeEffectConfig,
  getResolvedCardPlayEffectConfigs,
  getCardCascadeUnitBuffConfig,
  getCardPlayEffectMagnitude,
} as const;

export const stackEffectCatalogFacade = {
  getStackEffectDefinition,
  isKnownStackEffect,
  isCounterResponse,
  getStackEffectMagnitude,
} as const;

export const starterDeckFacade = {
  getStarterDeckCardIds,
  validateDeckCardIds,
} as const;

export const presentationFacade = {
  configurePlayerThemes,
  getPlayerTheme,
  getPlayerAnimationPalette,
  getPlayerLabel,
  getResourceTheme,
  getUnitRoleTheme,
  formatFactionName,
  ensureEntityPresentation,
  getEntityDisplayName,
} as const;

export const keywordRulesFacade = {
  hasSproutKeyword,
  hasRelayKeyword,
  hasBloomKeyword,
  hasSalvageKeyword,
  hasBastionKeyword,
  unitHasActiveKeyword,
  isUnitBlockedFromMovingBySummoningSickness,
  isUnitBlockedFromAttackingBySummoningSickness,
  getTargetingKeywordBlockReason,
  canTargetEntityDirectly,
  getAttackKeywordBlockReason,
  canAttackEntityDirectly,
} as const;

export type CardCatalogFacade = typeof cardCatalogFacade;
export type StackEffectCatalogFacade = typeof stackEffectCatalogFacade;
export type StarterDeckFacade = typeof starterDeckFacade;
export type PresentationFacade = typeof presentationFacade;
export type KeywordRulesFacade = typeof keywordRulesFacade;
