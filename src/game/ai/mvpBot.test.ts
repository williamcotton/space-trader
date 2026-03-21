import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { hexDistance } from "../model/hex";
import { createInitialGameState } from "../model/state";
import { decideMvpBotCommand } from "./mvpBot";

function setupState() {
  return createInitialGameState({ map: FRONTIER_BELT_MAP });
}

function moveCardFromDeckToHand(state: ReturnType<typeof setupState>, playerId: "player_1" | "player_2", cardId: string): string {
  const deck = state.zones[playerId].deck;
  const index = deck.findIndex((card) => card.cardId === cardId);
  if (index < 0) {
    throw new Error(`Expected ${cardId} in ${playerId} deck.`);
  }
  const [card] = deck.splice(index, 1);
  if (!card) {
    throw new Error(`Failed to move ${cardId} from ${playerId} deck.`);
  }
  state.zones[playerId].hand.push(card);
  return card.instanceId;
}

describe("decideMvpBotCommand", () => {
  it("returns null when bot does not currently have priority", () => {
    const state = setupState();
    state.priorityPlayerId = "player_1";
    state.activePlayerId = "player_2";

    const command = decideMvpBotCommand(state, "player_2");
    expect(command).toBeNull();
  });

  it("casts a legal counter when defending on stack", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_2";
    state.stack.push({
      id: "stack_1_99",
      label: "Orbital Ping",
      controllerId: "player_1",
      ownerId: "player_1",
      effectId: "damage_enemy_base_2",
      effectMagnitude: 2,
      targetStackItemId: null,
      objectKind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
      sourceCardInstanceId: null,
      sourceCardId: null,
      sourceCardOwnerId: null,
      pendingUnitEntityId: null,
    });
    state.players.player_2.resources.credits = 3;
    state.players.player_2.resources.flux = 3;
    const counterCardInstanceId = moveCardFromDeckToHand(state, "player_2", "counter_pulse");

    const command = decideMvpBotCommand(state, "player_2");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_2",
      cardInstanceId: counterCardInstanceId,
      targetStackItemId: "stack_1_99",
    });
  });

  it("plays an affordable unit card during its main phase", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "main";
    state.stack = [];
    state.players.player_2.resources.credits = 5;
    state.players.player_2.resources.flux = 3;
    state.players.player_2.resources.alloy = 3;
    state.players.player_2.resources.biomass = 3;

    const command = decideMvpBotCommand(state, "player_2");
    expect(command?.type).toBe("PLAY_CARD");
    expect(command?.playerId).toBe("player_2");
    if (!command || command.type !== "PLAY_CARD") {
      throw new Error("Expected bot to play a main-phase card.");
    }

    const playedCard = state.zones.player_2.hand.find((card) => card.instanceId === command.cardInstanceId);
    expect(playedCard).toBeDefined();
  });

  it("rebuilds combat presence before playing more economy units when behind on board", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "main";
    state.stack = [];

    delete state.entities.unit_player_2_scout;
    moveCardFromDeckToHand(state, "player_2", "echo_recall");

    state.players.player_2.resources.credits = 3;
    state.players.player_2.resources.flux = 1;
    state.players.player_2.resources.alloy = 0;
    state.players.player_2.resources.biomass = 0;

    const command = decideMvpBotCommand(state, "player_2");
    expect(command?.type).toBe("PLAY_CARD");
    if (!command || command.type !== "PLAY_CARD") {
      throw new Error("Expected bot to rebuild combat board.");
    }

    const playedCard = state.zones.player_2.hand.find((card) => card.instanceId === command.cardInstanceId);
    expect(playedCard?.cardId).toBe("flux_runner_card");
  });

  it("attacks with selected combat unit when target is in range during tactical phase", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "tactical";

    const attacker = state.entities.unit_player_2_scout;
    const target = state.entities.unit_player_1_scout;
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit") {
      throw new Error("Expected units for tactical test.");
    }

    attacker.coord = { q: 0, r: 0 };
    attacker.hasSummoningSickness = false;
    attacker.attacksRemaining = 1;
    target.coord = { q: 1, r: 0 };
    state.selectedEntityId = attacker.id;

    const command = decideMvpBotCommand(state, "player_2");
    expect(command).toEqual({
      type: "ATTACK_UNIT",
      playerId: "player_2",
      attackerId: attacker.id,
      targetId: target.id,
    });
  });

  it("prioritizes resource movement toward resources needed for hand costs", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "tactical";
    state.stack = [];

    state.zones.player_2.hand = [];
    state.zones.player_2.discard = [];
    state.zones.player_2.exile = [];
    moveCardFromDeckToHand(state, "player_2", "alloy_guard_card");

    state.players.player_2.resources.credits = 10;
    state.players.player_2.resources.alloy = 0;
    state.players.player_2.resources.flux = 10;
    state.players.player_2.resources.biomass = 10;

    const harvester = state.entities.unit_player_2_harvester;
    expect(harvester?.kind).toBe("unit");
    if (!harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 2 harvester.");
    }

    harvester.coord = { q: 1, r: -2 };
    harvester.movesRemaining = 2;
    harvester.hasSummoningSickness = false;
    state.selectedEntityId = harvester.id;

    const command = decideMvpBotCommand(state, "player_2");
    expect(command?.type).toBe("MOVE_UNIT");
    if (!command || command.type !== "MOVE_UNIT") {
      throw new Error("Expected resource-focused move command.");
    }

    // The closest node is credits at (2, -2), but alloy demand should pull pathing toward alloy-east.
    expect(command.to).not.toEqual({ q: 2, r: -2 });
    const alloyNodes = [{ q: -3, r: -1 }, { q: 3, r: 1 }];
    const beforeAlloyDistance = Math.min(...alloyNodes.map((coord) => hexDistance(harvester.coord, coord)));
    const afterAlloyDistance = Math.min(...alloyNodes.map((coord) => hexDistance(command.to, coord)));
    expect(afterAlloyDistance).toBeLessThanOrEqual(beforeAlloyDistance);
  });

  it("alloy bot prioritizes nearby ore over xenobog when alloy is the missing cost", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "tactical";
    state.stack = [];

    state.zones.player_1.hand = [];
    state.zones.player_1.discard = [];
    state.zones.player_1.exile = [];
    moveCardFromDeckToHand(state, "player_1", "alloy_guard_card");

    state.players.player_1.resources.credits = 10;
    state.players.player_1.resources.alloy = 0;
    state.players.player_1.resources.flux = 10;
    state.players.player_1.resources.biomass = 10;

    const scout = state.entities.unit_player_1_scout;
    const harvester = state.entities.unit_player_1_harvester;
    expect(scout?.kind).toBe("unit");
    expect(harvester?.kind).toBe("unit");
    if (!scout || scout.kind !== "unit" || !harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 units.");
    }

    scout.coord = { q: 0, r: 0 };
    harvester.coord = { q: -4, r: 1 };
    harvester.movesRemaining = 2;
    harvester.hasSummoningSickness = false;
    state.selectedEntityId = harvester.id;

    const command = decideMvpBotCommand(state, "player_1");
    expect(command?.type).toBe("MOVE_UNIT");
    if (!command || command.type !== "MOVE_UNIT") {
      throw new Error("Expected alloy-focused move command.");
    }

    expect(command.to).toEqual({ q: -3, r: 0 });
  });

  it("alloy bot prioritizes credits before off-faction biomass needs", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "tactical";
    state.stack = [];

    state.zones.player_1.hand = [];
    state.zones.player_1.discard = [];
    state.zones.player_1.exile = [];
    moveCardFromDeckToHand(state, "player_1", "spore_burst");
    moveCardFromDeckToHand(state, "player_1", "expedition_harvester_card");

    state.players.player_1.resources.credits = 0;
    state.players.player_1.resources.alloy = 0;
    state.players.player_1.resources.flux = 0;
    state.players.player_1.resources.biomass = 0;

    const harvester = state.entities.unit_player_1_harvester;
    expect(harvester?.kind).toBe("unit");
    if (!harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 harvester.");
    }

    harvester.coord = { q: -2, r: 1 };
    harvester.movesRemaining = 2;
    harvester.hasSummoningSickness = false;
    state.selectedEntityId = harvester.id;

    const command = decideMvpBotCommand(state, "player_1");
    expect(command?.type).toBe("MOVE_UNIT");
    if (!command || command.type !== "MOVE_UNIT") {
      throw new Error("Expected credits-focused move command.");
    }

    expect(command.to).toEqual({ q: -2, r: 2 });
  });

  it("alloy bot skips harvesting controlled biomass when core economy needs credits", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "tactical";
    state.stack = [];

    const biomassNode = state.map.resourceNodes.find((node) => node.id === "frontier_biomass_northwest");
    if (!biomassNode) {
      throw new Error("Expected northwest biomass node.");
    }
    biomassNode.controlledBy = "player_1";

    state.players.player_1.resources.credits = 0;
    state.players.player_1.resources.alloy = 2;
    state.players.player_1.resources.flux = 0;
    state.players.player_1.resources.biomass = 0;

    const harvester = state.entities.unit_player_1_harvester;
    expect(harvester?.kind).toBe("unit");
    if (!harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 harvester.");
    }

    harvester.coord = { ...biomassNode.coord };
    harvester.movesRemaining = 2;
    harvester.hasSummoningSickness = false;
    harvester.carries = null;
    state.selectedEntityId = harvester.id;

    const command = decideMvpBotCommand(state, "player_1");
    expect(command?.type).toBe("MOVE_UNIT");
    if (!command || command.type !== "MOVE_UNIT") {
      throw new Error("Expected bot to leave biomass node for credits.");
    }

    expect(command.to).toEqual({ q: -2, r: 2 });
  });

  it("holds a contested objective node instead of stepping off before end-phase capture", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "tactical";
    state.stack = [];

    state.zones.player_1.hand = [];
    state.zones.player_1.discard = [];
    state.zones.player_1.exile = [];
    moveCardFromDeckToHand(state, "player_1", "alloy_guard_card");

    const scout = state.entities.unit_player_1_scout;
    const harvester = state.entities.unit_player_1_harvester;
    if (!scout || scout.kind !== "unit" || !harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 units.");
    }

    scout.movesRemaining = 0;
    scout.attacksRemaining = 0;
    scout.hasSummoningSickness = true;
    harvester.coord = { q: -3, r: -1 };
    harvester.movesRemaining = 1;
    harvester.hasSummoningSickness = false;
    harvester.carries = null;
    state.selectedEntityId = harvester.id;

    const command = decideMvpBotCommand(state, "player_1");
    expect(command).toEqual({
      type: "END_PHASE",
      playerId: "player_1",
    });
  });

  it("holds a base-adjacent dropoff tile when carrying cargo", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "tactical";
    state.stack = [];

    const scout = state.entities.unit_player_1_scout;
    const harvester = state.entities.unit_player_1_harvester;
    if (!scout || scout.kind !== "unit" || !harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 units.");
    }

    scout.movesRemaining = 0;
    scout.attacksRemaining = 0;
    scout.hasSummoningSickness = true;
    harvester.coord = { q: -3, r: 0 };
    harvester.movesRemaining = 1;
    harvester.hasSummoningSickness = false;
    harvester.carries = "alloy";
    state.selectedEntityId = harvester.id;

    const command = decideMvpBotCommand(state, "player_1");
    expect(command).toEqual({
      type: "END_PHASE",
      playerId: "player_1",
    });
  });
});
