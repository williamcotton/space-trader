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
});
