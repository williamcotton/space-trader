import { describe, expect, it } from "vitest";
import { requireMapDefinition } from "../content/maps/catalog";
import { getBloomedUnitIdsThisTurn, getLastBloomedUnitIds, setLastBloomSourceItemId } from "../content/sets/base/mechanics/bloom";
import { getSalvageTriggersThisTurn, incrementSalvageTriggersThisTurn } from "../content/sets/base/mechanics/salvage";
import { createInitialGameState } from "../model/state";
import { advancePhase } from "./phaseMachine";

function moveTopCardFromDeckToHand(state: ReturnType<typeof createInitialGameState>, playerId: "player_1" | "player_2"): void {
  const card = state.zones[playerId].deck.shift();
  if (!card) {
    throw new Error(`Expected a card in deck for ${playerId}.`);
  }

  state.zones[playerId].hand.push(card);
}

describe("phaseMachine", () => {
  it("advances through all phases in order", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });

    expect(state.phase).toBe("start");
    advancePhase(state);
    expect(state.phase).toBe("economy");
    advancePhase(state);
    expect(state.phase).toBe("main");
    advancePhase(state);
    expect(state.phase).toBe("tactical");
    advancePhase(state);
    expect(state.phase).toBe("end");
  });

  it("rolls to next turn and swaps active player after end phase", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });

    expect(state.turn).toBe(1);
    expect(state.activePlayerId).toBe("player_1");

    advancePhase(state); // economy
    advancePhase(state); // main
    advancePhase(state); // tactical
    advancePhase(state); // end
    advancePhase(state); // start, next turn

    expect(state.phase).toBe("start");
    expect(state.turn).toBe(2);
    expect(state.activePlayerId).toBe("player_2");
    expect(state.priorityPlayerId).toBe("player_2");
  });

  it("enters discard phase after end when the active player is above the soft cap", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });

    moveTopCardFromDeckToHand(state, "player_1");
    moveTopCardFromDeckToHand(state, "player_1");
    moveTopCardFromDeckToHand(state, "player_1");

    advancePhase(state); // economy
    advancePhase(state); // main
    advancePhase(state); // tactical
    advancePhase(state); // end
    advancePhase(state); // discard

    expect(state.phase).toBe("discard");
    expect(state.turn).toBe(1);
    expect(state.activePlayerId).toBe("player_1");
  });

  it("resets unit move/attack budgets for new active player on turn handoff", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const unitId = "unit_player_2_scout";
    const unit = state.entities[unitId];
    expect(unit?.kind).toBe("unit");
    if (!unit || unit.kind !== "unit") {
      throw new Error("Expected player 2 unit.");
    }

    unit.movesRemaining = 0;
    unit.attacksRemaining = 0;
    unit.hasSummoningSickness = true;

    advancePhase(state); // economy
    advancePhase(state); // main
    advancePhase(state); // tactical
    advancePhase(state); // end
    advancePhase(state); // start, next turn

    const updated = state.entities[unitId];
    expect(updated?.kind).toBe("unit");
    if (!updated || updated.kind !== "unit") {
      throw new Error("Expected player 2 unit after turn handoff.");
    }

    expect(updated.movesRemaining).toBe(updated.moveRange);
    expect(updated.attacksRemaining).toBe(updated.attackActionsPerTurn);
    expect(updated.hasSummoningSickness).toBe(false);
  });

  it("clears bloom tracking on turn handoff", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    getBloomedUnitIdsThisTurn(state).push("unit_player_1_test_bloom");
    setLastBloomSourceItemId(state, "stack_test_bloom");
    getLastBloomedUnitIds(state).push("unit_player_1_test_bloom");
    incrementSalvageTriggersThisTurn(state, "player_1");
    incrementSalvageTriggersThisTurn(state, "player_1");

    advancePhase(state); // economy
    advancePhase(state); // main
    advancePhase(state); // tactical
    advancePhase(state); // end
    advancePhase(state); // start, next turn

    expect(getBloomedUnitIdsThisTurn(state)).toEqual([]);
    expect(getLastBloomedUnitIds(state)).toEqual([]);
    expect(getSalvageTriggersThisTurn(state, "player_1")).toBe(0);
    expect(getSalvageTriggersThisTurn(state, "player_2")).toBe(0);
  });
});
