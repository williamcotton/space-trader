import { describe, expect, it } from "vitest";
import { getCardDefinition, type UnitCardDefinition } from "../content/cards/catalog";
import { requireMapDefinition } from "../content/maps/catalog";
import { getBloomedUnitIdsThisTurn, getLastBloomSourceItemId, getLastBloomedUnitIds } from "../content/sets/alpha/mechanics/bloom";
import { getSalvageTriggersThisTurn } from "../content/sets/alpha/mechanics/salvage";
import { getTacticsCastThisTurn } from "../content/sets/alpha/mechanics/surge";
import { getStarterDeckCardIds } from "../content/decks/starterDecks";
import {
  DEFAULT_GAME_RULES,
  OPENING_HAND_SIZE,
  PLAYER_ONE_STARTING_CURRENCY,
  PLAYER_TWO_STARTING_CURRENCY,
  STARTING_PRIMARY_RESOURCE,
  createInitialGameState,
  createInitialZonesForPlayer,
} from "./state";

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("createInitialZonesForPlayer", () => {
  it("keeps starter deck order stable when no random source is provided", () => {
    const zones = createInitialZonesForPlayer("player_1", "alloy_clan");
    const orderedCardIds = [...zones.hand, ...zones.deck].map((card) => card.cardId);

    expect(orderedCardIds).toEqual(getStarterDeckCardIds("alloy_clan"));
    expect(zones.hand).toHaveLength(OPENING_HAND_SIZE);
    expect(zones.deck).toHaveLength(60 - OPENING_HAND_SIZE);
  });

  it("shuffles starter deck order when a random source is provided", () => {
    const zonesA = createInitialZonesForPlayer("player_1", "alloy_clan", OPENING_HAND_SIZE, createSeededRandom(12345));
    const zonesB = createInitialZonesForPlayer("player_1", "alloy_clan", OPENING_HAND_SIZE, createSeededRandom(12345));
    const shuffledOrderA = [...zonesA.hand, ...zonesA.deck].map((card) => card.cardId);
    const shuffledOrderB = [...zonesB.hand, ...zonesB.deck].map((card) => card.cardId);

    expect(shuffledOrderA).toEqual(shuffledOrderB);
    expect(shuffledOrderA).not.toEqual(getStarterDeckCardIds("alloy_clan"));
  });
});

describe("createInitialGameState", () => {
  it("uses the tuned asymmetric starting resources", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });

    expect(state.players.player_1.resources).toEqual({
      credits: PLAYER_ONE_STARTING_CURRENCY,
      alloy: STARTING_PRIMARY_RESOURCE,
      flux: 0,
      biomass: 0,
    });
    expect(state.players.player_2.resources).toEqual({
      credits: PLAYER_TWO_STARTING_CURRENCY,
      alloy: 0,
      flux: STARTING_PRIMARY_RESOURCE,
      biomass: 0,
    });
    expect(getTacticsCastThisTurn(state, "player_1")).toBe(0);
    expect(getTacticsCastThisTurn(state, "player_2")).toBe(0);
    expect(getBloomedUnitIdsThisTurn(state)).toEqual([]);
    expect(getLastBloomSourceItemId(state)).toBeNull();
    expect(getLastBloomedUnitIds(state)).toEqual([]);
    expect(getSalvageTriggersThisTurn(state, "player_1")).toBe(0);
    expect(getSalvageTriggersThisTurn(state, "player_2")).toBe(0);
  });

  it("derives match metadata from registered content instead of hardcoded map strings", () => {
    const state = createInitialGameState({});

    expect(state.map.id).toBe("frontier_belt");
    expect(state.matchId).toBe("match_alpha");
    expect(state.log[0]?.text).toBe(`Match initialized on ${state.map.name}.`);
  });

  it("hydrates starting unit keywords from source card definitions", () => {
    const scoutCard = getCardDefinition("frontline_scout_card") as UnitCardDefinition;
    const original = scoutCard.unit.keywords;
    scoutCard.unit.keywords = ["ambush"];

    try {
      const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
      const scout = state.entities.unit_player_1_scout;
      expect(scout?.kind).toBe("unit");
      if (!scout || scout.kind !== "unit") {
        throw new Error("Expected starting scout unit.");
      }
      expect(scout.keywords).toEqual(["ambush"]);
    } finally {
      scoutCard.unit.keywords = original;
    }
  });

  it("uses the live economy defaults for deposits and resource harvester movement", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });

    expect(state.rules).toEqual(DEFAULT_GAME_RULES);
    const harvester = state.entities.unit_player_1_harvester;
    expect(harvester?.kind).toBe("unit");
    if (!harvester || harvester.kind !== "unit") {
      throw new Error("Expected player 1 harvester.");
    }
    expect(harvester.moveRange).toBe(4);
    expect(harvester.movesRemaining).toBe(4);
  });

  it("hydrates starting harvester movement from the expedition harvester card definition", () => {
    const harvesterCard = getCardDefinition("expedition_harvester_card") as UnitCardDefinition;
    const originalMoveRange = harvesterCard.unit.moveRange;
    harvesterCard.unit.moveRange = 4;

    try {
      const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
      const harvester = state.entities.unit_player_1_harvester;
      expect(harvester?.kind).toBe("unit");
      if (!harvester || harvester.kind !== "unit") {
        throw new Error("Expected player 1 harvester.");
      }
      expect(harvester.moveRange).toBe(4);
      expect(harvester.movesRemaining).toBe(4);
    } finally {
      harvesterCard.unit.moveRange = originalMoveRange;
    }
  });
});
