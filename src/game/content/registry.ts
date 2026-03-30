import type { CardDefinition } from "./cards/types";
import type { StackEffectDefinition } from "./stackEffects/types";
import type { MapState } from "../model/state";
import { FACTIONS, RESOURCE_TYPES, type Faction, type ResourceType } from "../model/enums";
import type { CardSet, DeckRecipe, FactionModule, ResourceModule, RuntimeProfile } from "./sets/types";

const registeredCards = new Map<string, CardDefinition>();
const registeredStackEffects = new Map<string, StackEffectDefinition>();
const registeredDeckRecipes = new Map<string, DeckRecipe>();
const registeredStarterRecipeIdsByFaction = new Map<string, string>();
const registeredMaps = new Map<string, MapState>();
const registeredSets = new Map<string, CardSet>();
const registeredFactions = new Map<string, FactionModule>();
const registeredResources = new Map<string, ResourceModule>();
const registeredRuntimeProfiles = new Map<string, RuntimeProfile>();
let defaultRuntimeProfileId: string | null = null;
let currencyResourceId: ResourceType | null = null;

function syncRegisteredId(target: string[], id: string): void {
  if (!target.includes(id)) {
    target.push(id);
  }
}

function clearRegisteredIds(target: string[]): void {
  target.splice(0, target.length);
}

function assertRegisteredSet(setId: string): void {
  if (!registeredSets.has(setId)) {
    throw new Error(`Cannot register content for unknown set ${setId}. Register the set manifest first.`);
  }
}

function assertUniqueRegistration(kind: string, id: string, exists: boolean): void {
  if (exists) {
    throw new Error(`Duplicate ${kind} registration for ${id}.`);
  }
}

export function resetRegisteredContent(): void {
  registeredCards.clear();
  registeredStackEffects.clear();
  registeredDeckRecipes.clear();
  registeredStarterRecipeIdsByFaction.clear();
  registeredMaps.clear();
  registeredSets.clear();
  registeredFactions.clear();
  registeredResources.clear();
  registeredRuntimeProfiles.clear();
  defaultRuntimeProfileId = null;
  currencyResourceId = null;
  clearRegisteredIds(FACTIONS);
  clearRegisteredIds(RESOURCE_TYPES);
}

export function registerCardSet(set: CardSet): void {
  assertUniqueRegistration("set", set.id, registeredSets.has(set.id));
  registeredSets.set(set.id, set);
}

export function getRegisteredCardSet(setId: string): CardSet | undefined {
  return registeredSets.get(setId);
}

export function getRegisteredCardSets(): CardSet[] {
  return [...registeredSets.values()];
}

export function registerCardDefinitions(setId: string, definitions: Record<string, CardDefinition>): void {
  assertRegisteredSet(setId);
  for (const [cardId, definition] of Object.entries(definitions)) {
    assertUniqueRegistration("card", cardId, registeredCards.has(cardId));
    registeredCards.set(cardId, definition);
  }
}

export function getRegisteredCardDefinition(cardId: string): CardDefinition | undefined {
  return registeredCards.get(cardId);
}

export function getRegisteredCardDefinitions(): Record<string, CardDefinition> {
  return Object.fromEntries(registeredCards.entries());
}

export function registerStackEffectDefinitions(setId: string, definitions: Record<string, StackEffectDefinition>): void {
  assertRegisteredSet(setId);
  for (const [effectId, definition] of Object.entries(definitions)) {
    assertUniqueRegistration("stack effect", effectId, registeredStackEffects.has(effectId));
    registeredStackEffects.set(effectId, definition);
  }
}

export function getRegisteredStackEffectDefinition(effectId: string): StackEffectDefinition | undefined {
  return registeredStackEffects.get(effectId);
}

export function getRegisteredStackEffectDefinitions(): Record<string, StackEffectDefinition> {
  return Object.fromEntries(registeredStackEffects.entries());
}

export function registerDeckRecipe(setId: string, recipe: DeckRecipe): void {
  assertRegisteredSet(setId);
  assertUniqueRegistration("deck recipe", recipe.id, registeredDeckRecipes.has(recipe.id));
  assertUniqueRegistration("starter deck", recipe.factionId, registeredStarterRecipeIdsByFaction.has(recipe.factionId));

  registeredDeckRecipes.set(recipe.id, {
    ...recipe,
    cardIds: [...recipe.cardIds],
  });
  registeredStarterRecipeIdsByFaction.set(recipe.factionId, recipe.id);
}

export function registerStarterDeckRecipes(setId: string, decks: Record<string, string[]>): void {
  for (const [factionId, cardIds] of Object.entries(decks)) {
    registerDeckRecipe(setId, {
      id: `${setId}_${factionId}_starter`,
      factionId,
      cardIds: [...cardIds],
    });
  }
}

