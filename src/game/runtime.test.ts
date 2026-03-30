import { afterEach, describe, expect, it, vi } from "vitest";
import { requireMapDefinition } from "./content/maps/catalog";
import { axialToPixel } from "./model/hex";
import { createInitialGameState } from "./model/state";
import { createConfiguredRuntime, GameRuntime, getBoardClickCommand } from "./runtime";
import { getHexMetrics } from "./render/layout";
import { TEST_EXPANSION_SET } from "../test/testExpansion";

function setupState() {
  return createInitialGameState({ map: requireMapDefinition("frontier_belt") });
}

afterEach(() => {
  vi.useRealTimers();
});

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
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));

    expect(runtime.getAnimations().some((animation) => animation.kind === "match_intro")).toBe(true);
  });

  it("adds test resources to a chosen player", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
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
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    runtime.state.selectedEntityId = "unit_player_1_harvester";

    runtime.debugKillTestUnit("player_1");

    expect(runtime.state.entities.unit_player_1_harvester).toBeUndefined();
    expect(runtime.state.selectedEntityId).toBeNull();
  });

  it("declares a test winner and queues a victory animation", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));

    runtime.debugWinTestGame("player_2");

    expect(runtime.state.winner).toBe("player_2");
    expect(runtime.getAnimations().some((animation) => animation.kind === "victory_fanfare" && animation.playerId === "player_2")).toBe(true);
  });

  it("tracks hover as transient runtime state without bumping the main state version", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    runtime.setViewport(1024, 768);
    const hoverTarget = runtime.state.entities.unit_player_1_scout.coord;
    const metrics = getHexMetrics({ width: 1024, height: 768 }, runtime.state.map);
    const point = axialToPixel(hoverTarget, metrics.origin, metrics.size);
    const stateVersionBefore = runtime.getStateVersion();
    const transientVersionBefore = runtime.getTransientVersion();

    runtime.setHoveredHexFromScreenPoint(point.x, point.y);

    expect(runtime.getHoveredHex()).toEqual(hoverTarget);
    expect(runtime.getStateVersion()).toBe(stateVersionBefore);
    expect(runtime.getTransientVersion()).toBeGreaterThan(transientVersionBefore);
  });

  it("can create a runtime from an explicit content bundle", () => {
    const runtime = createConfiguredRuntime({
      extraSets: [TEST_EXPANSION_SET],
      runtimeProfileId: "test_expansion_profile",
      factions: {
        player_1: "crystal_clan",
        player_2: "flux_collective",
      },
    });

    expect(runtime.state.map.id).toBe("test_expansion_frontier");
    expect(runtime.state.players.player_1.faction).toBe("crystal_clan");
    expect(runtime.state.players.player_2.faction).toBe("flux_collective");
    expect(runtime.state.matchId.startsWith("match_test_expansion_")).toBe(true);
  });

  it("runs autoflow from scheduled automation without stepping the render loop", async () => {
    vi.useFakeTimers();
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    state.phase = "main";
    state.priorityPlayerId = "player_1";
    state.activePlayerId = "player_1";
    state.zones.player_1.hand = [];
    state.players.player_1.handSize = 0;

    const runtime = new GameRuntime(state);
    await vi.runOnlyPendingTimersAsync();

    expect(runtime.state.phase).toBe("tactical");
  });

  it("runs bot autoplay from scheduled automation without stepping the render loop", async () => {
    vi.useFakeTimers();
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    state.phase = "start";
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";

    const runtime = new GameRuntime(state);
    runtime.replaceBotDecisionSystem(() => ({
      type: "END_PHASE",
      playerId: "player_2",
    }));

    await vi.runOnlyPendingTimersAsync();

    expect(runtime.state.phase).toBe("economy");
    expect(runtime.state.activePlayerId).toBe("player_2");
  });
});
