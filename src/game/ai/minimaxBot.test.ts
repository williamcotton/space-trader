import { describe, expect, it } from "vitest";
import { dispatchCommand } from "../actions/reducers";
import { requireMapDefinition } from "../content/maps/catalog";
import { hexDistance } from "../model/hex";
import { createInitialGameState } from "../model/state";
import { decideMinimaxBotCommand } from "./minimaxBot";

function setupState() {
  return createInitialGameState({ map: requireMapDefinition("frontier_belt") });
}

function endCurrentPhase(state: ReturnType<typeof setupState>) {
  const startingTurn = state.turn;
  const startingPhase = state.phase;
  const startingActivePlayerId = state.activePlayerId;
  const result = dispatchCommand(state, {
    type: "END_PHASE",
    playerId: state.activePlayerId,
  });
  expect(result.ok).toBe(true);

  let guard = 0;
  while (
    guard < 12 &&
    state.turn === startingTurn &&
    state.phase === startingPhase &&
    state.activePlayerId === startingActivePlayerId
  ) {
    const priorityPlayerId = state.priorityPlayerId;
    if (!priorityPlayerId) {
      throw new Error("Expected priority player while ending phase in minimax test.");
    }
    const passResult = dispatchCommand(state, {
      type: "PASS_PRIORITY",
      playerId: priorityPlayerId,
    });
    expect(passResult.ok).toBe(true);
    guard += 1;
  }
}

function advanceToPhase(state: ReturnType<typeof setupState>, phase: ReturnType<typeof setupState>["phase"]): void {
  let guard = 0;
  while (state.phase !== phase && guard < 16) {
    endCurrentPhase(state);
    guard += 1;
  }
}

function advanceToTactical(state: ReturnType<typeof setupState>): void {
  advanceToPhase(state, "tactical");
}

