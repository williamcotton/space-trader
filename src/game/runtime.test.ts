import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "./content/maps/frontierBelt";
import { createInitialGameState } from "./model/state";
import { getBoardClickCommand } from "./runtime";

function setupState() {
  return createInitialGameState({ map: FRONTIER_BELT_MAP });
}

describe("getBoardClickCommand", () => {
  it("selects a friendly unit when clicked", () => {
    const state = setupState();

    expect(
      getBoardClickCommand(state, {
        q: state.entities.unit_player_1_scout.coord.q,
        r: state.entities.unit_player_1_scout.coord.r,
      })
    ).toEqual({
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: "unit_player_1_scout",
    });
  });

  it("issues a move command when a selected unit clicks an empty hex during tactical", () => {
    const state = setupState();
    state.phase = "tactical";
    state.selectedEntityId = "unit_player_1_scout";

    expect(
      getBoardClickCommand(state, {
        q: -2,
        r: 0,
      })
    ).toEqual({
      type: "MOVE_UNIT",
      playerId: "player_1",
      entityId: "unit_player_1_scout",
      to: { q: -2, r: 0 },
    });
  });

  it("clears selection on empty-hex click outside tactical", () => {
    const state = setupState();
    state.phase = "main";
    state.selectedEntityId = "unit_player_1_scout";

    expect(
      getBoardClickCommand(state, {
        q: -2,
        r: 0,
      })
    ).toEqual({
      type: "CLEAR_SELECTION",
      playerId: "player_1",
      reason: "clicked_empty_or_enemy_tile",
    });
  });
});
