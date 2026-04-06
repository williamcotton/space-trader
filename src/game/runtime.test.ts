import { afterEach, describe, expect, it, vi } from "vitest";
import { requireMapDefinition } from "./content/maps/catalog";
import { axialToPixel } from "./model/hex";
import { createInitialGameState } from "./model/state";
import { createConfiguredRuntime, GameRuntime, getBoardClickCommand } from "./runtime";
import { getHexMetrics } from "./render/layout";
import { TEST_EXPANSION_SET } from "../test/testExpansion";
import { MULTIPLAYER_PROTOCOL_VERSION, type MatchStartPayload } from "../network/protocol";

function setupState() {
  return createInitialGameState({ map: requireMapDefinition("frontier_belt") });
}

function createMatchStartPayload(overrides?: Partial<MatchStartPayload>): MatchStartPayload {
  return {
    matchId: "net_test_match",
    seed: 12345,
    localPlayerId: "player_1",
    factions: {
      player_1: "alloy_clan",
      player_2: "flux_collective",
    },
    mapId: "frontier_belt",
    runtimeProfileId: "alpha_default",
    builtInSetIds: ["alpha"],
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    ...overrides,
  };
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

  it("keeps the selected resource unit selected when its controlled node is clicked during tactical", () => {
    const state = setupState();
    state.phase = "tactical";
    state.selectedEntityId = "unit_player_1_harvester";
    const harvester = state.entities.unit_player_1_harvester;
    const node = state.map.resourceNodes[0];
    harvester.coord = { ...node.coord };
    node.controlledBy = "player_1";

    expect(getBoardClickCommand(state, { ...node.coord })).toEqual({
      type: "CLEAR_SELECTION",
      playerId: "player_1",
      reason: "clicked_selected_unit",
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

  it("only requires continuous rendering while canvas animations are active", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    runtime.replaceSystems(() => undefined, () => undefined);

    expect(runtime.hasActiveAnimations()).toBe(true);

    runtime.step({} as CanvasRenderingContext2D, 5);

    expect(runtime.hasActiveAnimations()).toBe(false);
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

  it("creates deterministic deck order when a seed is supplied", () => {
    const first = createConfiguredRuntime({
      seed: 123,
      matchId: "seeded_a",
    });
    const second = createConfiguredRuntime({
      seed: 123,
      matchId: "seeded_b",
    });

    expect(first.state.zones.player_1.deck.map((card) => card.cardId)).toEqual(
      second.state.zones.player_1.deck.map((card) => card.cardId)
    );
    expect(first.state.zones.player_2.deck.map((card) => card.cardId)).toEqual(
      second.state.zones.player_2.deck.map((card) => card.cardId)
    );
  });

  it("submits commands instead of applying them locally during a network match", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    const submitted: string[] = [];
    runtime.startNetworkMatch(createMatchStartPayload(), (command) => {
      submitted.push(command.type);
    }, { showIntroAnimation: false });

    const phaseBefore = runtime.state.phase;
    const result = runtime.dispatch({
      type: "END_PHASE",
      playerId: "player_1",
    });

    expect(result.ok).toBe(true);
    expect(submitted).toEqual(["END_PHASE"]);
    expect(runtime.state.phase).toBe(phaseBefore);
  });

  it("routes end phase through the network-aware action helper", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    const submitted: string[] = [];
    runtime.startNetworkMatch(createMatchStartPayload(), (command) => {
      submitted.push(command.type);
    }, { showIntroAnimation: false });

    runtime.endPhase();

    expect(submitted).toEqual(["END_PHASE"]);
  });

  it("does not allow ending the phase for the remote player in a network match", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    const submitted: string[] = [];
    runtime.startNetworkMatch(createMatchStartPayload({
      localPlayerId: "player_2",
    }), (command) => {
      submitted.push(command.type);
    }, { showIntroAnimation: false });

    runtime.endPhase();

    expect(submitted).toEqual([]);
  });

  it("blocks local network actions while awaiting authoritative confirmation", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    const submitted: string[] = [];
    runtime.startNetworkMatch(createMatchStartPayload(), (command) => {
      submitted.push(command.type);
    }, {
      showIntroAnimation: false,
      canSubmitCommand: () => false,
      getBlockedReason: () => "Waiting for the server to confirm your previous action.",
    });

    const result = runtime.endPhase();

    expect(result?.ok).toBe(false);
    expect(result && !result.ok ? result.reason : null).toBe("Waiting for the server to confirm your previous action.");
    expect(submitted).toEqual([]);
  });

  it("submits unit selection for the local player during a networked tactical turn", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    const submitted: string[] = [];
    runtime.startNetworkMatch(createMatchStartPayload(), (command) => {
      submitted.push(command.type);
    }, { showIntroAnimation: false });
    runtime.state.phase = "tactical";
    runtime.state.activePlayerId = "player_1";
    runtime.state.priorityPlayerId = "player_1";
    runtime.setViewport(1024, 768);
    const target = runtime.state.entities.unit_player_1_scout;
    const metrics = getHexMetrics({ width: 1024, height: 768 }, runtime.state.map);
    const point = axialToPixel(target.coord, metrics.origin, metrics.size);

    runtime.selectUnitFromScreenPoint(point.x, point.y);

    expect(submitted).toEqual(["SELECT_ENTITY"]);
  });

  it("submits unit selection for player 2 during a networked tactical turn", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    const submitted: string[] = [];
    runtime.startNetworkMatch(createMatchStartPayload({
      localPlayerId: "player_2",
      factions: {
        player_1: "alloy_clan",
        player_2: "flux_collective",
      },
    }), (command) => {
      submitted.push(command.type);
    }, { showIntroAnimation: false });
    runtime.state.phase = "tactical";
    runtime.state.activePlayerId = "player_2";
    runtime.state.priorityPlayerId = "player_2";
    runtime.setViewport(1024, 768);
    const target = runtime.state.entities.unit_player_2_scout;
    const metrics = getHexMetrics({ width: 1024, height: 768 }, runtime.state.map);
    const point = axialToPixel(target.coord, metrics.origin, metrics.size);

    runtime.selectUnitFromScreenPoint(point.x, point.y);

    expect(submitted).toEqual(["SELECT_ENTITY"]);
  });

  it("reasserts selection instead of toggling clear on repeated friendly clicks in network matches", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    const submitted: string[] = [];
    runtime.startNetworkMatch(createMatchStartPayload({
      localPlayerId: "player_2",
    }), (command) => {
      submitted.push(command.type);
    }, { showIntroAnimation: false });
    runtime.state.phase = "start";
    runtime.state.activePlayerId = "player_2";
    runtime.state.priorityPlayerId = "player_2";
    runtime.state.selectedEntityId = "unit_player_2_scout";
    runtime.setViewport(1024, 768);
    const target = runtime.state.entities.unit_player_2_scout;
    const metrics = getHexMetrics({ width: 1024, height: 768 }, runtime.state.map);
    const point = axialToPixel(target.coord, metrics.origin, metrics.size);

    runtime.selectUnitFromScreenPoint(point.x, point.y);

    expect(submitted).toEqual(["SELECT_ENTITY"]);
  });

  it("reselects the unit instead of harvesting on repeated click during a networked tactical turn", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    const submitted: string[] = [];
    runtime.startNetworkMatch(createMatchStartPayload(), (command) => {
      submitted.push(command.type);
    }, { showIntroAnimation: false });
    runtime.state.phase = "tactical";
    runtime.state.activePlayerId = "player_1";
    runtime.state.priorityPlayerId = "player_1";
    const harvester = runtime.state.entities.unit_player_1_harvester;
    const node = runtime.state.map.resourceNodes[0];
    harvester.coord = { ...node.coord };
    node.controlledBy = "player_1";
    runtime.state.selectedEntityId = harvester.id;
    runtime.setViewport(1024, 768);
    const metrics = getHexMetrics({ width: 1024, height: 768 }, runtime.state.map);
    const point = axialToPixel(harvester.coord, metrics.origin, metrics.size);

    runtime.selectUnitFromScreenPoint(point.x, point.y);

    expect(submitted).toEqual(["SELECT_ENTITY"]);
  });

  it("submits harvest for the local player when requested explicitly during a networked tactical turn", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    const submitted: string[] = [];
    runtime.startNetworkMatch(createMatchStartPayload(), (command) => {
      submitted.push(command.type);
    }, { showIntroAnimation: false });
    runtime.state.phase = "tactical";
    runtime.state.activePlayerId = "player_1";
    runtime.state.priorityPlayerId = "player_1";
    const harvester = runtime.state.entities.unit_player_1_harvester;
    const node = runtime.state.map.resourceNodes[0];
    harvester.coord = { ...node.coord };
    node.controlledBy = "player_1";
    runtime.state.selectedEntityId = harvester.id;

    runtime.harvestSelectedUnit();

    expect(submitted).toEqual(["HARVEST_NODE"]);
  });

  it("begins attack targeting and attacks the clicked enemy locally", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    runtime.state.phase = "tactical";
    runtime.state.activePlayerId = "player_1";
    runtime.state.priorityPlayerId = "player_1";
    const attacker = runtime.state.entities.unit_player_1_scout;
    const target = runtime.state.entities.unit_player_2_harvester;
    if (attacker.kind !== "unit" || target.kind !== "unit") {
      throw new Error("Expected unit attacker and target for attack targeting test.");
    }
    attacker.coord = { q: 0, r: 0 };
    attacker.hasSummoningSickness = false;
    attacker.attacksRemaining = 1;
    target.coord = { q: 0, r: 1 };
    runtime.state.selectedEntityId = attacker.id;
    runtime.setViewport(1024, 768);
    const metrics = getHexMetrics({ width: 1024, height: 768 }, runtime.state.map);
    const point = axialToPixel(target.coord, metrics.origin, metrics.size);
    const hpBefore = target.hp;

    expect(runtime.beginAttackTargetingForSelectedUnit()).toBe(true);
    expect(runtime.getPendingAttackTargeting()).not.toBeNull();

    runtime.selectUnitFromScreenPoint(point.x, point.y);

    expect(runtime.getPendingAttackTargeting()).toBeNull();
    expect(runtime.state.entities.unit_player_2_harvester?.hp).toBeLessThan(hpBefore);
  });

  it("cancels attack targeting when an empty hex is clicked", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    runtime.state.phase = "tactical";
    runtime.state.activePlayerId = "player_1";
    runtime.state.priorityPlayerId = "player_1";
    const attacker = runtime.state.entities.unit_player_1_scout;
    const target = runtime.state.entities.unit_player_2_harvester;
    if (attacker.kind !== "unit") {
      throw new Error("Expected unit attacker for attack cancel test.");
    }
    attacker.coord = { q: 0, r: 0 };
    attacker.hasSummoningSickness = false;
    attacker.attacksRemaining = 1;
    if (target.kind !== "unit") {
      throw new Error("Expected enemy unit for attack cancel test.");
    }
    target.coord = { q: 0, r: 1 };
    runtime.state.selectedEntityId = attacker.id;
    runtime.setViewport(1024, 768);
    const metrics = getHexMetrics({ width: 1024, height: 768 }, runtime.state.map);
    const emptyPoint = axialToPixel({ q: -2, r: 0 }, metrics.origin, metrics.size);

    expect(runtime.beginAttackTargetingForSelectedUnit()).toBe(true);

    runtime.selectUnitFromScreenPoint(emptyPoint.x, emptyPoint.y);

    expect(runtime.getPendingAttackTargeting()).toBeNull();
    expect(runtime.state.selectedEntityId).toBe(attacker.id);
  });

  it("attacks the first target in range for the selected unit locally", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    runtime.state.phase = "tactical";
    runtime.state.activePlayerId = "player_1";
    runtime.state.priorityPlayerId = "player_1";
    const attacker = runtime.state.entities.unit_player_1_scout;
    const target = runtime.state.entities.unit_player_2_harvester;
    if (attacker.kind !== "unit" || target.kind !== "unit") {
      throw new Error("Expected unit attacker and target for attack shortcut test.");
    }
    attacker.coord = { q: 0, r: 0 };
    attacker.hasSummoningSickness = false;
    attacker.attacksRemaining = 1;
    target.coord = { q: 0, r: 1 };
    runtime.state.selectedEntityId = attacker.id;
    const hpBefore = target.hp;

    const result = runtime.attackSelectedUnitFirstTargetInRange();

    expect(result?.ok).toBe(true);
    expect(runtime.state.entities.unit_player_2_harvester?.hp).toBeLessThan(hpBefore);
  });

  it("submits attack for the local player when requested explicitly during a networked tactical turn", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    const submitted: string[] = [];
    runtime.startNetworkMatch(createMatchStartPayload(), (command) => {
      submitted.push(command.type);
    }, { showIntroAnimation: false });
    runtime.state.phase = "tactical";
    runtime.state.activePlayerId = "player_1";
    runtime.state.priorityPlayerId = "player_1";
    const attacker = runtime.state.entities.unit_player_1_scout;
    const target = runtime.state.entities.unit_player_2_harvester;
    if (attacker.kind !== "unit" || target.kind !== "unit") {
      throw new Error("Expected unit attacker and target for network attack shortcut test.");
    }
    attacker.coord = { q: 0, r: 0 };
    attacker.hasSummoningSickness = false;
    attacker.attacksRemaining = 1;
    target.coord = { q: 0, r: 1 };
    runtime.state.selectedEntityId = attacker.id;

    runtime.attackSelectedUnitFirstTargetInRange();

    expect(submitted).toEqual(["ATTACK_UNIT"]);
  });

  it("queues attack targeting first and only submits attack after target selection in network matches", () => {
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    const submitted: string[] = [];
    runtime.startNetworkMatch(createMatchStartPayload({
      localPlayerId: "player_2",
      factions: {
        player_1: "alloy_clan",
        player_2: "flux_collective",
      },
    }), (command) => {
      submitted.push(command.type);
    }, { showIntroAnimation: false });
    runtime.state.phase = "tactical";
    runtime.state.activePlayerId = "player_2";
    runtime.state.priorityPlayerId = "player_2";
    const attacker = runtime.state.entities.unit_player_2_scout;
    const target = runtime.state.entities.unit_player_1_harvester;
    if (attacker.kind !== "unit" || target.kind !== "unit") {
      throw new Error("Expected unit attacker and target for network attack targeting test.");
    }
    attacker.coord = { q: 0, r: 0 };
    attacker.hasSummoningSickness = false;
    attacker.attacksRemaining = 1;
    target.coord = { q: 0, r: 1 };
    runtime.state.selectedEntityId = attacker.id;
    runtime.setViewport(1024, 768);
    const metrics = getHexMetrics({ width: 1024, height: 768 }, runtime.state.map);
    const point = axialToPixel(target.coord, metrics.origin, metrics.size);

    expect(runtime.beginAttackTargetingForSelectedUnit()).toBe(true);
    expect(submitted).toEqual([]);

    runtime.selectUnitFromScreenPoint(point.x, point.y);

    expect(submitted).toEqual(["ATTACK_UNIT"]);
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

  it("does not run local automation after entering a network match", async () => {
    vi.useFakeTimers();
    const runtime = new GameRuntime(createInitialGameState({ map: requireMapDefinition("frontier_belt") }));
    runtime.startNetworkMatch(createMatchStartPayload(), () => undefined, { showIntroAnimation: false });

    await vi.runOnlyPendingTimersAsync();

    expect(runtime.state.phase).toBe("start");
  });
});