function keepOnlyEntities(state: ReturnType<typeof setupState>, ids: string[]): void {
  for (const entityId of Object.keys(state.entities)) {
    if (!ids.includes(entityId)) {
      delete state.entities[entityId];
    }
  }
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

describe("decideMinimaxBotCommand", () => {
  it("returns SELECT_ENTITY first when the best line is an immediate attack", () => {
    const state = setupState();
    advanceToTactical(state);

    keepOnlyEntities(state, [
      state.players.player_1.baseEntityId,
      state.players.player_2.baseEntityId,
      "unit_player_1_scout",
      "unit_player_2_harvester",
    ]);

    const attacker = state.entities.unit_player_1_scout;
    const target = state.entities.unit_player_2_harvester;
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit") {
      throw new Error("Expected tactical units for minimax test.");
    }

    attacker.coord = { q: 0, r: 0 };
    attacker.hasSummoningSickness = false;
    attacker.attacksRemaining = 1;
    attacker.movesRemaining = 0;
    target.coord = { q: 1, r: 0 };
    state.selectedEntityId = null;
    state.priorityPlayerId = "player_1";

    const first = decideMinimaxBotCommand(state, "player_1");
    expect(first).toEqual({
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: "unit_player_1_scout",
    });

    const selectResult = dispatchCommand(state, first!);
    expect(selectResult.ok).toBe(true);

    const second = decideMinimaxBotCommand(state, "player_1");
    expect(second).toEqual({
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId: "unit_player_1_scout",
      targetId: "unit_player_2_harvester",
    });
  });

  it("sees a move as good when it sets up the next attack", () => {
    const state = setupState();
    advanceToTactical(state);

    keepOnlyEntities(state, [
      state.players.player_1.baseEntityId,
      state.players.player_2.baseEntityId,
      "unit_player_1_scout",
      "unit_player_2_harvester",
    ]);

    const attacker = state.entities.unit_player_1_scout;
    const target = state.entities.unit_player_2_harvester;
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit") {
      throw new Error("Expected tactical units for minimax continuation test.");
    }

    attacker.coord = { q: 0, r: 0 };
    attacker.hasSummoningSickness = false;
    attacker.attacksRemaining = 1;
    attacker.movesRemaining = 2;
    target.coord = { q: 3, r: 0 };
    state.selectedEntityId = null;
    state.priorityPlayerId = "player_1";

    const first = decideMinimaxBotCommand(state, "player_1");
    expect(first).toEqual({
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: "unit_player_1_scout",
    });

    const selectResult = dispatchCommand(state, first!);
    expect(selectResult.ok).toBe(true);

    const second = decideMinimaxBotCommand(state, "player_1");
    expect(second).toEqual({
      type: "MOVE_UNIT",
      playerId: "player_1",
      entityId: "unit_player_1_scout",
      to: { q: 2, r: 0 },
    });

    const moveResult = dispatchCommand(state, second!);
    expect(moveResult.ok).toBe(true);

    const third = decideMinimaxBotCommand(state, "player_1");
    expect(third).toEqual({
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId: "unit_player_1_scout",
      targetId: "unit_player_2_harvester",
    });
  });

  it("does not path toward off-faction resources when hand pressure is empty", () => {
    const state = setupState();
    advanceToTactical(state);
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
    state.stack = [];

    state.zones.player_1.hand = [];
    state.players.player_1.resources.credits = 5;
    state.players.player_1.resources.alloy = 5;
    state.players.player_1.resources.flux = 0;
    state.players.player_1.resources.biomass = 0;

    const harvester = state.entities.unit_player_1_harvester;
    expect(harvester?.kind).toBe("unit");
    if (!harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 harvester for minimax resource test.");
    }

    harvester.coord = { q: -4, r: 1 };
    harvester.movesRemaining = 2;
    harvester.hasSummoningSickness = false;
    harvester.carries = null;
    state.selectedEntityId = harvester.id;

    const command = decideMinimaxBotCommand(state, "player_1");
    expect(command?.type).toBe("MOVE_UNIT");
    if (!command || command.type !== "MOVE_UNIT") {
      throw new Error("Expected minimax harvester movement command.");
    }

    expect(command.to).not.toEqual({ q: -4, r: 0 });
  });

  it("skips harvesting a wrong resource even when standing on a controlled node", () => {
    const state = setupState();
    advanceToTactical(state);
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_1";
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

    const scout = state.entities.unit_player_1_scout;
    expect(scout?.kind).toBe("unit");
    if (!scout || scout.kind !== "unit") {
      throw new Error("Expected player 1 scout for minimax harvest test.");
    }
    scout.movesRemaining = 0;
    scout.attacksRemaining = 0;
    scout.hasSummoningSickness = true;

    const harvester = state.entities.unit_player_1_harvester;
    expect(harvester?.kind).toBe("unit");
    if (!harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 harvester for minimax harvest test.");
    }

    harvester.coord = { ...biomassNode.coord };
    harvester.movesRemaining = 2;
    harvester.hasSummoningSickness = false;
    harvester.carries = null;
    state.selectedEntityId = harvester.id;

    const command = decideMinimaxBotCommand(state, "player_1");
    expect(command?.type).not.toBe("HARVEST_NODE");
    if (command?.type === "MOVE_UNIT") {
      expect(command.to).toEqual({ q: -3, r: 1 });
    }
  });

  it("plays an affordable combat unit in main phase when the board needs one", () => {
    const state = setupState();
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    state.phase = "main";
    state.stack = [];
    state.zones.player_2.hand = [];

    delete state.entities.unit_player_2_scout;
    moveCardFromDeckToHand(state, "player_2", "echo_recall");
    const combatUnitInstanceId = moveCardFromDeckToHand(state, "player_2", "flux_runner_card");

    state.players.player_2.resources.credits = 3;
    state.players.player_2.resources.flux = 1;
    state.players.player_2.resources.alloy = 0;
    state.players.player_2.resources.biomass = 0;

    const command = decideMinimaxBotCommand(state, "player_2");
    expect(command).toEqual({
      type: "PLAY_CARD",
      playerId: "player_2",
      cardInstanceId: combatUnitInstanceId,
    });
  });

  it("moves toward the nearest enemy base in a four-player tactical state", () => {
    const state = createInitialGameState({
      runtimeProfileId: "alpha_four_player",
      randomSource: () => 0.6,
    });
    state.phase = "tactical";
    state.activePlayerId = "player_3";
    state.priorityPlayerId = "player_3";
    state.stack = [];

    for (const entityId of Object.keys(state.entities)) {
      const entity = state.entities[entityId];
      if (entity?.kind === "unit" && entityId !== "unit_player_3_scout") {
        delete state.entities[entityId];
      }
    }

    const attacker = state.entities.unit_player_3_scout;
    const nearestBase = state.entities[state.players.player_4.baseEntityId];
    expect(attacker?.kind).toBe("unit");
    expect(nearestBase?.kind).toBe("base");
    if (!attacker || attacker.kind !== "unit" || !nearestBase || nearestBase.kind !== "base") {
      throw new Error("Expected four-player tactical entities.");
    }

    attacker.coord = { q: nearestBase.coord.q, r: nearestBase.coord.r - 2 };
    attacker.movesRemaining = 1;
    attacker.attacksRemaining = 0;
    attacker.hasSummoningSickness = false;
    state.selectedEntityId = attacker.id;

    const command = decideMinimaxBotCommand(state, "player_3");
    expect(command?.type).toBe("MOVE_UNIT");
    if (!command || command.type !== "MOVE_UNIT") {
      throw new Error("Expected four-player minimax movement command.");
    }

    expect(hexDistance(command.to, nearestBase.coord)).toBe(1);
  });
});
