import { describe, expect, it } from "vitest";
import type { GameCommand } from "./commands";
import { dispatchCommand } from "./reducers";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { BASE_STARTING_HP, createInitialGameState } from "../model/state";

function setupState() {
  return createInitialGameState({ map: FRONTIER_BELT_MAP });
}

function advanceToPhase(state: ReturnType<typeof setupState>, phase: ReturnType<typeof setupState>["phase"]): void {
  let guard = 0;
  while (state.phase !== phase && guard < 12) {
    dispatchCommand(state, { type: "END_PHASE", playerId: state.activePlayerId });
    guard += 1;
  }
}

function advanceToTactical(state: ReturnType<typeof setupState>): void {
  advanceToPhase(state, "tactical");
}

function expectRejected(result: ReturnType<typeof dispatchCommand>): string {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected command to be rejected.");
  }
  return result.reason;
}

function moveCardFromDeckToHand(state: ReturnType<typeof setupState>, playerId: "player_1" | "player_2", cardId: string): string {
  const deck = state.zones[playerId].deck;
  const index = deck.findIndex((card) => card.cardId === cardId);
  if (index < 0) {
    throw new Error(`Expected ${cardId} in deck for ${playerId}.`);
  }

  const [card] = deck.splice(index, 1);
  if (!card) {
    throw new Error(`Failed to move ${cardId} from deck for ${playerId}.`);
  }
  state.zones[playerId].hand.push(card);
  state.players[playerId].handSize = state.zones[playerId].hand.length;
  state.players[playerId].deckSize = state.zones[playerId].deck.length;
  return card.instanceId;
}

