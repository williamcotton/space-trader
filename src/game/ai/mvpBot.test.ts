import { describe, expect, it } from "vitest";
import { getCardDefinition, type UnitCardDefinition } from "../content/cards/catalog";
import { requireMapDefinition } from "../content/maps/catalog";
import { getBloomedUnitIdsThisTurn } from "../content/sets/base/mechanics/bloom";
import { SPROUT_KEYWORD } from "../content/sets/base/mechanics/keywordIds";
import { incrementSalvageTriggersThisTurn } from "../content/sets/base/mechanics/salvage";
import { incrementTacticsCastThisTurn } from "../content/sets/base/mechanics/surge";
import { hexDistance } from "../model/hex";
import { createInitialGameState } from "../model/state";
import { decideMvpBotCommand } from "./mvpBot";

function setupState() {
  return createInitialGameState({ map: requireMapDefinition("frontier_belt") });
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

function moveTopCardFromDeckToHand(state: ReturnType<typeof setupState>, playerId: "player_1" | "player_2"): string {
  const card = state.zones[playerId].deck.shift();
  if (!card) {
    throw new Error(`Expected a card in ${playerId} deck.`);
  }
  state.zones[playerId].hand.push(card);
  return card.instanceId;
}

function addCardToHand(state: ReturnType<typeof setupState>, playerId: "player_1" | "player_2", cardId: string): string {
  const instanceId = `${playerId}_${cardId}_bot_test_${state.zones[playerId].hand.length}_${state.turn}`;
  state.zones[playerId].hand.push({
    instanceId,
    cardId,
    ownerId: playerId,
  });
  return instanceId;
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

    moveTopCardFromDeckToHand(state, "player_2");
    moveTopCardFromDeckToHand(state, "player_2");
    moveTopCardFromDeckToHand(state, "player_2");

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
    state.zones.player_2.hand = [];

    delete state.entities.unit_player_2_scout;
    moveCardFromDeckToHand(state, "player_2", "echo_recall");
    moveCardFromDeckToHand(state, "player_2", "flux_runner_card");

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

  it("does not spend a hostile targeted tactic on a stealthed enemy unit", () => {
    const scoutCard = getCardDefinition("frontline_scout_card") as UnitCardDefinition;
    const original = scoutCard.unit.keywords;
    scoutCard.unit.keywords = ["stealth"];

    try {
      const state = setupState();
      state.activePlayerId = "player_2";
      state.priorityPlayerId = "player_2";
      state.phase = "main";
      state.stack = [];
      state.zones.player_2.hand = [];
      state.players.player_2.resources.credits = 4;
      state.players.player_2.resources.flux = 4;

      delete state.entities.unit_player_1_harvester;
      moveCardFromDeckToHand(state, "player_2", "arc_snap");

      const command = decideMvpBotCommand(state, "player_2");
      expect(command).toEqual({
        type: "END_PHASE",
        playerId: "player_2",
      });
    } finally {
      scoutCard.unit.keywords = original;
    }
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

  it("casts Ion Shower with a legal hex target when it creates a combat kill", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "tactical";
    state.stack = [];
    state.zones.player_2.hand = [];
    state.players.player_2.resources.credits = 4;
    state.players.player_2.resources.flux = 4;

    const cardInstanceId = moveCardFromDeckToHand(state, "player_2", "ion_shower");
    const scout = state.entities.unit_player_2_scout;
    const enemy = state.entities.unit_player_1_scout;
    if (!scout || scout.kind !== "unit" || !enemy || enemy.kind !== "unit") {
      throw new Error("Expected units for Ion Shower bot test.");
    }

    scout.coord = { q: 0, r: 0 };
    scout.attacksRemaining = 1;
    scout.hasSummoningSickness = false;
    enemy.coord = { q: 1, r: 0 };
    enemy.hp = 3;

    const command = decideMvpBotCommand(state, "player_2");
    expect(command?.type).toBe("PLAY_CARD");
    if (!command || command.type !== "PLAY_CARD") {
      throw new Error("Expected Ion Shower play command.");
    }

    expect(command.cardInstanceId).toBe(cardInstanceId);
    expect(command.targetHex).toBeDefined();
    if (!command.targetHex) {
      throw new Error("Expected Ion Shower to choose a hex target.");
    }
    expect(hexDistance(command.targetHex, scout.coord)).toBeLessThanOrEqual(1);
  });

  it("casts Orbital Purge when it cleanly sweeps the enemy board", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "main";
    state.stack = [];
    state.zones.player_1.hand = [];
    state.players.player_1.resources.credits = 6;

    delete state.entities.unit_player_1_scout;
    delete state.entities.unit_player_1_harvester;

    const enemyScout = state.entities.unit_player_2_scout;
    const enemyHarvester = state.entities.unit_player_2_harvester;
    if (!enemyScout || enemyScout.kind !== "unit" || !enemyHarvester || enemyHarvester.kind !== "unit") {
      throw new Error("Expected enemy units for Orbital Purge bot test.");
    }
    enemyScout.hp = 4;
    enemyHarvester.hp = 2;

    const cardInstanceId = addCardToHand(state, "player_1", "orbital_purge");

    const command = decideMvpBotCommand(state, "player_1");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId,
    });
  });

  it("casts Meteor Chain at a hex that hits clustered enemy units", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "tactical";
    state.stack = [];
    state.zones.player_2.hand = [];
    state.players.player_2.resources.credits = 4;
    state.players.player_2.resources.flux = 2;

    const enemyScout = state.entities.unit_player_1_scout;
    const enemyHarvester = state.entities.unit_player_1_harvester;
    const friendlyScout = state.entities.unit_player_2_scout;
    if (
      !enemyScout || enemyScout.kind !== "unit" ||
      !enemyHarvester || enemyHarvester.kind !== "unit" ||
      !friendlyScout || friendlyScout.kind !== "unit"
    ) {
      throw new Error("Expected units for Meteor Chain bot test.");
    }

    enemyScout.coord = { q: 0, r: 0 };
    enemyScout.hp = 4;
    enemyHarvester.coord = { q: 1, r: 0 };
    enemyHarvester.hp = 2;
    friendlyScout.coord = { q: 4, r: 0 };

    const cardInstanceId = addCardToHand(state, "player_2", "meteor_chain");

    const command = decideMvpBotCommand(state, "player_2");
    expect(command?.type).toBe("PLAY_CARD");
    if (!command || command.type !== "PLAY_CARD") {
      throw new Error("Expected Meteor Chain play command.");
    }

    expect(command.cardInstanceId).toBe(cardInstanceId);
    expect(command.targetHex).toEqual({ q: 0, r: 0 });
  });

  it("casts Ion Surge Archive when low on hand and resources", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "main";
    state.stack = [];
    state.zones.player_2.hand = [];
    state.players.player_2.resources.credits = 3;
    state.players.player_2.resources.flux = 2;

    delete state.entities.unit_player_2_scout;
    delete state.entities.unit_player_2_harvester;

    const cardInstanceId = addCardToHand(state, "player_2", "ion_surge_archive");

    const command = decideMvpBotCommand(state, "player_2");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_2",
      cardInstanceId,
    });
  });

  it("uses Arc Bloom as a surged area spell against clustered enemies", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "main";
    state.stack = [];
    state.zones.player_2.hand = [];
    state.players.player_2.resources.credits = 2;
    state.players.player_2.resources.flux = 1;
    incrementTacticsCastThisTurn(state, "player_2");

    const enemyScout = state.entities.unit_player_1_scout;
    const enemyHarvester = state.entities.unit_player_1_harvester;
    if (!enemyScout || enemyScout.kind !== "unit" || !enemyHarvester || enemyHarvester.kind !== "unit") {
      throw new Error("Expected clustered enemy units for Arc Bloom bot test.");
    }

    enemyScout.coord = { q: 0, r: 0 };
    enemyHarvester.coord = { q: 1, r: 0 };
    enemyScout.hp = 2;
    enemyHarvester.hp = 1;

    const cardInstanceId = addCardToHand(state, "player_2", "arc_bloom");

    const command = decideMvpBotCommand(state, "player_2");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_2",
      cardInstanceId,
      targetHex: { q: 1, r: 0 },
    });
  });

  it("casts Emergency War Chest when low on hand and flush with credits", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "main";
    state.stack = [];
    state.zones.player_2.hand = [];
    state.players.player_2.resources.credits = 5;

    delete state.entities.unit_player_2_scout;
    delete state.entities.unit_player_2_harvester;

    const cardInstanceId = addCardToHand(state, "player_2", "emergency_war_chest");

    const command = decideMvpBotCommand(state, "player_2");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_2",
      cardInstanceId,
    });
  });

  it("casts Spore Harvest when a wide board creates multiple payouts", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "main";
    state.stack = [];
    state.zones.player_1.hand = [];
    state.players.player_1.resources.biomass = 2;

    const scout = state.entities.unit_player_1_scout;
    const harvester = state.entities.unit_player_1_harvester;
    if (!scout || scout.kind !== "unit" || !harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 units for Spore Harvest bot test.");
    }

    state.entities.bot_test_spore_harvest_1 = {
      ...scout,
      id: "bot_test_spore_harvest_1",
      coord: { q: -3, r: 1 },
    };
    state.entities.bot_test_spore_harvest_2 = {
      ...harvester,
      id: "bot_test_spore_harvest_2",
      coord: { q: -2, r: 1 },
    };

    const cardInstanceId = addCardToHand(state, "player_1", "spore_harvest");

    const command = decideMvpBotCommand(state, "player_1");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId,
    });
  });

  it("casts Overgrowth Wave when multiple Bloom units turn it into a biomass burst", () => {
    const state = createInitialGameState({
      map: requireMapDefinition("frontier_belt"),
      factions: {
        player_1: "biomass_swarm",
        player_2: "flux_collective",
      },
    });
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "main";
    state.stack = [];
    state.zones.player_1.hand = [];
    state.players.player_1.resources.credits = 3;
    state.players.player_1.resources.biomass = 2;

    for (let index = 0; index < 4; index += 1) {
      state.entities[`bot_test_bloom_${index}`] = {
        id: `bot_test_bloom_${index}`,
        kind: "unit",
        name: index % 2 === 0 ? "Spore Tender" : "Support Drone",
        ownerId: "player_1",
        role: index % 2 === 0 ? "resource" : "combat",
        hp: index % 2 === 0 ? 4 : 6,
        maxHp: index % 2 === 0 ? 4 : 6,
        attackDamage: index % 2 === 0 ? 1 : 2,
        siegeDamageBonus: index % 2 === 0 ? 0 : 1,
        armor: 0,
        moveRange: index % 2 === 0 ? 4 : 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: -4 + index, r: 1 },
        keywords: ["sprout", "bloom"],
        carries: null,
        sourceCardId: index % 2 === 0 ? "spore_tender_card" : "support_drone_card",
        hasSummoningSickness: false,
        movesRemaining: index % 2 === 0 ? 4 : 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };
    }

    const cardInstanceId = addCardToHand(state, "player_1", "overgrowth_wave");

    const command = decideMvpBotCommand(state, "player_1");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId,
    });
  });

  it("casts Canopy Dividend when enough of its units bloomed this turn", () => {
    const state = createInitialGameState({
      map: requireMapDefinition("frontier_belt"),
      factions: {
        player_1: "biomass_swarm",
        player_2: "flux_collective",
      },
    });
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "main";
    state.stack = [];
    state.zones.player_1.hand = [];
    state.players.player_1.resources.biomass = 1;
    getBloomedUnitIdsThisTurn(state).push("unit_player_1_scout", "unit_player_1_harvester");

    const cardInstanceId = addCardToHand(state, "player_1", "canopy_dividend");

    const command = decideMvpBotCommand(state, "player_1");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId,
    });
  });

  it("casts Scrap Dividend when it has salvage payouts banked for the turn", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "main";
    state.stack = [];
    state.zones.player_1.hand = [];
    state.players.player_1.resources.alloy = 1;
    incrementSalvageTriggersThisTurn(state, "player_1");
    incrementSalvageTriggersThisTurn(state, "player_1");

    const cardInstanceId = addCardToHand(state, "player_1", "scrap_dividend");

    const command = decideMvpBotCommand(state, "player_1");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId,
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

  it("casts Slag Barrage at a damaged enemy base during tactical even when it is not lethal", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "tactical";
    state.stack = [];
    state.zones.player_1.hand = [];
    state.players.player_1.resources.credits = 6;
    state.players.player_1.resources.alloy = 6;

    const cardInstanceId = moveCardFromDeckToHand(state, "player_1", "slag_barrage");
    const enemyBase = state.entities.base_player_2;
    if (!enemyBase || enemyBase.kind !== "base") {
      throw new Error("Expected player 2 base for Slag Barrage bot test.");
    }
    enemyBase.hp = 4;

    const command = decideMvpBotCommand(state, "player_1");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId,
      targetEntityId: enemyBase.id,
    });
  });

  it("spends base-damage tactics when hand is capped and resources are flooded", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "tactical";
    state.stack = [];
    state.zones.player_1.hand = [];
    state.players.player_1.resources.credits = 12;
    state.players.player_1.resources.alloy = 12;

    const cardInstanceId = moveCardFromDeckToHand(state, "player_1", "slag_barrage");
    moveCardFromDeckToHand(state, "player_1", "brace_protocol");
    moveCardFromDeckToHand(state, "player_1", "brace_protocol");
    moveCardFromDeckToHand(state, "player_1", "brace_protocol");
    moveCardFromDeckToHand(state, "player_1", "patchwork_barrier");
    moveCardFromDeckToHand(state, "player_1", "patchwork_barrier");
    moveCardFromDeckToHand(state, "player_1", "patchwork_barrier");
    state.zones.player_1.deck = [];

    const enemyBase = state.entities.base_player_2;
    if (!enemyBase || enemyBase.kind !== "base") {
      throw new Error("Expected player 2 base for overflow burn test.");
    }

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
    state.zones.player_1.hand = [];
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

  it("moves a sprout unit in tactical even while it still has summoning sickness", () => {
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
    harvester.movesRemaining = 0;
    harvester.attacksRemaining = 0;

    state.entities.unit_player_1_support_drone = {
      id: "unit_player_1_support_drone",
      kind: "unit",
      name: "Support Drone",
      ownerId: "player_1",
      role: "combat",
      hp: 6,
      maxHp: 6,
      attackDamage: 2,
      siegeDamageBonus: 1,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: { q: 0, r: 0 },
      keywords: [SPROUT_KEYWORD],
      carries: null,
      sourceCardId: "support_drone_card",
      hasSummoningSickness: true,
      movesRemaining: 2,
      attacksRemaining: 0,
      temporaryAttackBonus: 0,
      temporaryArmorBonus: 0,
    };
    state.selectedEntityId = "unit_player_1_support_drone";

    const command = decideMvpBotCommand(state, "player_1");
    expect(command?.type).toBe("MOVE_UNIT");
    if (!command || command.type !== "MOVE_UNIT") {
      throw new Error("Expected sprout movement command.");
    }
  });

  it("attacks with a sprout unit in tactical even while it still has summoning sickness", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.phase = "tactical";
    state.stack = [];
    state.zones.player_1.hand = [];

    const scout = state.entities.unit_player_1_scout;
    const harvester = state.entities.unit_player_1_harvester;
    const enemyScout = state.entities.unit_player_2_scout;
    if (!scout || scout.kind !== "unit" || !harvester || harvester.kind !== "unit" || !enemyScout || enemyScout.kind !== "unit") {
      throw new Error("Expected units.");
    }

    scout.movesRemaining = 0;
    scout.attacksRemaining = 0;
    harvester.movesRemaining = 0;
    harvester.attacksRemaining = 0;
    enemyScout.coord = { q: 1, r: 0 };

    state.entities.unit_player_1_support_drone = {
      id: "unit_player_1_support_drone",
      kind: "unit",
      name: "Support Drone",
      ownerId: "player_1",
      role: "combat",
      hp: 6,
      maxHp: 6,
      attackDamage: 2,
      siegeDamageBonus: 1,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: { q: 0, r: 0 },
      keywords: [SPROUT_KEYWORD],
      carries: null,
      sourceCardId: "support_drone_card",
      hasSummoningSickness: true,
      movesRemaining: 0,
      attacksRemaining: 1,
      temporaryAttackBonus: 0,
      temporaryArmorBonus: 0,
    };
    state.selectedEntityId = "unit_player_1_support_drone";

    const command = decideMvpBotCommand(state, "player_1");
    expect(command).toEqual({
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId: "unit_player_1_support_drone",
      targetId: "unit_player_2_scout",
    });
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
