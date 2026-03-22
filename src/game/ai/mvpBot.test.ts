import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
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
      targetEntityId: null,
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

  it("discards a card during discard phase when above the soft cap", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "discard";

    moveCardFromDeckToHand(state, "player_2", "expedition_harvester_card");
    moveCardFromDeckToHand(state, "player_2", "null_intercept");
    moveCardFromDeckToHand(state, "player_2", "relay_savant_card");

    const command = decideMvpBotCommand(state, "player_2");
    expect(command?.type).toBe("DISCARD_CARD");
    expect(command?.playerId).toBe("player_2");
    if (!command || command.type !== "DISCARD_CARD") {
      throw new Error("Expected bot to discard during discard phase.");
    }

    expect(state.zones.player_2.hand.some((card) => card.instanceId === command.cardInstanceId)).toBe(true);
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

  it("casts Arc Snap to kill an enemy combat unit during tactical phase", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "tactical";
    state.stack = [];
    state.players.player_2.resources.credits = 4;
    state.players.player_2.resources.flux = 4;

    const cardInstanceId = moveCardFromDeckToHand(state, "player_2", "arc_snap");
    const target = state.entities.unit_player_1_scout;
    if (!target || target.kind !== "unit") {
      throw new Error("Expected player 1 scout for Arc Snap bot test.");
    }
    target.hp = 2;

    const command = decideMvpBotCommand(state, "player_2");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_2",
      cardInstanceId,
      targetEntityId: target.id,
    });
  });

  it("casts Overload Finish on a damaged enemy unit before deploying more units", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "main";
    state.stack = [];
    state.players.player_2.resources.credits = 4;
    state.players.player_2.resources.flux = 4;

    const cardInstanceId = moveCardFromDeckToHand(state, "player_2", "overload_finish");
    const target = state.entities.unit_player_1_scout;
    if (!target || target.kind !== "unit") {
      throw new Error("Expected player 1 scout for Overload Finish bot test.");
    }
    target.hp = target.maxHp - 1;

    const command = decideMvpBotCommand(state, "player_2");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_2",
      cardInstanceId,
      targetEntityId: target.id,
    });
  });

  it("casts Rivet Volley at the enemy base when it is lethal", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "tactical";
    state.stack = [];
    state.players.player_1.resources.credits = 4;
    state.players.player_1.resources.alloy = 4;

    const cardInstanceId = moveCardFromDeckToHand(state, "player_1", "rivet_volley");
    const enemyBase = state.entities.base_player_2;
    if (!enemyBase || enemyBase.kind !== "base") {
      throw new Error("Expected player 2 base for Rivet Volley bot test.");
    }
    enemyBase.hp = 2;

    const command = decideMvpBotCommand(state, "player_1");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId,
      targetEntityId: enemyBase.id,
    });
  });

  it("casts Brace Protocol on an allied unit when it prevents a lethal counterattack", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "tactical";
    state.stack = [];
    state.players.player_1.resources.credits = 4;
    state.players.player_1.resources.alloy = 4;

    const cardInstanceId = moveCardFromDeckToHand(state, "player_1", "brace_protocol");
    const ally = state.entities.unit_player_1_scout;
    const enemy = state.entities.unit_player_2_scout;
    if (!ally || ally.kind !== "unit" || !enemy || enemy.kind !== "unit") {
      throw new Error("Expected units for Brace Protocol bot test.");
    }

    ally.hp = 2;
    ally.coord = { q: 0, r: 0 };
    enemy.coord = { q: 1, r: 0 };
    enemy.attackDamage = 3;
    enemy.attacksRemaining = 1;
    enemy.hasSummoningSickness = false;

    const command = decideMvpBotCommand(state, "player_1");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId,
      targetEntityId: ally.id,
    });
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
    moveCardFromDeckToHand(state, "player_2", "echo_recall");

    state.players.player_2.resources.credits = 10;
    state.players.player_2.resources.alloy = 10;
    state.players.player_2.resources.flux = 0;
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

    expect(command.to).toEqual({ q: 0, r: -2 });
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

    expect(command.to).toEqual({ q: -4, r: 0 });
  });

  it("alloy bot prioritizes credits before alloy when both are missing", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "tactical";
    state.stack = [];

    state.zones.player_1.hand = [];
    state.zones.player_1.discard = [];
    state.zones.player_1.exile = [];
    moveCardFromDeckToHand(state, "player_1", "alloy_guard_card");

    state.players.player_1.resources.credits = 0;
    state.players.player_1.resources.alloy = 0;
    state.players.player_1.resources.flux = 0;
    state.players.player_1.resources.biomass = 0;

    const harvester = state.entities.unit_player_1_harvester;
    expect(harvester?.kind).toBe("unit");
    if (!harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 harvester.");
    }

    harvester.coord = { q: -2, r: 0 };
    harvester.movesRemaining = 2;
    harvester.hasSummoningSickness = false;
    state.selectedEntityId = harvester.id;

    const command = decideMvpBotCommand(state, "player_1");
    expect(command?.type).toBe("MOVE_UNIT");
    if (!command || command.type !== "MOVE_UNIT") {
      throw new Error("Expected credits-focused move command.");
    }

    expect(command.to).toEqual({ q: -2, r: 1 });
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

    expect(command.to).toEqual({ q: -4, r: 1 });
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
    state.players.player_1.resources.credits = 3;

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
    harvester.coord = { q: -3, r: -3 };
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
