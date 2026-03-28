import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { RELAY_KEYWORD } from "../systems/keywords";
import { migrateRuntimeState } from "./migrations";
import { createInitialGameState } from "./state";

describe("migrateRuntimeState", () => {
  it("merges source-card keywords into existing unit keyword arrays", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
    const relayCandidate = state.entities.unit_player_2_scout;
    expect(relayCandidate?.kind).toBe("unit");
    if (!relayCandidate || relayCandidate.kind !== "unit") {
      throw new Error("Expected player 2 scout unit.");
    }

    relayCandidate.sourceCardId = "relay_savant_card";
    relayCandidate.keywords = [];

    migrateRuntimeState(state);

    expect(relayCandidate.keywords).toContain(RELAY_KEYWORD);
  });

  it("hydrates missing surge tracking fields", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
    state.stack.push({
      id: "legacy_stack_item",
      label: "Legacy",
      controllerId: "player_1",
      ownerId: "player_1",
      effectId: "draw_and_gain_resources",
      effectMagnitude: 0,
      targetStackItemId: null,
      targetEntityId: null,
      targetHex: null,
      objectKind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
      sourceCardInstanceId: null,
      sourceCardId: "ion_surge_archive",
      sourceCardOwnerId: null,
      pendingUnitEntityId: null,
    });

    // Simulate older serialized state.
    Reflect.deleteProperty(state as typeof state & { tacticsCastThisTurn?: unknown }, "tacticsCastThisTurn");
    Reflect.deleteProperty(state as typeof state & { bloomedUnitIdsThisTurn?: unknown }, "bloomedUnitIdsThisTurn");
    Reflect.deleteProperty(state as typeof state & { lastBloomSourceItemId?: unknown }, "lastBloomSourceItemId");
    Reflect.deleteProperty(state as typeof state & { lastBloomedUnitIds?: unknown }, "lastBloomedUnitIds");
    Reflect.deleteProperty(state.stack[0] as typeof state.stack[number] & { surgeActive?: unknown }, "surgeActive");

    migrateRuntimeState(state);

    expect(state.tacticsCastThisTurn).toEqual({
      player_1: 0,
      player_2: 0,
    });
    expect(state.bloomedUnitIdsThisTurn).toEqual([]);
    expect(state.lastBloomSourceItemId).toBeNull();
    expect(state.lastBloomedUnitIds).toEqual([]);
    expect(state.stack[0]?.surgeActive).toBe(false);
  });
});