export function getRegisteredStarterDeck(faction: Faction): string[] {
  const recipeId = registeredStarterRecipeIdsByFaction.get(faction);
  const recipe = recipeId ? registeredDeckRecipes.get(recipeId) : undefined;
  return [...(recipe?.cardIds ?? [])];
}

export function getRegisteredStarterDecks(): Record<string, string[]> {
  const entries: Array<[string, string[]]> = [...registeredStarterRecipeIdsByFaction.entries()].map(([factionId, recipeId]) => {
    const recipe = registeredDeckRecipes.get(recipeId);
    return [factionId, [...(recipe?.cardIds ?? [])]];
  });
  return Object.fromEntries(entries);
}

export function getRegisteredDeckRecipes(): DeckRecipe[] {
  return [...registeredDeckRecipes.values()].map((recipe) => ({
    ...recipe,
    cardIds: [...recipe.cardIds],
  }));
}

export function registerMap(setId: string, map: MapState): void {
  assertRegisteredSet(setId);
  assertUniqueRegistration("map", map.id, registeredMaps.has(map.id));
  registeredMaps.set(map.id, map);
}

export function getRegisteredMap(mapId: string): MapState | undefined {
  return registeredMaps.get(mapId);
}

export function getRegisteredMaps(): Record<string, MapState> {
  return Object.fromEntries(registeredMaps.entries());
}

export function registerRuntimeProfile(setId: string, profile: RuntimeProfile): void {
  assertRegisteredSet(setId);
  assertUniqueRegistration("runtime profile", profile.id, registeredRuntimeProfiles.has(profile.id));
  registeredRuntimeProfiles.set(profile.id, profile);
  if (profile.default) {
    if (defaultRuntimeProfileId) {
      throw new Error(`Duplicate default runtime profile registration for ${profile.id}; ${defaultRuntimeProfileId} is already default.`);
    }
    defaultRuntimeProfileId = profile.id;
  }
}

export function getRegisteredRuntimeProfile(profileId: string): RuntimeProfile | undefined {
  return registeredRuntimeProfiles.get(profileId);
}

export function getRegisteredRuntimeProfiles(): RuntimeProfile[] {
  return [...registeredRuntimeProfiles.values()];
}

export function getDefaultRuntimeProfile(): RuntimeProfile | null {
  if (defaultRuntimeProfileId) {
    return registeredRuntimeProfiles.get(defaultRuntimeProfileId) ?? null;
  }
  return getRegisteredRuntimeProfiles()[0] ?? null;
}

export function registerFactionModule(faction: FactionModule): void {
  assertUniqueRegistration("faction", faction.id, registeredFactions.has(faction.id));
  registeredFactions.set(faction.id, faction);
  syncRegisteredId(FACTIONS, faction.id);
}

export function getRegisteredFactionModule(factionId: string): FactionModule | undefined {
  return registeredFactions.get(factionId);
}

export function getRegisteredFactionIds(): Faction[] {
  return [...registeredFactions.keys()];
}

export function getRegisteredFactionModules(): FactionModule[] {
  return [...registeredFactions.values()];
}

export function getRegisteredPrimaryResourceIdForFaction(factionId: Faction): ResourceType {
  const faction = getRegisteredFactionModule(factionId);
  if (!faction) {
    throw new Error(`Missing faction module for ${factionId}.`);
  }
  return faction.primaryResourceId;
}

export function registerResourceModule(resource: ResourceModule): void {
  assertUniqueRegistration("resource", resource.id, registeredResources.has(resource.id));
  if (resource.kind === "currency") {
    if (currencyResourceId) {
      throw new Error(`Duplicate currency resource registration for ${resource.id}; ${currencyResourceId} is already currency.`);
    }
    currencyResourceId = resource.id;
  }
  registeredResources.set(resource.id, resource);
  syncRegisteredId(RESOURCE_TYPES, resource.id);
}

export function getRegisteredResourceModule(resourceId: string): ResourceModule | undefined {
  return registeredResources.get(resourceId);
}

export function getRegisteredResourceIds(): ResourceType[] {
  return [...registeredResources.keys()];
}

export function getRegisteredResourceModules(): ResourceModule[] {
  return [...registeredResources.values()];
}

export function getOrderedRegisteredResourceModules(): ResourceModule[] {
  return getRegisteredResourceModules().sort((a, b) => {
    const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.id.localeCompare(b.id);
  });
}

export function getRegisteredCurrencyResourceId(): ResourceType {
  const registeredId = currencyResourceId ?? getOrderedRegisteredResourceModules()[0]?.id;
  if (!registeredId) {
    throw new Error("No registered currency resource is available.");
  }
  return registeredId;
}

export function isRegisteredCurrencyResource(resourceId: ResourceType): boolean {
  return resourceId === getRegisteredCurrencyResourceId();
}
