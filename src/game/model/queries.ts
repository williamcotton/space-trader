import type { PlayerId } from "./ids";
import type { EntityState, GameState, HexCoord, UnitEntity } from "./state";
import { areSameHex, isWithinMapBounds } from "./hex";
import type { CardCost } from "../content/cards/catalog";

export const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function getPlayerBase(state: GameState, playerId: PlayerId) {
  const baseId = state.players[playerId].baseEntityId;
  const base = state.entities[baseId];
  if (!base || base.kind !== "base") {
    return null;
  }
  return base;
}

export function hasEntityAtCoord(state: GameState, coord: HexCoord, ignoreEntityId?: string): boolean {
  return Object.values(state.entities).some((entity) => {
    if (ignoreEntityId && entity.id === ignoreEntityId) {
      return false;
    }
    return areSameHex(entity.coord, coord);
  });
}

export function findEntityAtHex(state: GameState, coord: HexCoord): EntityState | undefined {
  return Object.values(state.entities).find((entity) => areSameHex(entity.coord, coord));
}

export function getFirstOpenBaseAdjacentTile(state: GameState, playerId: PlayerId): HexCoord | null {
  const base = getPlayerBase(state, playerId);
  if (!base) {
    return null;
  }

  const candidates = HEX_DIRECTIONS.map((dir) => ({ q: base.coord.q + dir.q, r: base.coord.r + dir.r }));
  for (const coord of candidates) {
    if (!isWithinMapBounds(coord, state.map)) {
      continue;
    }
    if (!hasEntityAtCoord(state, coord)) {
      return coord;
    }
  }

  return null;
}

export function canAffordCost(pool: Partial<Record<"credits" | "alloy" | "flux" | "biomass", number>>, cost: CardCost): boolean {
  return (
    (pool.credits ?? 0) >= (cost.credits ?? 0) &&
    (pool.alloy ?? 0) >= (cost.alloy ?? 0) &&
    (pool.flux ?? 0) >= (cost.flux ?? 0) &&
    (pool.biomass ?? 0) >= (cost.biomass ?? 0)
  );
}

export function canAffordCardCost(state: GameState, playerId: PlayerId, cost: CardCost): boolean {
  return canAffordCost(state.players[playerId].resources, cost);
}

export function getPlayerUnits(state: GameState, playerId: PlayerId): UnitEntity[] {
  return Object.values(state.entities)
    .filter((entity): entity is UnitEntity => entity.kind === "unit" && entity.ownerId === playerId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getEnemyEntities(state: GameState, playerId: PlayerId): EntityState[] {
  return Object.values(state.entities)
    .filter((entity) => entity.ownerId !== playerId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getSelectedUnit(state: GameState): UnitEntity | null {
  if (!state.selectedEntityId) return null;
  const selected = state.entities[state.selectedEntityId];
  if (!selected || selected.kind !== "unit") return null;
  return selected;
}

export function getEntityAtCoord(state: GameState, coord: HexCoord, ignoreEntityId?: string): EntityState | null {
  return (
    Object.values(state.entities).find((entity) => {
      if (ignoreEntityId && entity.id === ignoreEntityId) return false;
      return areSameHex(entity.coord, coord);
    }) ?? null
  );
}
