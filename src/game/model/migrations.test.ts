import { describe, expect, it } from "vitest";
import { requireMapDefinition } from "../content/maps/catalog";
import { getBloomedUnitIdsThisTurn, getLastBloomSourceItemId, getLastBloomedUnitIds } from "../content/sets/base/mechanics/bloom";
import { RELAY_KEYWORD } from "../content/sets/base/mechanics/keywordIds";
import { getSalvageTriggersThisTurn } from "../content/sets/base/mechanics/salvage";
import { getTacticsCastThisTurn } from "../content/sets/base/mechanics/surge";
import { migrateRuntimeState } from "./migrations";
import { createInitialGameState } from "./state";

describe("migrateRuntimeState", () => {
  it("merges source-card keywords into existing unit keyword arrays", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
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

  it("hydrates missing mechanic namespaces and active modifier arrays", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
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
    Reflect.deleteProperty(state, "mechanicState");
    Reflect.deleteProperty(state.stack[0] as typeof state.stack[number] & { activeModifierIds?: unknown }, "activeModifierIds");

    migrateRuntimeState(state);

    expect(getTacticsCastThisTurn(state, "player_1")).toBe(0);
    expect(getTacticsCastThisTurn(state, "player_2")).toBe(0);
    expect(getBloomedUnitIdsThisTurn(state)).toEqual([]);
    expect(getLastBloomSourceItemId(state)).toBeNull();
    expect(getLastBloomedUnitIds(state)).toEqual([]);
    expect(getSalvageTriggersThisTurn(state, "player_1")).toBe(0);
    expect(getSalvageTriggersThisTurn(state, "player_2")).toBe(0);
    expect(state.stack[0]?.activeModifierIds).toEqual([]);
  });
});
