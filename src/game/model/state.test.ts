import { describe, expect, it } from "vitest";
import { getStarterDeckCardIds } from "../content/decks/starterDecks";
import { OPENING_HAND_SIZE, createInitialZonesForPlayer } from "./state";

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
