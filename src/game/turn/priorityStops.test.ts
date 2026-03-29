import { describe, expect, it } from "vitest";
import { requireMapDefinition } from "../content/maps/catalog";
import { createInitialGameState } from "../model/state";
import {
  createDefaultPlayerPriorityStopSettings,
  getPriorityStopWindow,
  type PlayerPriorityStopSettings,
} from "./priorityStops";

function createState() {
  return createInitialGameState({ map: requireMapDefinition("frontier_belt") });
}

function setHand(state: ReturnType<typeof createState>, playerId: "player_1" | "player_2", cardIds: string[]) {
  state.zones[playerId].hand = cardIds.map((cardId, index) => ({
    instanceId: `${playerId}_${cardId}_${index + 1}`,
    cardId,
    ownerId: playerId,
  }));
}

function createBotMap(player1Bot: boolean, player2Bot: boolean) {
  return {
    player_1: player1Bot,
    player_2: player2Bot,
  } as const;
}

describe("getPriorityStopWindow", () => {
  it("yields opponent main priority to a human player when configured", () => {
    const state = createState();
    state.turn = 2;
    state.phase = "main";
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    setHand(state, "player_1", ["slag_barrage"]);
    state.players.player_1.resources.credits = 3;
    state.players.player_1.resources.alloy = 2;

    const settings = createDefaultPlayerPriorityStopSettings();
    const window = getPriorityStopWindow(state, createBotMap(false, true), settings);

    expect(window).toEqual({
      key: "opponentMain:2:main:player_2",
      priorityPlayerId: "player_2",
      yieldedToPlayerId: "player_1",
      stopKey: "opponentMain",
    });
  });

  it("yields bot stack priority to the human opponent when stack stops are enabled", () => {
    const state = createState();
    state.turn = 3;
    state.phase = "main";
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    setHand(state, "player_1", ["failsafe_redirect"]);
    state.players.player_1.resources.credits = 3;
    state.stack.push({
      id: "stack_3_9",
      label: "Test Spell",
      controllerId: "player_1",
      ownerId: "player_1",
      effectId: "damage_enemy_base_2",
      effectMagnitude: 2,
      targetStackItemId: null,
      targetEntityId: null,
      targetHex: null,
      objectKind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
      sourceCardInstanceId: "card_1",
      sourceCardId: "rivet_volley",
      sourceCardOwnerId: "player_1",
      pendingUnitEntityId: null,
    });

    const settings = createDefaultPlayerPriorityStopSettings();
    const window = getPriorityStopWindow(state, createBotMap(false, true), settings);

    expect(window).toEqual({
      key: "opponentStack:3:stack_3_9:player_2",
      priorityPlayerId: "player_2",
      yieldedToPlayerId: "player_1",
      stopKey: "opponentStack",
    });
  });

  it("does not yield priority when the opposing human disabled the relevant stop", () => {
    const state = createState();
    state.phase = "tactical";
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";

    const settings: PlayerPriorityStopSettings = createDefaultPlayerPriorityStopSettings();
    settings.player_1.opponentTactical = false;
    setHand(state, "player_1", ["brace_protocol"]);
    state.players.player_1.resources.credits = 3;
    state.players.player_1.resources.alloy = 2;

    expect(getPriorityStopWindow(state, createBotMap(false, true), settings)).toBeNull();
  });

  it("does not yield priority when the opposing player has no legal off-turn play", () => {
    const state = createState();
    state.phase = "main";
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";
    setHand(state, "player_1", ["frontline_scout_card"]);
    state.players.player_1.resources.credits = 5;
    state.players.player_1.resources.alloy = 5;

    const settings = createDefaultPlayerPriorityStopSettings();

    expect(getPriorityStopWindow(state, createBotMap(false, true), settings)).toBeNull();
  });
});
