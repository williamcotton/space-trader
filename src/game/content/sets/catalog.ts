import type { CardSet } from "./types";
import { BASE_SET } from "./base";

const BUILT_IN_CARD_SET_MANIFESTS = new Map<string, CardSet>([[BASE_SET.id, BASE_SET]]);
const DEFAULT_BUILT_IN_SET_IDS = [BASE_SET.id] as const;

export function getDefaultBuiltInSetIds(): string[] {
  return [...DEFAULT_BUILT_IN_SET_IDS];
}

export function getBuiltInCardSetManifest(setId: string): CardSet | undefined {
  return BUILT_IN_CARD_SET_MANIFESTS.get(setId);
}

export function requireBuiltInCardSetManifest(setId: string): CardSet {
  const set = getBuiltInCardSetManifest(setId);
  if (!set) {
    throw new Error(`Unknown built-in content set ${setId}.`);
  }
  return set;
}

export function getBuiltInCardSetManifests(): CardSet[] {
  return [...BUILT_IN_CARD_SET_MANIFESTS.values()];
}
