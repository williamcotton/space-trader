import { describe, expect, it } from "vitest";
import { hexKey } from "./model/hex";
import { requireMapDefinition } from "./content/maps/catalog";
import { createInitialGameState } from "./model/state";
import {
  buildSpatialIndex,
  spatialHasEntity,
  spatialGetEntity,
  buildMoveRangeOverlay,
  rebuildDerivedState,
  createEmptyDerivedState,
} from "./derived";

function setupState() {
  return createInitialGameState({ map: requireMapDefinition("frontier_belt") });
}

describe("hexKey", () => {
  it("produces unique keys for different coordinates", () => {
    expect(hexKey({ q: 1, r: 2 })).toBe("1,2");
    expect(hexKey({ q: -3, r: 0 })).toBe("-3,0");
    expect(hexKey({ q: 0, r: 0 })).toBe("0,0");
  });

  it("produces different keys for different coords", () => {
    expect(hexKey({ q: 1, r: 2 })).not.toBe(hexKey({ q: 2, r: 1 }));
  });
});

describe("buildSpatialIndex", () => {
  it("maps entities to their coordinate keys", () => {
    const state = setupState();
    const index = buildSpatialIndex(state.entities);

    const base1 = state.entities.base_player_1;
    const key = hexKey(base1.coord);
    expect(index.get(key)).toContain("base_player_1");
  });

  it("groups multiple entities at the same coord", () => {
    const state = setupState();
    // Force two entities onto the same hex for testing
    const scout = state.entities.unit_player_1_scout;
    const harvester = state.entities.unit_player_1_harvester;
    harvester.coord = { ...scout.coord };

    const index = buildSpatialIndex(state.entities);
    const key = hexKey(scout.coord);
    const ids = index.get(key)!;
    expect(ids).toContain("unit_player_1_scout");
    expect(ids).toContain("unit_player_1_harvester");
  });
});

describe("spatialHasEntity", () => {
  it("returns true when an entity exists at coord", () => {
    const state = setupState();
    const index = buildSpatialIndex(state.entities);
    const base1 = state.entities.base_player_1;
    expect(spatialHasEntity(index, base1.coord)).toBe(true);
  });

  it("returns false for an empty coord", () => {
    const state = setupState();
    const index = buildSpatialIndex(state.entities);
    expect(spatialHasEntity(index, { q: 99, r: 99 })).toBe(false);
  });

  it("ignores a specified entity id", () => {
    const state = setupState();
    const index = buildSpatialIndex(state.entities);
    const scout = state.entities.unit_player_1_scout;
    // The scout is the only entity at its coord, so ignoring it should return false
    expect(spatialHasEntity(index, scout.coord, scout.id)).toBe(false);
  });

  it("returns true when ignoring one entity but another exists at same coord", () => {
    const state = setupState();
    const scout = state.entities.unit_player_1_scout;
    const harvester = state.entities.unit_player_1_harvester;
    harvester.coord = { ...scout.coord };

    const index = buildSpatialIndex(state.entities);
    expect(spatialHasEntity(index, scout.coord, scout.id)).toBe(true);
  });
});

describe("spatialGetEntity", () => {
  it("returns the entity at a coord", () => {
    const state = setupState();
    const index = buildSpatialIndex(state.entities);
    const base1 = state.entities.base_player_1;
    const result = spatialGetEntity(index, state.entities, base1.coord);
    expect(result).toBe(base1);
  });

  it("returns null for an empty coord", () => {
    const state = setupState();
    const index = buildSpatialIndex(state.entities);
    expect(spatialGetEntity(index, state.entities, { q: 99, r: 99 })).toBeNull();
  });

  it("skips the ignored entity and returns the next", () => {
    const state = setupState();
    const scout = state.entities.unit_player_1_scout;
    const harvester = state.entities.unit_player_1_harvester;
    harvester.coord = { ...scout.coord };

    const index = buildSpatialIndex(state.entities);
    const result = spatialGetEntity(index, state.entities, scout.coord, scout.id);
    expect(result).toBe(harvester);
  });
});

describe("buildMoveRangeOverlay", () => {
  it("returns empty when no unit is selected", () => {
    const state = setupState();
    state.selectedEntityId = null;
    const index = buildSpatialIndex(state.entities);
    const cells = buildMoveRangeOverlay(state, index);
    expect(cells).toEqual([]);
  });

  it("returns empty when selected entity is not active player's unit", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.selectedEntityId = "unit_player_2_scout";
    const index = buildSpatialIndex(state.entities);
    const cells = buildMoveRangeOverlay(state, index);
    expect(cells).toEqual([]);
  });

  it("returns reachable cells for a selected unit", () => {
    const state = setupState();
    state.phase = "tactical";
    state.selectedEntityId = "unit_player_1_scout";
    const scout = state.entities.unit_player_1_scout;
    if (scout.kind !== "unit") throw new Error("expected unit");
    scout.movesRemaining = 2;

    const index = buildSpatialIndex(state.entities);
    const cells = buildMoveRangeOverlay(state, index);

    expect(cells.length).toBeGreaterThan(0);
    // All cells should be within move range
    for (const cell of cells) {
      const dq = cell.coord.q - scout.coord.q;
      const dr = cell.coord.r - scout.coord.r;
      const ds = -dq - dr;
      const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThanOrEqual(2);
    }
  });

  it("marks occupied cells correctly", () => {
    const state = setupState();
    state.selectedEntityId = "unit_player_1_scout";
    const scout = state.entities.unit_player_1_scout;
    if (scout.kind !== "unit") throw new Error("expected unit");
    scout.movesRemaining = 10; // Large range to include base

    const index = buildSpatialIndex(state.entities);
    const cells = buildMoveRangeOverlay(state, index);

    // The base_player_1 coord should be occupied
    const base = state.entities.base_player_1;
    const baseCell = cells.find((c) => c.coord.q === base.coord.q && c.coord.r === base.coord.r);
    expect(baseCell).toBeDefined();
    expect(baseCell!.occupied).toBe(true);
  });
});

describe("rebuildDerivedState", () => {
  it("creates a derived state with correct version", () => {
    const state = setupState();
    const derived = rebuildDerivedState(state, 42);
    expect(derived.sourceVersion).toBe(42);
    expect(derived.spatialIndex.size).toBeGreaterThan(0);
    expect(derived.effectiveStats.size).toBeGreaterThan(0);
    expect(derived.effectiveKeywords.size).toBeGreaterThan(0);
  });
});

describe("createEmptyDerivedState", () => {
  it("creates an empty derived state", () => {
    const derived = createEmptyDerivedState();
    expect(derived.sourceVersion).toBe(-1);
    expect(derived.spatialIndex.size).toBe(0);
    expect(derived.moveRangeOverlay).toEqual([]);
    expect(derived.effectiveStats.size).toBe(0);
    expect(derived.effectiveKeywords.size).toBe(0);
  });
});
