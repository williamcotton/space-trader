import { ensureDefaultContentLoaded, getLoadedContentSetIds, loadConfiguredContentSets, type ContentLoadSelection } from "../content/loader";
import {
  findRegisteredRuntimeProfileForMap,
  getDefaultRuntimeProfile,
  getRegisteredMap,
  getRegisteredMaps,
  getRegisteredRuntimeProfile,
} from "../content/registry";
import type { Faction } from "../model/enums";
import type { PlayerId } from "../model/ids";
import { createInitialGameState, type GameState } from "../model/state";
import { createSeededRandom } from "../random/seeded";

export type RuntimeContentOptions = Omit<ContentLoadSelection, "reset"> & {
  runtimeProfileId?: string;
  mapId?: string;
  factions?: Partial<Record<PlayerId, Faction>>;
  playerOrder?: PlayerId[];
  matchId?: string;
  seed?: number;
};

export type RuntimeStateFromContent = {
  state: GameState;
  runtimeProfileId: string | null;
  loadedSetIds: string[];
};

function createRuntimeMatchId(matchPrefix: string): string {
  return `match_${matchPrefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .padStart(4, "0")}`;
}

function getDefaultRuntimeMap() {
  ensureDefaultContentLoaded();
  const runtimeProfile = getDefaultRuntimeProfile();
  if (runtimeProfile) {
    const runtimeMap = getRegisteredMap(runtimeProfile.defaultMapId);
    if (!runtimeMap) {
      throw new Error(`Missing default runtime map ${runtimeProfile.defaultMapId} for runtime profile ${runtimeProfile.id}.`);
    }
    return runtimeMap;
  }

  const fallbackMap = Object.values(getRegisteredMaps())
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!fallbackMap) {
    throw new Error("Missing registered runtime maps.");
  }
  return fallbackMap;
}

function requireRuntimeMap(mapId: string) {
  const map = getRegisteredMap(mapId);
  if (!map) {
    throw new Error(`Missing registered map ${mapId}.`);
  }
  return map;
}

function resolveRuntimeProfileId(
  selection?: RuntimeContentOptions,
  fallbackRuntimeProfileId?: string | null,
  fallbackMapId?: string
): string | null {
  if (selection?.runtimeProfileId) {
    const explicitProfile = getRegisteredRuntimeProfile(selection.runtimeProfileId);
    if (!explicitProfile) {
      throw new Error(`Missing registered runtime profile ${selection.runtimeProfileId}.`);
    }
    return explicitProfile.id;
  }

  if (selection?.mapId) {
    return findRegisteredRuntimeProfileForMap(selection.mapId)?.id ?? getDefaultRuntimeProfile()?.id ?? null;
  }

  if (fallbackRuntimeProfileId) {
    return getRegisteredRuntimeProfile(fallbackRuntimeProfileId)?.id ?? null;
  }

  if (fallbackMapId) {
    return findRegisteredRuntimeProfileForMap(fallbackMapId)?.id ?? getDefaultRuntimeProfile()?.id ?? null;
  }

  return getDefaultRuntimeProfile()?.id ?? null;
}

export function createRuntimeStateFromContent(
  selection?: RuntimeContentOptions,
  fallbackRuntimeProfileId?: string | null,
  fallbackMapId?: string
): RuntimeStateFromContent {
  loadConfiguredContentSets({
    builtInSetIds: selection?.builtInSetIds,
    extraSets: selection?.extraSets,
    reset: true,
  });

  const runtimeProfileId = resolveRuntimeProfileId(selection, fallbackRuntimeProfileId, fallbackMapId);
  const runtimeProfile = runtimeProfileId ? getRegisteredRuntimeProfile(runtimeProfileId) : null;
  const map =
    selection?.mapId
      ? requireRuntimeMap(selection.mapId)
      : runtimeProfile
        ? requireRuntimeMap(runtimeProfile.defaultMapId)
        : fallbackMapId
          ? requireRuntimeMap(fallbackMapId)
          : getDefaultRuntimeMap();

  const randomSource = typeof selection?.seed === "number"
    ? createSeededRandom(selection.seed)
    : () => Math.random();

  return {
    state: createInitialGameState({
      map,
      runtimeProfileId: runtimeProfile?.id ?? undefined,
      matchId: selection?.matchId ?? createRuntimeMatchId(runtimeProfile?.matchIdPrefix ?? map.id),
      randomSource,
      factions: selection?.factions,
      playerOrder: selection?.playerOrder,
    }),
    runtimeProfileId: runtimeProfile?.id ?? findRegisteredRuntimeProfileForMap(map.id)?.id ?? null,
    loadedSetIds: getLoadedContentSetIds(),
  };
}

export function createDefaultRuntimeState(): GameState {
  return createRuntimeStateFromContent().state;
}