describe("dispatchCommand", () => {
  it("supports first unit selection + movement path", () => {
    const state = setupState();
    const unitId = "unit_player_1_scout";
    const before = state.entities[unitId];
    expect(before?.kind).toBe("unit");
    if (!before || before.kind !== "unit") {
      throw new Error("Expected initial player 1 unit.");
    }
    const beforeCoord = { ...before.coord };
    const beforeMoves = before.movesRemaining;

    const selectResult = dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: unitId,
    });
    expect(selectResult.ok).toBe(true);
    expect(state.selectedEntityId).toBe(unitId);

    dispatchCommand(state, { type: "ADVANCE_PHASE", playerId: "player_1" }); // economy
    dispatchCommand(state, { type: "ADVANCE_PHASE", playerId: "player_1" }); // main
    dispatchCommand(state, { type: "ADVANCE_PHASE", playerId: "player_1" }); // tactical
    expect(state.phase).toBe("tactical");

    const moveResult = dispatchCommand(state, {
      type: "MOVE_UNIT",
      playerId: "player_1",
      entityId: unitId,
      to: { q: beforeCoord.q + 1, r: beforeCoord.r },
    });

    expect(moveResult.ok).toBe(true);
    const after = state.entities[unitId];
    expect(after?.kind).toBe("unit");
    if (!after || after.kind !== "unit") {
      throw new Error("Expected moved unit.");
    }
    expect(after.coord.q).toBe(beforeCoord.q + 1);
    expect(after.coord.r).toBe(beforeCoord.r);
    expect(after.movesRemaining).toBe(beforeMoves - 1);
  });

  it("is deterministic for the same command stream", () => {
    const commandStream: GameCommand[] = [
      { type: "SELECT_ENTITY", playerId: "player_1", entityId: "unit_player_1_scout" },
      { type: "ADVANCE_PHASE", playerId: "player_1" },
      { type: "ADVANCE_PHASE", playerId: "player_1" },
      { type: "ADVANCE_PHASE", playerId: "player_1" },
      { type: "MOVE_UNIT", playerId: "player_1", entityId: "unit_player_1_scout", to: { q: -2, r: 0 } },
    ];

    const stateA = setupState();
    const stateB = setupState();

    for (const command of commandStream) {
      dispatchCommand(stateA, command);
      dispatchCommand(stateB, command);
    }

    expect(stateA).toEqual(stateB);
  });

  it("rejects invalid move cases (out-of-phase, occupied, out-of-range)", () => {
    const state = setupState();
    const unitId = "unit_player_1_scout";

    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: unitId,
    });

    const outOfPhase = dispatchCommand(state, {
      type: "MOVE_UNIT",
      playerId: "player_1",
      entityId: unitId,
      to: { q: -2, r: 0 },
    });
    expect(expectRejected(outOfPhase)).toContain("tactical phase");

    advanceToTactical(state);
    expect(state.phase).toBe("tactical");

    const occupied = dispatchCommand(state, {
      type: "MOVE_UNIT",
      playerId: "player_1",
      entityId: unitId,
      to: { q: -4, r: 0 }, // friendly base tile (occupied and within movement range)
    });
    expect(expectRejected(occupied)).toContain("occupied");

    const outOfRange = dispatchCommand(state, {
      type: "MOVE_UNIT",
      playerId: "player_1",
      entityId: unitId,
      to: { q: 2, r: 0 },
    });
    expect(expectRejected(outOfRange)).toContain("out of movement range");
  });

  it("remains deterministic with mixed valid and invalid commands", () => {
    const commandStream: GameCommand[] = [
      { type: "SELECT_ENTITY", playerId: "player_1", entityId: "unit_player_1_scout" },
      { type: "MOVE_UNIT", playerId: "player_1", entityId: "unit_player_1_scout", to: { q: -2, r: 0 } }, // invalid phase
      { type: "END_PHASE", playerId: "player_1" },
      { type: "END_PHASE", playerId: "player_1" },
      { type: "END_PHASE", playerId: "player_1" },
      { type: "MOVE_UNIT", playerId: "player_1", entityId: "unit_player_1_scout", to: { q: -2, r: 0 } }, // valid
      { type: "ATTACK_UNIT", playerId: "player_1", attackerId: "unit_player_1_scout", targetId: "unit_player_2_scout" }, // out of range
    ];

    const stateA = setupState();
    const stateB = setupState();

    for (const command of commandStream) {
      dispatchCommand(stateA, command);
      dispatchCommand(stateB, command);
    }

    expect(stateA).toEqual(stateB);
  });

  it("clears selection through command/event path with deterministic logging", () => {
    const state = setupState();
    const unitId = "unit_player_1_scout";

    const select = dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: unitId,
    });
    expect(select.ok).toBe(true);
    expect(state.selectedEntityId).toBe(unitId);

    const clear = dispatchCommand(state, {
      type: "CLEAR_SELECTION",
      playerId: "player_1",
      reason: "clicked_empty_or_enemy_tile",
    });
    expect(clear.ok).toBe(true);
    expect(state.selectedEntityId).toBeNull();
    expect(state.log[state.log.length - 1]?.text).toContain("cleared selection");
    expect(state.log[state.log.length - 1]?.text).toContain(unitId);
  });

  it("rejects clear selection for non-active player or when nothing is selected", () => {
    const state = setupState();
    const unitId = "unit_player_1_scout";

    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: unitId,
    });

    const wrongPlayer = dispatchCommand(state, {
      type: "CLEAR_SELECTION",
      playerId: "player_2",
      reason: "clicked_empty_or_enemy_tile",
    });
    expect(expectRejected(wrongPlayer)).toContain("active player");

    dispatchCommand(state, {
      type: "CLEAR_SELECTION",
      playerId: "player_1",
      reason: "clicked_empty_or_enemy_tile",
    });
    expect(state.selectedEntityId).toBeNull();

    const noneSelected = dispatchCommand(state, {
      type: "CLEAR_SELECTION",
      playerId: "player_1",
      reason: "clicked_empty_or_enemy_tile",
    });
    expect(expectRejected(noneSelected)).toContain("No selected entity");
  });

  it("resolves attack by reducing target HP and consuming attack budget", () => {
    const state = setupState();
    const attackerId = "unit_player_1_scout";
    const targetId = "unit_player_2_scout";

    const attacker = state.entities[attackerId];
    const target = state.entities[targetId];
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit") {
      throw new Error("Expected initial units.");
    }

    attacker.coord = { q: -1, r: 0 };
    target.coord = { q: 0, r: 0 };

    advanceToTactical(state);
    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: attackerId,
    });

    const beforeHp = target.hp;
    const beforeAttacks = attacker.attacksRemaining;
    const attackResult = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId,
      targetId,
    });

    expect(attackResult.ok).toBe(true);
    const afterTarget = state.entities[targetId];
    const afterAttacker = state.entities[attackerId];
    expect(afterTarget?.kind).toBe("unit");
    expect(afterAttacker?.kind).toBe("unit");
    if (!afterTarget || afterTarget.kind !== "unit" || !afterAttacker || afterAttacker.kind !== "unit") {
      throw new Error("Expected entities after attack.");
    }

    expect(afterTarget.hp).toBe(beforeHp - 2);
    expect(afterAttacker.attacksRemaining).toBe(beforeAttacks - 1);
  });

  it("applies supply-penalty combat math through reducer attack events", () => {
    const state = setupState();
    const attackerId = "unit_player_1_scout";
    const targetId = "unit_player_2_scout";
    const attacker = state.entities[attackerId];
    const target = state.entities[targetId];
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit") {
      throw new Error("Expected units for supply-penalty test.");
    }

    attacker.attackDamage = 4;
    attacker.coord = { q: 4, r: 0 }; // distance 8 from player_1 base => supply penalty 1
    target.armor = 0;
    target.coord = { q: 5, r: 0 };
    target.hp = 6;

    advanceToTactical(state);
    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: attackerId,
    });

    const result = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId,
      targetId,
    });
    expect(result.ok).toBe(true);

    const updatedTarget = state.entities[targetId];
    expect(updatedTarget?.kind).toBe("unit");
    if (!updatedTarget || updatedTarget.kind !== "unit") {
      throw new Error("Expected target unit after attack.");
    }
    expect(updatedTarget.hp).toBe(3);
  });

  it("ends the match when a base reaches zero HP", () => {
    const state = setupState();
    const attackerId = "unit_player_1_scout";
    const baseId = "base_player_2";
    const blockerId = "unit_player_2_scout";

    const attacker = state.entities[attackerId];
    const targetBase = state.entities[baseId];
    const blocker = state.entities[blockerId];
    expect(attacker?.kind).toBe("unit");
    expect(targetBase?.kind).toBe("base");
    expect(blocker?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !targetBase || targetBase.kind !== "base" || !blocker || blocker.kind !== "unit") {
      throw new Error("Expected attacker, base, and blocker.");
    }

    attacker.coord = { q: 3, r: 0 };
    blocker.coord = { q: 2, r: 0 };
    targetBase.hp = 1;

    advanceToTactical(state);
    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: attackerId,
    });

    const attackResult = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId,
      targetId: baseId,
    });

    expect(attackResult.ok).toBe(true);
    expect(state.winner).toBe("player_1");

    const updatedBase = state.entities[baseId];
    expect(updatedBase?.kind).toBe("base");
    if (!updatedBase || updatedBase.kind !== "base") {
      throw new Error("Expected base after attack.");
    }
    expect(updatedBase.hp).toBe(0);
  });

  it("enforces attack legality checks (phase, ownership, range, summoning sickness)", () => {
    const state = setupState();
    const attackerId = "unit_player_1_scout";
    const targetId = "unit_player_2_scout";

    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: attackerId,
    });

    const badPhase = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId,
      targetId,
    });
    expect(expectRejected(badPhase)).toContain("tactical phase");

    advanceToTactical(state);

    const wrongOwner = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId: "unit_player_2_scout",
      targetId: "unit_player_1_scout",
    });
    expect(expectRejected(wrongOwner)).toContain("opponent unit");

    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: attackerId,
    });
    const outOfRange = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId,
      targetId,
    });
    expect(expectRejected(outOfRange)).toContain("out of attack range");

    const attacker = state.entities[attackerId];
    const target = state.entities[targetId];
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit") {
      throw new Error("Expected units for sickness check.");
    }

    attacker.coord = { q: -1, r: 0 };
    target.coord = { q: 0, r: 0 };
    attacker.hasSummoningSickness = true;

    const summoningSickness = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId,
      targetId,
    });
    expect(expectRejected(summoningSickness)).toContain("summoning sickness");
  });

  it("initializes with opening hands and validated starter decks", () => {
    const state = setupState();

    expect(state.zones.player_1.hand).toHaveLength(5);
    expect(state.zones.player_2.hand).toHaveLength(5);
    expect(state.zones.player_1.deck).toHaveLength(55);
    expect(state.zones.player_2.deck).toHaveLength(55);
    expect(state.players.player_1.handSize).toBe(5);
    expect(state.players.player_2.handSize).toBe(5);
    expect(state.players.player_1.deckSize).toBe(55);
    expect(state.players.player_2.deckSize).toBe(55);
  });

  it("draws one card when a new turn enters start phase", () => {
    const state = setupState();

    advanceToPhase(state, "end");
    const beforeHand = state.zones.player_2.hand.length;
    const beforeDeck = state.zones.player_2.deck.length;
    const handoff = dispatchCommand(state, {
      type: "END_PHASE",
      playerId: "player_1",
    });

    expect(handoff.ok).toBe(true);
    expect(state.phase).toBe("start");
    expect(state.activePlayerId).toBe("player_2");
    expect(state.zones.player_2.hand.length).toBe(beforeHand + 1);
    expect(state.zones.player_2.deck.length).toBe(beforeDeck - 1);
  });

  it("draws for the active player each time their turn cycles back to start", () => {
    const state = setupState();
    const p1InitialHand = state.zones.player_1.hand.length;
    const p1InitialDeck = state.zones.player_1.deck.length;

    // End player_1 turn -> player_2 start (player_2 draws)
    advanceToPhase(state, "end");
    dispatchCommand(state, {
      type: "END_PHASE",
      playerId: "player_1",
    });

    // End player_2 turn -> player_1 start (player_1 draws)
    advanceToPhase(state, "end");
    const handoffBack = dispatchCommand(state, {
      type: "END_PHASE",
      playerId: "player_2",
    });
    expect(handoffBack.ok).toBe(true);
    expect(state.activePlayerId).toBe("player_1");
    expect(state.phase).toBe("start");
    expect(state.zones.player_1.hand.length).toBe(p1InitialHand + 1);
    expect(state.zones.player_1.deck.length).toBe(p1InitialDeck - 1);
    expect(state.players.player_1.handSize).toBe(state.zones.player_1.hand.length);
    expect(state.players.player_1.deckSize).toBe(state.zones.player_1.deck.length);
  });

  it("skips start-phase draw when the active player is already at the hand cap", () => {
    const state = setupState();

    moveCardFromDeckToHand(state, "player_2", "expedition_harvester_card");
    moveCardFromDeckToHand(state, "player_2", "null_intercept");
    expect(state.zones.player_2.hand).toHaveLength(7);

    advanceToPhase(state, "end");
    const beforeHand = state.zones.player_2.hand.length;
    const beforeDeck = state.zones.player_2.deck.length;
    const handoff = dispatchCommand(state, {
      type: "END_PHASE",
      playerId: "player_1",
    });

    expect(handoff.ok).toBe(true);
    expect(state.phase).toBe("start");
    expect(state.activePlayerId).toBe("player_2");
    expect(state.zones.player_2.hand.length).toBe(beforeHand);
    expect(state.zones.player_2.deck.length).toBe(beforeDeck);
  });

  it("plays a tactic card from hand to stack and moves it to discard on resolve", () => {
    const state = setupState();
    const cardInstanceId = moveCardFromDeckToHand(state, "player_1", "slag_barrage");
    state.players.player_1.resources.credits = 4;
    state.players.player_1.resources.alloy = 4;

    const targetBase = state.entities.base_player_2;
    expect(targetBase?.kind).toBe("base");
    if (!targetBase || targetBase.kind !== "base") {
      throw new Error("Expected enemy base.");
    }
    const beforeHp = targetBase.hp;

    const play = dispatchCommand(state, {
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId,
    });
    expect(play.ok).toBe(true);
    expect(state.stack).toHaveLength(1);
    expect(state.zones.player_1.hand.some((card) => card.instanceId === cardInstanceId)).toBe(false);

    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_2" });
    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_1" });

    expect(state.stack).toHaveLength(0);
    expect(state.zones.player_1.discard.some((card) => card.instanceId === cardInstanceId)).toBe(true);
    const updatedBase = state.entities.base_player_2;
    expect(updatedBase?.kind).toBe("base");
    if (!updatedBase || updatedBase.kind !== "base") {
      throw new Error("Expected enemy base after resolve.");
    }
    expect(updatedBase.hp).toBe(beforeHp - 2);
    expect(state.players.player_1.resources.credits).toBe(3);
    expect(state.players.player_1.resources.alloy).toBe(3);
  });

  it("casts a main-speed unit card to stack and resolves it to battlefield with summoning sickness", () => {
    const state = setupState();
    const cardInHand = state.zones.player_1.hand.find((card) => card.cardId === "frontline_scout_card");
    expect(cardInHand).toBeDefined();
    if (!cardInHand) {
      throw new Error("Expected frontline scout in opening hand.");
    }

    state.players.player_1.resources.credits = 4;
    state.players.player_1.resources.alloy = 3;
    dispatchCommand(state, { type: "END_PHASE", playerId: "player_1" }); // economy
    dispatchCommand(state, { type: "END_PHASE", playerId: "player_1" }); // main
    expect(state.phase).toBe("main");

    const beforeUnitCount = Object.values(state.entities).filter((entity) => entity.kind === "unit" && entity.ownerId === "player_1").length;
    const play = dispatchCommand(state, {
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId: cardInHand.instanceId,
    });

    expect(play.ok).toBe(true);
    expect(state.stack).toHaveLength(1);
    expect(state.stack[0]?.sourceCardId).toBe("frontline_scout_card");
    expect(state.stack[0]?.pendingUnitEntityId).toContain("frontline_scout_card");
    expect(state.players.player_1.resources.credits).toBe(2);
    expect(state.players.player_1.resources.alloy).toBe(2);
    expect(state.zones.player_1.hand.some((card) => card.instanceId === cardInHand.instanceId)).toBe(false);

    const whileOnStackUnits = Object.values(state.entities).filter((entity) => entity.kind === "unit" && entity.ownerId === "player_1");
    expect(whileOnStackUnits.length).toBe(beforeUnitCount);

    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_2" });
    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_1" });

    expect(state.stack).toHaveLength(0);
    const afterUnits = Object.values(state.entities).filter((entity) => entity.kind === "unit" && entity.ownerId === "player_1");
    expect(afterUnits.length).toBe(beforeUnitCount + 1);
    const deployed = afterUnits.find((entity) => entity.id.includes("frontline_scout_card"));
    expect(deployed?.kind).toBe("unit");
    if (!deployed || deployed.kind !== "unit") {
      throw new Error("Expected deployed frontline scout unit.");
    }
    expect(deployed.hasSummoningSickness).toBe(true);
    expect(deployed.movesRemaining).toBe(0);
    expect(deployed.attacksRemaining).toBe(0);
    expect(state.zones.player_1.discard.some((card) => card.instanceId === cardInHand.instanceId)).toBe(false);
  });

  it("allows countering a unit spell to discard before it resolves", () => {
    const state = setupState();
    const unitCardInstanceId = state.zones.player_1.hand.find((card) => card.cardId === "frontline_scout_card")?.instanceId;
    expect(unitCardInstanceId).toBeDefined();
    if (!unitCardInstanceId) {
      throw new Error("Expected frontline scout in opening hand.");
    }

    const counterInstanceId = moveCardFromDeckToHand(state, "player_2", "null_intercept");
    state.players.player_1.resources.credits = 4;
    state.players.player_1.resources.alloy = 3;
    state.players.player_2.resources.credits = 4;
    dispatchCommand(state, { type: "END_PHASE", playerId: "player_1" }); // economy
    dispatchCommand(state, { type: "END_PHASE", playerId: "player_1" }); // main

    const beforeUnitCount = Object.values(state.entities).filter((entity) => entity.kind === "unit" && entity.ownerId === "player_1").length;
    const castUnit = dispatchCommand(state, {
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId: unitCardInstanceId,
    });
    expect(castUnit.ok).toBe(true);
    const unitStackId = state.stack[0]?.id;
    expect(unitStackId).toBeDefined();
    if (!unitStackId) {
      throw new Error("Expected unit spell on stack.");
    }

    const counter = dispatchCommand(state, {
      type: "PLAY_CARD",
      playerId: "player_2",
      cardInstanceId: counterInstanceId,
      targetStackItemId: unitStackId,
    });
    expect(counter.ok).toBe(true);
    expect(state.stack).toHaveLength(2);

    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_1" });
    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_2" });

    expect(state.stack).toHaveLength(0);
    const afterUnits = Object.values(state.entities).filter((entity) => entity.kind === "unit" && entity.ownerId === "player_1");
    expect(afterUnits.length).toBe(beforeUnitCount);
    expect(state.zones.player_1.discard.some((card) => card.instanceId === unitCardInstanceId)).toBe(true);
    expect(state.zones.player_2.discard.some((card) => card.instanceId === counterInstanceId)).toBe(true);
  });

  it("allows returning a unit spell to hand with a counter-to-hand effect", () => {
    const state = setupState();
    const unitCardInstanceId = state.zones.player_1.hand.find((card) => card.cardId === "frontline_scout_card")?.instanceId;
    expect(unitCardInstanceId).toBeDefined();
    if (!unitCardInstanceId) {
      throw new Error("Expected frontline scout in opening hand.");
    }

    const recallInstanceId = moveCardFromDeckToHand(state, "player_2", "echo_recall");
    state.players.player_1.resources.credits = 4;
    state.players.player_1.resources.alloy = 3;
    state.players.player_2.resources.credits = 4;
    state.players.player_2.resources.flux = 4;
    dispatchCommand(state, { type: "END_PHASE", playerId: "player_1" }); // economy
    dispatchCommand(state, { type: "END_PHASE", playerId: "player_1" }); // main

    const castUnit = dispatchCommand(state, {
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId: unitCardInstanceId,
    });
    expect(castUnit.ok).toBe(true);
    const unitStackId = state.stack[0]?.id;
    expect(unitStackId).toBeDefined();
    if (!unitStackId) {
      throw new Error("Expected unit spell on stack.");
    }

    const recall = dispatchCommand(state, {
      type: "PLAY_CARD",
      playerId: "player_2",
      cardInstanceId: recallInstanceId,
      targetStackItemId: unitStackId,
    });
    expect(recall.ok).toBe(true);

    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_1" });
    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_2" });

    expect(state.stack).toHaveLength(0);
    expect(state.zones.player_1.hand.some((card) => card.instanceId === unitCardInstanceId)).toBe(true);
    expect(state.zones.player_1.discard.some((card) => card.instanceId === unitCardInstanceId)).toBe(false);
    expect(state.zones.player_2.discard.some((card) => card.instanceId === recallInstanceId)).toBe(true);
  });

  it("rejects card play when resources are insufficient", () => {
    const state = setupState();
    const cardInstanceId = moveCardFromDeckToHand(state, "player_1", "slag_barrage");
    state.players.player_1.resources.credits = 0;
    state.players.player_1.resources.alloy = 0;
    const result = dispatchCommand(state, {
      type: "PLAY_CARD",
      playerId: "player_1",
      cardInstanceId,
    });

    expect(expectRejected(result)).toContain("Insufficient resources");
  });

  it("captures nodes by occupancy at end phase handoff", () => {
    const state = setupState();
    const node = state.map.resourceNodes.find((entry) => entry.id === "frontier_alloy_west");
    const scout = state.entities.unit_player_1_scout;
    expect(node).toBeDefined();
    expect(scout?.kind).toBe("unit");
    if (!node || !scout || scout.kind !== "unit") {
      throw new Error("Expected node and player 1 scout.");
    }

    scout.coord = { ...node.coord };
    expect(node.controlledBy).toBeNull();

    advanceToPhase(state, "end");
    const handoff = dispatchCommand(state, {
      type: "END_PHASE",
      playerId: "player_1",
    });
    expect(handoff.ok).toBe(true);
    expect(state.phase).toBe("start");
    expect(state.activePlayerId).toBe("player_2");
    expect(node.controlledBy).toBe("player_1");
  });

  it("does not grant passive income from node ownership", () => {
    const state = setupState();
    const node = state.map.resourceNodes.find((entry) => entry.id === "frontier_credits_center");
    expect(node).toBeDefined();
    if (!node) {
      throw new Error("Expected center credits node.");
    }
    node.controlledBy = "player_1";

    const before = { ...state.players.player_1.resources };
    const toEconomy = dispatchCommand(state, {
      type: "END_PHASE",
      playerId: "player_1",
    });
    expect(toEconomy.ok).toBe(true);
    expect(state.phase).toBe("economy");
    expect(state.players.player_1.resources).toEqual(before);
  });

  it("harvests from a controlled node into harvester cargo and rejects invalid repeats", () => {
    const state = setupState();
    const harvesterId = "unit_player_1_harvester";
    const nodeId = "frontier_alloy_west";
    const harvester = state.entities[harvesterId];
    const node = state.map.resourceNodes.find((entry) => entry.id === nodeId);
    expect(harvester?.kind).toBe("unit");
    expect(node).toBeDefined();
    if (!harvester || harvester.kind !== "unit" || !node) {
      throw new Error("Expected harvester and node.");
    }

    harvester.coord = { ...node.coord };
    node.controlledBy = "player_1";

    advanceToTactical(state);
    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: harvesterId,
    });

    const harvest = dispatchCommand(state, {
      type: "HARVEST_NODE",
      playerId: "player_1",
      entityId: harvesterId,
      nodeId,
    });
    expect(harvest.ok).toBe(true);
    const updated = state.entities[harvesterId];
    expect(updated?.kind).toBe("unit");
    if (!updated || updated.kind !== "unit") {
      throw new Error("Expected updated harvester.");
    }
    expect(updated.carries).toBe("alloy");

    const duplicateHarvest = dispatchCommand(state, {
      type: "HARVEST_NODE",
      playerId: "player_1",
      entityId: harvesterId,
      nodeId,
    });
    expect(expectRejected(duplicateHarvest)).toContain("already carrying cargo");
  });

  it("enforces harvest legality (phase, ownership, role, control, occupancy)", () => {
    const state = setupState();
    const nodeId = "frontier_alloy_west";
    const node = state.map.resourceNodes.find((entry) => entry.id === nodeId);
    const harvesterId = "unit_player_1_harvester";
    const harvester = state.entities[harvesterId];
    const scoutId = "unit_player_1_scout";
    expect(node).toBeDefined();
    expect(harvester?.kind).toBe("unit");
    if (!node || !harvester || harvester.kind !== "unit") {
      throw new Error("Expected node and harvester.");
    }

    harvester.coord = { ...node.coord };

    const badPhase = dispatchCommand(state, {
      type: "HARVEST_NODE",
      playerId: "player_1",
      entityId: harvesterId,
      nodeId,
    });
    expect(expectRejected(badPhase)).toContain("tactical phase");

    advanceToTactical(state);
    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: harvesterId,
    });

    const uncontrolledNode = dispatchCommand(state, {
      type: "HARVEST_NODE",
      playerId: "player_1",
      entityId: harvesterId,
      nodeId,
    });
    expect(expectRejected(uncontrolledNode)).toContain("controlled");

    node.controlledBy = "player_1";
    const wrongRole = dispatchCommand(state, {
      type: "HARVEST_NODE",
      playerId: "player_1",
      entityId: scoutId,
      nodeId,
    });
    expect(expectRejected(wrongRole)).toContain("resource units");

    const wrongOccupancy = dispatchCommand(state, {
      type: "HARVEST_NODE",
      playerId: "player_1",
      entityId: harvesterId,
      nodeId: "frontier_flux_north",
    });
    expect(expectRejected(wrongOccupancy)).toContain("occupy");
  });

  it("deposits only from base-adjacent loaded harvesters when entering economy", () => {
    const state = setupState();
    const harvesterId = "unit_player_1_harvester";
    const harvester = state.entities[harvesterId];
    expect(harvester?.kind).toBe("unit");
    if (!harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 harvester.");
    }

    harvester.carries = "alloy";
    harvester.coord = { q: -3, r: 0 };
    const beforeAlloy = state.players.player_1.resources.alloy;

    const economyStep = dispatchCommand(state, {
      type: "END_PHASE",
      playerId: "player_1",
    });
    expect(economyStep.ok).toBe(true);
    expect(state.phase).toBe("economy");
    expect(state.players.player_1.resources.alloy).toBe(beforeAlloy + 1);
    const afterDeposit = state.entities[harvesterId];
    expect(afterDeposit?.kind).toBe("unit");
    if (!afterDeposit || afterDeposit.kind !== "unit") {
      throw new Error("Expected harvester after deposit.");
    }
    expect(afterDeposit.carries).toBeNull();

    const stateFar = setupState();
    const farHarvester = stateFar.entities[harvesterId];
    expect(farHarvester?.kind).toBe("unit");
    if (!farHarvester || farHarvester.kind !== "unit") {
      throw new Error("Expected far harvester.");
    }
    farHarvester.carries = "flux";
    farHarvester.coord = { q: -1, r: 0 };

    const farEconomyStep = dispatchCommand(stateFar, {
      type: "END_PHASE",
      playerId: "player_1",
    });
    expect(farEconomyStep.ok).toBe(true);
    expect(stateFar.players.player_1.resources.flux).toBe(0);
    const stillLoaded = stateFar.entities[harvesterId];
    expect(stillLoaded?.kind).toBe("unit");
    if (!stillLoaded || stillLoaded.kind !== "unit") {
      throw new Error("Expected still-loaded harvester.");
    }
    expect(stillLoaded.carries).toBe("flux");
  });

  it("deposits two credits from a loaded credits harvester", () => {
    const state = setupState();
    const harvester = state.entities.unit_player_1_harvester;
    expect(harvester?.kind).toBe("unit");
    if (!harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 harvester.");
    }

    harvester.carries = "credits";
    harvester.coord = { q: -3, r: 0 };
    const beforeCredits = state.players.player_1.resources.credits;

    const economyStep = dispatchCommand(state, {
      type: "END_PHASE",
      playerId: "player_1",
    });

    expect(economyStep.ok).toBe(true);
    expect(state.phase).toBe("economy");
    expect(state.players.player_1.resources.credits).toBe(beforeCredits + 2);
  });

  it("loses cargo when a loaded harvester is destroyed", () => {
    const state = setupState();
    const attacker = state.entities.unit_player_1_scout;
    const target = state.entities.unit_player_2_harvester;
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit") {
      throw new Error("Expected attacker and loaded target harvester.");
    }

    attacker.coord = { q: 0, r: 0 };
    attacker.attackDamage = 10;
    target.coord = { q: 1, r: 0 };
    target.hp = 2;
    target.carries = "biomass";

    advanceToTactical(state);
    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: attacker.id,
    });

    const attack = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId: attacker.id,
      targetId: target.id,
    });
    expect(attack.ok).toBe(true);
    expect(state.entities[target.id]).toBeUndefined();
    expect(state.log.some((entry) => entry.text.includes("cargo lost"))).toBe(true);
  });

  it("rejects END_PHASE from non-active player", () => {
    const state = setupState();
    const result = dispatchCommand(state, {
      type: "END_PHASE",
      playerId: "player_2",
    });

    expect(expectRejected(result)).toContain("active player");
  });

  it("tracks priority passing and resolves top stack item after both players pass", () => {
    const state = setupState();

    const pushResult = dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_1",
      label: "Debug stack effect",
      effectId: "noop_log",
    });
    expect(pushResult.ok).toBe(true);
    expect(state.stack.length).toBe(1);
    expect(state.priorityPlayerId).toBe("player_2");
    expect(state.consecutivePriorityPasses).toBe(0);

    const passOne = dispatchCommand(state, {
      type: "PASS_PRIORITY",
      playerId: "player_2",
    });
    expect(passOne.ok).toBe(true);
    expect(state.stack.length).toBe(1);
    expect(state.priorityPlayerId).toBe("player_1");
    expect(state.consecutivePriorityPasses).toBe(1);

    const passTwo = dispatchCommand(state, {
      type: "PASS_PRIORITY",
      playerId: "player_1",
    });
    expect(passTwo.ok).toBe(true);
    expect(state.stack.length).toBe(0);
    expect(state.priorityPlayerId).toBe("player_1");
    expect(state.consecutivePriorityPasses).toBe(0);
  });

  it("rejects pass/respond commands from non-priority player", () => {
    const state = setupState();

    const passReject = dispatchCommand(state, {
      type: "PASS_PRIORITY",
      playerId: "player_2",
    });
    expect(expectRejected(passReject)).toContain("priority player");

    const respondReject = dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_2",
      label: "Should fail",
      effectId: "noop_log",
    });
    expect(expectRejected(respondReject)).toContain("priority player");
  });

  it("rejects unknown stack effect ids via runtime validation", () => {
    const state = setupState();
    const unknownEffect = dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_1",
      label: "Unknown",
      effectId: "custom.future.effect",
    });

    expect(expectRejected(unknownEffect)).toContain("Unknown stack effect");
  });

  it("resolves damage stack effect against enemy base", () => {
    const state = setupState();
    const targetBase = state.entities.base_player_2;
    expect(targetBase?.kind).toBe("base");
    if (!targetBase || targetBase.kind !== "base") {
      throw new Error("Expected enemy base.");
    }

    const beforeHp = targetBase.hp;
    dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_1",
      label: "Orbital Ping",
      effectId: "damage_enemy_base_2",
    });
    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_2" });
    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_1" });

    const afterBase = state.entities.base_player_2;
    expect(afterBase?.kind).toBe("base");
    if (!afterBase || afterBase.kind !== "base") {
      throw new Error("Expected enemy base after stack resolve.");
    }
    expect(afterBase.hp).toBe(beforeHp - 2);
  });

  it("resolves counter stack effect by removing the top pending stack item", () => {
    const state = setupState();

    dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_1",
      label: "Orbital Ping",
      effectId: "damage_enemy_base_2",
    });
    const pingId = state.stack[0]?.id;
    expect(pingId).toBeDefined();
    dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_2",
      label: "Counter Pulse",
      effectId: "counter_top_item",
      targetStackItemId: pingId,
    });
    expect(state.stack).toHaveLength(2);

    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_1" });
    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_2" });

    expect(state.stack).toHaveLength(0);
    const counteredTargetBase = state.entities.base_player_2;
    expect(counteredTargetBase?.kind).toBe("base");
    if (!counteredTargetBase || counteredTargetBase.kind !== "base") {
      throw new Error("Expected player 2 base.");
    }
    expect(counteredTargetBase.hp).toBe(BASE_STARTING_HP);
  });

  it("rejects counter responses without a legal top-of-stack target id", () => {
    const state = setupState();

    const noTarget = dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_1",
      label: "Counter Pulse",
      effectId: "counter_top_item",
    });
    expect(expectRejected(noTarget)).toContain("requires a target");

    dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_1",
      label: "Orbital Ping",
      effectId: "damage_enemy_base_2",
    });
    const topId = state.stack[0]?.id;
    expect(topId).toBeDefined();

    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_2" });
    const staleTarget = dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_1",
      label: "Counter Pulse",
      effectId: "counter_top_item",
      targetStackItemId: "not_real",
    });
    expect(expectRejected(staleTarget)).toContain("top stack item");

    const wrongEffectWithTarget = dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_1",
      label: "Ping with target",
      effectId: "damage_enemy_base_2",
      targetStackItemId: topId,
    });
    expect(expectRejected(wrongEffectWithTarget)).toContain("does not accept");
  });

  it("rejects countering uncounterable stack items", () => {
    const state = setupState();

    dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_1",
      label: "Debug No-op",
      effectId: "noop_log",
    });
    const topId = state.stack[0]?.id;
    expect(topId).toBeDefined();

    const uncounterable = dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_2",
      label: "Counter Pulse",
      effectId: "counter_top_item",
      targetStackItemId: topId,
    });
    expect(expectRejected(uncounterable)).toContain("uncounterable");
  });

  it("stack damage can set winner and lock further commands", () => {
    const state = setupState();
    const targetBase = state.entities.base_player_2;
    expect(targetBase?.kind).toBe("base");
    if (!targetBase || targetBase.kind !== "base") {
      throw new Error("Expected enemy base.");
    }
    targetBase.hp = 2;

    dispatchCommand(state, {
      type: "RESPOND_STACK",
      playerId: "player_1",
      label: "Orbital Ping",
      effectId: "damage_enemy_base_2",
    });
    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_2" });
    dispatchCommand(state, { type: "PASS_PRIORITY", playerId: "player_1" });

    expect(state.winner).toBe("player_1");
    const afterBase = state.entities.base_player_2;
    expect(afterBase?.kind).toBe("base");
    if (!afterBase || afterBase.kind !== "base") {
      throw new Error("Expected enemy base.");
    }
    expect(afterBase.hp).toBe(0);

    const rejectedAfterWin = dispatchCommand(state, {
      type: "END_PHASE",
      playerId: "player_1",
    });
    expect(expectRejected(rejectedAfterWin)).toContain("already over");
  });

  it("remains deterministic with mixed valid/invalid stack counter interactions", () => {
    const runStream = () => {
      const state = setupState();
      dispatchCommand(state, {
        type: "RESPOND_STACK",
        playerId: "player_1",
        label: "Orbital Ping",
        effectId: "damage_enemy_base_2",
      });
      dispatchCommand(state, {
        type: "RESPOND_STACK",
        playerId: "player_1",
        label: "Bad Counter",
        effectId: "counter_top_item",
      });

      const targetId = state.stack[0]?.id;
      expect(targetId).toBeDefined();

      dispatchCommand(state, {
        type: "PASS_PRIORITY",
        playerId: "player_2",
      });
      dispatchCommand(state, {
        type: "RESPOND_STACK",
        playerId: "player_1",
        label: "Counter Pulse",
        effectId: "counter_top_item",
        targetStackItemId: targetId!,
      });
      dispatchCommand(state, {
        type: "PASS_PRIORITY",
        playerId: "player_2",
      });
      dispatchCommand(state, {
        type: "PASS_PRIORITY",
        playerId: "player_1",
      });
      dispatchCommand(state, {
        type: "PASS_PRIORITY",
        playerId: "player_2",
      });
      dispatchCommand(state, {
        type: "PASS_PRIORITY",
        playerId: "player_1",
      });
      return state;
    };

    const stateA = runStream();
    const stateB = runStream();
    expect(stateA).toEqual(stateB);
  });
});
