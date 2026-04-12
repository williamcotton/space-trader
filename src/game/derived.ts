import type { EntityId } from "./model/ids";
import type { EntityState, GameState, HexCoord } from "./model/state";
import { getSelectedUnit } from "./model/queries";
import { getMapAxialBounds, hexDistance, hexKey, isWithinMapBounds } from "./model/hex";
import { buildContinuousEffectSnapshot, type EffectiveUnitStats } from "./systems/effectPipeline";

export type MoveRangeCell = { coord: HexCoord; occupied: boolean };
export type SpatialIndex = Map<string, EntityId[]>;

export type DerivedState = {
  sourceVersion: number;
  spatialIndex: SpatialIndex;
  moveRangeOverlay: MoveRangeCell[];
  effectiveStats: Map<EntityId, EffectiveUnitStats>;
  effectiveKeywords: Map<EntityId, string[]>;
};

export function createEmptyDerivedState(): DerivedState {
  return {
    sourceVersion: -1,
    spatialIndex: new Map(),
    moveRangeOverlay: [],
    effectiveStats: new Map(),
    effectiveKeywords: new Map(),
  };
}

export function buildSpatialIndex(entities: Record<EntityId, EntityState>): SpatialIndex {
  const index: SpatialIndex = new Map();
  for (const entity of Object.values(entities)) {
    const key = hexKey(entity.coord);
    const existing = index.get(key);
    if (existing) {
      existing.push(entity.id);
    } else {
      index.set(key, [entity.id]);
    }
  }
  return index;
}

export function spatialHasEntity(index: SpatialIndex, coord: HexCoord, ignoreEntityId?: string): boolean {
  const ids = index.get(hexKey(coord));
  if (!ids || ids.length === 0) return false;
  if (!ignoreEntityId) return true;
  return ids.some((id) => id !== ignoreEntityId);
}

export function spatialGetEntity(
  index: SpatialIndex,
  entities: Record<EntityId, EntityState>,
  coord: HexCoord,
  ignoreEntityId?: string
): EntityState | null {
  const ids = index.get(hexKey(coord));
  if (!ids) return null;
  for (const id of ids) {
    if (ignoreEntityId && id === ignoreEntityId) continue;
    const entity = entities[id];
    if (entity) return entity;
  }
  return null;
}

export function buildMoveRangeOverlay(state: GameState, spatialIndex: SpatialIndex): MoveRangeCell[] {
  const selected = getSelectedUnit(state);
  if (!selected || selected.ownerId !== state.activePlayerId) {
    return [];
  }

  const cells: MoveRangeCell[] = [];
  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  for (let r = rMin; r <= rMax; r += 1) {
    for (let q = qMin; q <= qMax; q += 1) {
      const coord = { q, r };
      if (!isWithinMapBounds(coord, state.map)) continue;

      const distance = hexDistance(selected.coord, coord);
      if (distance === 0 || distance > selected.movesRemaining) continue;

      const occupied = spatialHasEntity(spatialIndex, coord, selected.id);
      cells.push({ coord, occupied });
    }
  }
  return cells;
}

export function rebuildDerivedState(state: GameState, version: number): DerivedState {
  const spatialIndex = buildSpatialIndex(state.entities);
  const moveRangeOverlay = buildMoveRangeOverlay(state, spatialIndex);
  const continuousEffectSnapshot = buildContinuousEffectSnapshot(state);
  return {
    sourceVersion: version,
    spatialIndex,
    moveRangeOverlay,
    effectiveStats: continuousEffectSnapshot.stats,
    effectiveKeywords: continuousEffectSnapshot.keywords,
  };
}
