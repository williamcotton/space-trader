import type { MapState } from "../../model/state";
import { getRegisteredMap, getRegisteredMaps } from "../registry";

export function getMapDefinition(mapId: string): MapState | undefined {
  return getRegisteredMap(mapId);
}

export function requireMapDefinition(mapId: string): MapState {
  const map = getMapDefinition(mapId);
  if (!map) {
    throw new Error(`Unknown map id ${mapId}.`);
  }
  return map;
}

export function getMapCatalog(): Record<string, MapState> {
  return getRegisteredMaps();
}
