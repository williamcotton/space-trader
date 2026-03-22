import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { createInitialGameState } from "../model/state";
import { getAutoFlowCommand } from "./autoFlow";

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

describe("getAutoFlowCommand", () => {
  it("auto-advances out of main when the active player has no playable cards", () => {
    const state = setupState();
    state.phase = "main";
    state.priorityPlayerId = "player_1";
    state.zones.player_1.hand = [];

    expect(getAutoFlowCommand(state)).toEqual({
      type: "END_PHASE",
      playerId: "player_1",
    });
  });

  it("does not auto-advance out of main when a playable card exists", () => {
    const state = setupState();
    state.phase = "main";
    state.priorityPlayerId = "player_1";
    state.zones.player_1.hand = [];
    moveCardFromDeckToHand(state, "player_1", "slag_barrage");
    state.players.player_1.resources.credits = 4;
    state.players.player_1.resources.alloy = 4;

    expect(getAutoFlowCommand(state)).toBeNull();
  });

  it("auto-advances out of tactical when the active player has no remaining actions", () => {
    const state = setupState();
    state.phase = "tactical";
    state.priorityPlayerId = "player_1";

    const scout = state.entities.unit_player_1_scout;
    const harvester = state.entities.unit_player_1_harvester;
    if (!scout || scout.kind !== "unit" || !harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 units.");
    }

    scout.movesRemaining = 0;
    scout.attacksRemaining = 0;
    harvester.movesRemaining = 0;
    harvester.attacksRemaining = 0;
    harvester.carries = "alloy";

    expect(getAutoFlowCommand(state)).toEqual({
      type: "END_PHASE",
      playerId: "player_1",
    });
  });

  it("does not auto-advance out of tactical while a tracked harvest opportunity remains unresolved", () => {
    const state = setupState();
    state.phase = "tactical";
    state.priorityPlayerId = "player_1";

    const scout = state.entities.unit_player_1_scout;
    const harvester = state.entities.unit_player_1_harvester;
    if (!scout || scout.kind !== "unit" || !harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 units.");
    }

    scout.movesRemaining = 0;
    scout.attacksRemaining = 0;
    harvester.movesRemaining = 0;
    harvester.attacksRemaining = 0;
    harvester.carries = null;
    state.tacticalHarvestEligibleUnitIds = [harvester.id];
    state.tacticalHarvestedUnitIds = [];

    expect(getAutoFlowCommand(state)).toBeNull();
  });

  it("waits for all tracked harvests before auto-advancing out of tactical", () => {
    const state = setupState();
    state.phase = "tactical";
    state.priorityPlayerId = "player_1";

    const scout = state.entities.unit_player_1_scout;
    const harvester = state.entities.unit_player_1_harvester;
    const extraHarvester = state.entities.unit_player_2_harvester;
    if (!scout || scout.kind !== "unit" || !harvester || harvester.kind !== "unit" || !extraHarvester || extraHarvester.kind !== "unit") {
      throw new Error("Expected initial harvesters.");
    }

    extraHarvester.id = "unit_player_1_harvester_extra";
    extraHarvester.ownerId = "player_1";
    state.entities[extraHarvester.id] = extraHarvester;
    delete state.entities.unit_player_2_harvester;

    scout.movesRemaining = 0;
    scout.attacksRemaining = 0;
    harvester.movesRemaining = 0;
    harvester.attacksRemaining = 0;
    harvester.carries = null;
    extraHarvester.movesRemaining = 0;
    extraHarvester.attacksRemaining = 0;
    extraHarvester.carries = null;
    state.tacticalHarvestEligibleUnitIds = [harvester.id, extraHarvester.id];
    state.tacticalHarvestedUnitIds = [harvester.id];

    expect(getAutoFlowCommand(state)).toBeNull();

    state.tacticalHarvestedUnitIds = [harvester.id, extraHarvester.id];

    expect(getAutoFlowCommand(state)).toEqual({
      type: "END_PHASE",
      playerId: "player_1",
    });
  });

  it("does not auto-advance out of tactical when any unit can still act", () => {
    const state = setupState();
    state.phase = "tactical";
    state.priorityPlayerId = "player_1";

    expect(getAutoFlowCommand(state)).toBeNull();
  });

  it("auto-passes priority on stack when no response card can be played", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_2";
    state.phase = "main";
    state.stack.push({
      id: "stack_1",
      label: "Frontline Scout",
      controllerId: "player_1",
      ownerId: "player_1",
      effectId: "deploy_unit_card",
      effectMagnitude: 0,
      targetStackItemId: null,
      objectKind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
      sourceCardInstanceId: "player_1_card_1",
      sourceCardId: "frontline_scout_card",
      sourceCardOwnerId: "player_1",
      pendingUnitEntityId: "unit_test",
    });
    state.zones.player_2.hand = [];

    expect(getAutoFlowCommand(state)).toEqual({
      type: "PASS_PRIORITY",
      playerId: "player_2",
    });
  });

  it("does not auto-pass priority when the priority player has a legal response", () => {
    const state = setupState();
    state.activePlayerId = "player_1";
    state.priorityPlayerId = "player_2";
    state.phase = "main";
    state.stack.push({
      id: "stack_1",
      label: "Frontline Scout",
      controllerId: "player_1",
      ownerId: "player_1",
      effectId: "deploy_unit_card",
      effectMagnitude: 0,
      targetStackItemId: null,
      objectKind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
      sourceCardInstanceId: "player_1_card_1",
      sourceCardId: "frontline_scout_card",
      sourceCardOwnerId: "player_1",
      pendingUnitEntityId: "unit_test",
    });
    state.zones.player_2.hand = [];
    moveCardFromDeckToHand(state, "player_2", "null_intercept");
    state.players.player_2.resources.credits = 4;

    expect(getAutoFlowCommand(state)).toBeNull();
  });
});
