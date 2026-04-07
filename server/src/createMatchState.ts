import { getDefaultBuiltInSetIds } from "../../src/game/content/sets/catalog";
import { loadBuiltInContentSets } from "../../src/game/content/loader";
import { getDefaultRuntimeProfile, getRegisteredRuntimeProfile } from "../../src/game/content/registry";
import type { Faction } from "../../src/game/model/enums";
import type { PlayerId } from "../../src/game/model/ids";
import { createInitialGameState, type GameState } from "../../src/game/model/state";
import { createSeededRandom } from "../../src/game/random/seeded";
import { ONLINE_MATCH_FORMATS, type OnlineMatchFormat } from "../../src/network/protocol";

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
  format?: OnlineMatchFormat;
  playerOrder?: PlayerId[];
  factions: Record<PlayerId, Faction>;
  builtInSetIds?: string[];
}): MatchStateBundle {
  const builtInSetIds = initializeServerContent(options.builtInSetIds);
  const runtimeProfileId = options.format ? ONLINE_MATCH_FORMATS[options.format].runtimeProfileId : undefined;
  const runtimeProfile = runtimeProfileId ? getRegisteredRuntimeProfile(runtimeProfileId) : getDefaultRuntimeProfile();
  if (!runtimeProfile) {
    throw new Error(`Unable to resolve runtime profile for match format ${options.format ?? "default"}.`);
  }
  const state = createInitialGameState({
    runtimeProfileId: runtimeProfile?.id ?? undefined,
    matchId: options.matchId,
    randomSource: createSeededRandom(options.seed),
    playerOrder: options.playerOrder,
    factions: options.factions,
  });
  return {
    builtInSetIds,
    runtimeProfileId: runtimeProfile?.id ?? null,
    mapId: state.map.id,
    state,
  };
}
