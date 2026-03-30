import type { UnitRole } from "../model/enums";
import type { CardSet } from "./sets/types";
import { BASE_SET } from "./sets/base";
import {
  registerCardDefinitions,
  registerCardSet,
  registerDeckRecipe,
  registerFactionModule,
  registerMap,
  registerResourceModule,
  registerRuntimeProfile,
  registerStackEffectDefinitions,
  resetRegisteredContent,
} from "./registry";
import {
  registerFactionPresentation,
  registerResourceTheme,
  registerUnitRoleTheme,
  resetPresentationRegistry,
} from "../registries/presentation";
import { resetAiMechanicsRegistry } from "../registries/aiMechanics";
import { resetAutoTargetRegistry } from "../registries/autoTargets";
import { resetBoardBlastEffectRegistry } from "../registries/boardBlastEffects";
import { resetCardCounterabilityRegistry } from "../registries/cardCounterability";
import { resetCardPlayModifierRegistry } from "../registries/cardPlayModifiers";
import { resetCascadeBranchRegistry } from "../registries/cascadeBranches";
import { resetCombatHookRegistry } from "../registries/combatHooks";
import { resetStackPreviewRegistry } from "../registries/stackPreviews";
import { resetDebugStackResponseRegistry } from "../registries/debugStackResponses";
import { resetDirectInteractionRegistry } from "../registries/directInteraction";
import { resetMechanicAnimationRegistry } from "../registries/mechanicAnimations";
import { resetMechanicApiRegistry } from "../registries/mechanicApis";
import { resetMechanicInstructionRegistry } from "../registries/mechanicInstructions";
import { resetMechanicStateRegistry } from "../registries/mechanicState";
import { resetPlayEffectRegistry } from "../registries/playEffects";
import { resetSpellScoringRegistry } from "../registries/spellScoring";
import { resetStackEffectMagnitudeRegistry } from "../registries/stackEffectMagnitudes";
import { resetStackResolveAnimationRegistry } from "../registries/stackResolveAnimations";
import { resetTriggerConditionRegistry } from "../registries/triggerConditions";
import { resetUnitDeploymentRegistry } from "../registries/unitDeployment";
import { resetUnitStatHookRegistry } from "../registries/unitStatHooks";

const DEFAULT_CONTENT_SETS: readonly CardSet[] = [BASE_SET];

let loadedSetIds = new Set<string>();

function resolveLoadOrder(inputSets: readonly CardSet[]): CardSet[] {
  const pending = new Map<string, CardSet>();
  for (const set of inputSets) {
    if (pending.has(set.id)) {
      throw new Error(`Duplicate set manifest supplied for ${set.id}.`);
    }
    pending.set(set.id, set);
  }

  const ordered: CardSet[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(setId: string): void {
    if (visited.has(setId)) {
      return;
    }

    const set = pending.get(setId);
    if (!set) {
      throw new Error(`Missing set manifest for dependency ${setId}.`);
    }

    if (visiting.has(setId)) {
      throw new Error(`Circular set dependency detected at ${setId}.`);
    }

    visiting.add(setId);
    for (const dependencyId of set.dependencies ?? []) {
      visit(dependencyId);
    }
    visiting.delete(setId);
    visited.add(setId);
    ordered.push(set);
  }

  for (const setId of pending.keys()) {
    visit(setId);
  }

  return ordered;
}

function registerSetContent(set: CardSet): void {
  registerCardSet(set);

  for (const resource of set.resources ?? []) {
    registerResourceModule(resource);
    registerResourceTheme(resource.id, {
      label: resource.label,
      shortLabel: resource.shortLabel,
      color: resource.color,
      glow: resource.glow,
    });
  }

  for (const faction of set.factions ?? []) {
    registerFactionModule(faction);
    registerFactionPresentation(faction.id, {
      label: faction.label,
      theme: faction.theme,
      mirrorAltTheme: faction.mirrorAltTheme,
      animationAccent: faction.animationAccent ?? faction.id,
    });
  }

  for (const [role, theme] of Object.entries(set.roleThemes ?? {}) as [UnitRole, NonNullable<CardSet["roleThemes"]>[UnitRole]][]) {
    registerUnitRoleTheme(role, theme);
  }

  if (set.cards) {
    registerCardDefinitions(set.id, set.cards);
  }

  if (set.stackEffects) {
    registerStackEffectDefinitions(set.id, set.stackEffects);
  }

  for (const recipe of set.deckRecipes ?? []) {
    registerDeckRecipe(set.id, recipe);
  }

  for (const mapModule of set.maps ?? []) {
    registerMap(set.id, mapModule.map);
  }

  for (const runtimeProfile of set.runtimeProfiles ?? []) {
    registerRuntimeProfile(set.id, runtimeProfile);
  }

  for (const mechanic of set.mechanics ?? []) {
    mechanic.install();
  }

  for (const installer of set.installers ?? []) {
    installer.install();
  }
}

export function resetLoadedContent(): void {
  loadedSetIds = new Set();
  resetRegisteredContent();
  resetPresentationRegistry();
  resetAiMechanicsRegistry();
  resetAutoTargetRegistry();
  resetBoardBlastEffectRegistry();
  resetCardCounterabilityRegistry();
  resetCardPlayModifierRegistry();
  resetCascadeBranchRegistry();
  resetCombatHookRegistry();
  resetDirectInteractionRegistry();
  resetMechanicAnimationRegistry();
  resetMechanicApiRegistry();
  resetMechanicInstructionRegistry();
  resetMechanicStateRegistry();
  resetPlayEffectRegistry();
  resetSpellScoringRegistry();
  resetStackEffectMagnitudeRegistry();
  resetStackPreviewRegistry();
  resetStackResolveAnimationRegistry();
  resetDebugStackResponseRegistry();
  resetTriggerConditionRegistry();
  resetUnitDeploymentRegistry();
  resetUnitStatHookRegistry();
}

export function loadContentSets(sets: readonly CardSet[], options?: { reset?: boolean }): void {
  const shouldReset = options?.reset ?? true;
  if (shouldReset) {
    resetLoadedContent();
  }

  const orderedSets = resolveLoadOrder(sets);
  for (const set of orderedSets) {
    if (loadedSetIds.has(set.id)) {
      continue;
    }
    registerSetContent(set);
    loadedSetIds.add(set.id);
  }
}

export function initializeBaseContent(): void {
  if (loadedSetIds.has(BASE_SET.id)) {
    return;
  }
  loadContentSets(DEFAULT_CONTENT_SETS, { reset: true });
}

export function ensureBaseContentLoaded(): void {
  if (loadedSetIds.size === 0) {
    initializeBaseContent();
    return;
  }

  if (!loadedSetIds.has(BASE_SET.id)) {
    throw new Error("Base content is not loaded. Explicitly load compatible content sets before using base gameplay facades.");
  }
}

export function getLoadedContentSetIds(): string[] {
  return [...loadedSetIds];
}
