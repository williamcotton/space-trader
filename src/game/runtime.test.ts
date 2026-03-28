import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "./content/maps/frontierBelt";
import { createInitialGameState } from "./model/state";
import { GameRuntime, getBoardClickCommand } from "./runtime";

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

describe("GameRuntime", () => {
  it("queues a match intro animation on initial load", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: FRONTIER_BELT_MAP }));

    expect(runtime.getAnimations().some((animation) => animation.kind === "match_intro")).toBe(true);
  });

  it("adds test resources to a chosen player", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: FRONTIER_BELT_MAP }));
    const before = { ...runtime.state.players.player_1.resources };

    runtime.debugAddTestResources("player_1");

    expect(runtime.state.players.player_1.resources).toEqual({
      credits: before.credits + 100,
      alloy: before.alloy + 100,
      flux: before.flux + 100,
      biomass: before.biomass + 100,
    });
  });

  it("kills the selected test unit for the requested player", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: FRONTIER_BELT_MAP }));
    runtime.state.selectedEntityId = "unit_player_1_harvester";

    runtime.debugKillTestUnit("player_1");

    expect(runtime.state.entities.unit_player_1_harvester).toBeUndefined();
    expect(runtime.state.selectedEntityId).toBeNull();
  });

  it("declares a test winner and queues a victory animation", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: FRONTIER_BELT_MAP }));

    runtime.debugWinTestGame("player_2");

    expect(runtime.state.winner).toBe("player_2");
    expect(runtime.getAnimations().some((animation) => animation.kind === "victory_fanfare" && animation.playerId === "player_2")).toBe(true);
  });
});
