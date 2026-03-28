import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../cards/catalog";
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

  it("includes cheap resource harvester access in each starter deck", () => {
    for (const faction of ["alloy_clan", "flux_collective", "biomass_swarm"] as const) {
      const cards = getStarterDeckCardIds(faction);
      const expeditionHarvesters = cards.filter((cardId) => cardId === "expedition_harvester_card");
      expect(expeditionHarvesters).toHaveLength(4);
    }
  });

  it("includes the new cascade cards in the intended starters", () => {
    const alloyCards = getStarterDeckCardIds("alloy_clan");
    const fluxCards = getStarterDeckCardIds("flux_collective");
    const biomassCards = getStarterDeckCardIds("biomass_swarm");

    expect(alloyCards.filter((cardId) => cardId === "shrapnel_relay")).toHaveLength(4);
    expect(fluxCards.filter((cardId) => cardId === "ion_shower")).toHaveLength(4);
    expect(biomassCards.filter((cardId) => cardId === "spore_bloom")).toHaveLength(4);

    for (const cards of [alloyCards, fluxCards, biomassCards]) {
      expect(cards.filter((cardId) => cardId === "chain_beacon")).toHaveLength(4);
    }
  });

  it("surfaces updated on-pie faction tactics in alloy and flux starters", () => {
    const alloyCards = getStarterDeckCardIds("alloy_clan");
    const fluxCards = getStarterDeckCardIds("flux_collective");

    expect(alloyCards.filter((cardId) => cardId === "patchwork_barrier")).toHaveLength(4);
    expect(fluxCards.filter((cardId) => cardId === "orbital_ping")).toHaveLength(4);
  });

  it("does not include off-faction splash cards in starter decks", () => {
    for (const faction of ["alloy_clan", "flux_collective", "biomass_swarm"] as const) {
      const cards = getStarterDeckCardIds(faction);
      for (const cardId of cards) {
        const definition = getCardDefinition(cardId);
        expect(definition).toBeDefined();
        expect(definition?.faction === faction || definition?.faction === "neutral").toBe(true);
      }
    }
  });
});
