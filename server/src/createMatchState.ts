import { getDefaultBuiltInSetIds } from "../../src/game/content/sets/catalog";
import { loadBuiltInContentSets } from "../../src/game/content/loader";
import { getDefaultRuntimeProfile } from "../../src/game/content/registry";
import type { Faction } from "../../src/game/model/enums";
import { createInitialGameState, type GameState } from "../../src/game/model/state";
import { createSeededRandom } from "../../src/game/random/seeded";

let initializedKey: string | null = null;

export type MatchStateBundle = {
  builtInSetIds: string[];
  runtimeProfileId: string | null;
  mapId: string;
  state: GameState;
};

export function initializeServerContent(builtInSetIds = getDefaultBuiltInSetIds()): string[] {
  const key = builtInSetIds.join(",");
  if (initializedKey === key) {
    return [...builtInSetIds];
  }
  loadBuiltInContentSets(builtInSetIds, { reset: true });
  initializedKey = key;
  return [...builtInSetIds];
}

export function createMatchState(options: {
  matchId: string;
  seed: number;
  factions: { player_1: Faction; player_2: Faction };
  builtInSetIds?: string[];
}): MatchStateBundle {
  const builtInSetIds = initializeServerContent(options.builtInSetIds);
  const runtimeProfile = getDefaultRuntimeProfile();
  const state = createInitialGameState({
    runtimeProfileId: runtimeProfile?.id ?? undefined,
    matchId: options.matchId,
    randomSource: createSeededRandom(options.seed),
    factions: options.factions,
  });
  return {
    builtInSetIds,
    runtimeProfileId: runtimeProfile?.id ?? null,
    mapId: state.map.id,
    state,
  };
}

