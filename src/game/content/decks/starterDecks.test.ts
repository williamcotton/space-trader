import { describe, expect, it } from "vitest";
import { getStarterDeckCardIds, validateDeckCardIds } from "./starterDecks";

describe("starter decks", () => {
  it("builds valid 60-card starter decks for each faction", () => {
    for (const faction of ["alloy_clan", "flux_collective", "biomass_swarm"] as const) {
      const cards = getStarterDeckCardIds(faction);
      expect(cards).toHaveLength(60);
      expect(validateDeckCardIds(cards)).toEqual([]);
    }
  });

  it("rejects unknown ids and copy-limit violations", () => {
    const invalidDeck = [
      "orbital_ping",
      "orbital_ping",
      "orbital_ping",
      "orbital_ping",
      "orbital_ping",
      ...Array.from({ length: 55 }, () => "unknown_card"),
    ];

    const errors = validateDeckCardIds(invalidDeck);
    expect(errors.some((entry) => entry.includes("unknown card id"))).toBe(true);
    expect(errors.some((entry) => entry.includes("copy limit"))).toBe(true);
  });
});
