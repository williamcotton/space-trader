import type { CardDefinition } from "./cards/catalog";
import type { StackEffectDefinition } from "./stackEffects";
import type { MapState } from "../model/state";
import { FACTIONS, RESOURCE_TYPES, type Faction, type ResourceType } from "../model/enums";
import type { CardSet, FactionModule, ResourceModule } from "./sets/types";

const registeredCards = new Map<string, CardDefinition>();
const registeredStackEffects = new Map<string, StackEffectDefinition>();
const registeredStarterDecks = new Map<string, string[]>();
const registeredMaps = new Map<string, MapState>();
const registeredSets = new Map<string, CardSet>();
const registeredFactions = new Map<string, FactionModule>();
const registeredResources = new Map<string, ResourceModule>();

function syncRegisteredId(target: string[], id: string): void {
  if (!target.includes(id)) {
    target.push(id);
  }
}

export function registerCardDefinitions(setId: string, definitions: Record<string, CardDefinition>): void {
  for (const [cardId, definition] of Object.entries(definitions)) {
    registeredCards.set(cardId, definition);
  }
  if (!registeredSets.has(setId)) {
    registeredSets.set(setId, { id: setId, name: setId });
  }
}

export function getRegisteredCardDefinition(cardId: string): CardDefinition | undefined {
  return registeredCards.get(cardId);
}

export function getRegisteredCardDefinitions(): Record<string, CardDefinition> {
  return Object.fromEntries(registeredCards.entries());
}

export function registerStackEffectDefinitions(setId: string, definitions: Record<string, StackEffectDefinition>): void {
  for (const [effectId, definition] of Object.entries(definitions)) {
    registeredStackEffects.set(effectId, definition);
  }
  if (!registeredSets.has(setId)) {
    registeredSets.set(setId, { id: setId, name: setId });
  }
}

export function getRegisteredStackEffectDefinition(effectId: string): StackEffectDefinition | undefined {
  return registeredStackEffects.get(effectId);
}

export function getRegisteredStackEffectDefinitions(): Record<string, StackEffectDefinition> {
  return Object.fromEntries(registeredStackEffects.entries());
}

export function registerStarterDeckRecipes(setId: string, decks: Record<string, string[]>): void {
  for (const [faction, cardIds] of Object.entries(decks)) {
    registeredStarterDecks.set(faction, [...cardIds]);
  }
  if (!registeredSets.has(setId)) {
    registeredSets.set(setId, { id: setId, name: setId });
  }
}

export function getRegisteredStarterDeck(faction: Faction): string[] {
  return [...(registeredStarterDecks.get(faction) ?? [])];
}

export function getRegisteredStarterDecks(): Record<string, string[]> {
  return Object.fromEntries(registeredStarterDecks.entries());
}

export function registerMap(setId: string, map: MapState): void {
  registeredMaps.set(map.id, map);
  if (!registeredSets.has(setId)) {
    registeredSets.set(setId, { id: setId, name: setId });
  }
}

export function getRegisteredMap(mapId: string): MapState | undefined {
  return registeredMaps.get(mapId);
}

export function registerCardSet(set: CardSet): void {
  registeredSets.set(set.id, set);
}

export function getRegisteredCardSet(setId: string): CardSet | undefined {
  return registeredSets.get(setId);
}

export function getRegisteredCardSets(): CardSet[] {
  return [...registeredSets.values()];
}

export function registerFactionModule(faction: FactionModule): void {
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
