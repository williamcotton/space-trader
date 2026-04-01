import { describe, expect, it } from "vitest";
import { dispatchCommand } from "../actions/reducers";
import { requireMapDefinition } from "../content/maps/catalog";
import { createInitialGameState } from "../model/state";
import { decideMinimaxBotCommand } from "./minimaxBot";

function setupState() {
  return createInitialGameState({ map: requireMapDefinition("frontier_belt") });
}

function advanceToPhase(state: ReturnType<typeof setupState>, phase: ReturnType<typeof setupState>["phase"]): void {
  let guard = 0;
  while (state.phase !== phase && guard < 16) {
    const result = dispatchCommand(state, {
      type: "END_PHASE",
      playerId: state.activePlayerId,
    });
    expect(result.ok).toBe(true);
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
});
