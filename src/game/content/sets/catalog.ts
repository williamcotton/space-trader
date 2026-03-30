import type { CardSet } from "./types";
import { ALPHA_SET } from "./alpha";
import { FOUNDATION_SET } from "./foundation";

const BUILT_IN_CARD_SET_MANIFESTS = new Map<string, CardSet>([
  [FOUNDATION_SET.id, FOUNDATION_SET],
  [ALPHA_SET.id, ALPHA_SET],
]);
const DEFAULT_BUILT_IN_SET_IDS = [ALPHA_SET.id] as const;

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
