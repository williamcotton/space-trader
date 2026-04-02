import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../cards/catalog";
import { getStarterDeckCardIds, validateDeckCardIds } from "./starterDecks";

function countCopies(cardIds: string[], targetCardId: string): number {
  return cardIds.filter((cardId) => cardId === targetCardId).length;
}

function countResourceUnitCopies(cardIds: string[]): number {
  return cardIds.filter((cardId) => {
    const definition = getCardDefinition(cardId);
    return definition?.kind === "unit" && definition.unit.role === "resource";
  }).length;
}

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
      expect(countCopies(cards, "expedition_harvester_card")).toBe(4);
    }
  });

  it("keeps resource unit density high enough to support deck economy", () => {
    const alloyCards = getStarterDeckCardIds("alloy_clan");
    const fluxCards = getStarterDeckCardIds("flux_collective");
    const biomassCards = getStarterDeckCardIds("biomass_swarm");

    expect(countResourceUnitCopies(alloyCards)).toBeGreaterThanOrEqual(12);
    expect(countResourceUnitCopies(fluxCards)).toBeGreaterThanOrEqual(12);
    expect(countResourceUnitCopies(biomassCards)).toBeGreaterThanOrEqual(16);
  });

  it("includes the new faction-specific one-cost resource units", () => {
    const alloyCards = getStarterDeckCardIds("alloy_clan");
    const fluxCards = getStarterDeckCardIds("flux_collective");
    const biomassCards = getStarterDeckCardIds("biomass_swarm");

    expect(countCopies(alloyCards, "forge_hauler_card")).toBe(4);
    expect(countCopies(fluxCards, "ion_skimmer_card")).toBe(4);
    expect(countCopies(biomassCards, "spore_tender_card")).toBe(4);
  });

  it("includes the new cascade cards in the intended starters", () => {
    const alloyCards = getStarterDeckCardIds("alloy_clan");
    const fluxCards = getStarterDeckCardIds("flux_collective");
    const biomassCards = getStarterDeckCardIds("biomass_swarm");

    expect(countCopies(alloyCards, "shrapnel_relay")).toBe(4);
    expect(countCopies(fluxCards, "ion_shower")).toBe(4);
    expect(countCopies(biomassCards, "spore_bloom")).toBe(4);

    for (const cards of [biomassCards]) {
      expect(countCopies(cards, "chain_beacon")).toBeGreaterThanOrEqual(2);
    }
  });

  it("surfaces updated on-pie faction tactics and haymakers in the starters", () => {
    const alloyCards = getStarterDeckCardIds("alloy_clan");
    const fluxCards = getStarterDeckCardIds("flux_collective");
    const biomassCards = getStarterDeckCardIds("biomass_swarm");

    expect(countCopies(alloyCards, "patchwork_barrier")).toBe(4);
    expect(countCopies(alloyCards, "scorched_protocol")).toBe(4);
    expect(countCopies(alloyCards, "war_protocol")).toBe(2);
    expect(countCopies(alloyCards, "iron_formation")).toBe(2);
    expect(countCopies(alloyCards, "scrap_dividend")).toBe(2);
    expect(countCopies(alloyCards, "linebreak_marshal_card")).toBe(2);
    expect(countCopies(alloyCards, "scrap_quartermaster_card")).toBe(2);
    expect(countCopies(fluxCards, "emergency_war_chest")).toBe(2);
    expect(countCopies(fluxCards, "meteor_chain")).toBe(2);
    expect(countCopies(fluxCards, "ion_surge_archive")).toBe(4);
    expect(countCopies(fluxCards, "signal_fork")).toBe(2);
    expect(countCopies(fluxCards, "static_insight")).toBe(2);
    expect(countCopies(fluxCards, "surge_matrix")).toBe(2);
    expect(countCopies(fluxCards, "arc_bloom")).toBe(2);
    expect(countCopies(fluxCards, "phase_coil")).toBe(2);
    expect(countCopies(fluxCards, "signal_hijack")).toBe(2);
    expect(countCopies(fluxCards, "arc_repeater_card")).toBe(2);
    expect(countCopies(fluxCards, "surge_archivist_card")).toBe(2);
    expect(countCopies(fluxCards, "overcharge_savant_card")).toBe(2);
    expect(countCopies(biomassCards, "bloom_archivist_card")).toBe(2);
    expect(countCopies(biomassCards, "compost_broker_card")).toBe(2);
    expect(countCopies(biomassCards, "feeding_frenzy")).toBe(2);
    expect(countCopies(biomassCards, "overgrowth_wave")).toBe(4);
    expect(countCopies(biomassCards, "spore_harvest")).toBe(2);
    expect(countCopies(biomassCards, "canopy_dividend")).toBe(2);
    expect(countCopies(biomassCards, "orbital_purge")).toBe(2);
  });

  it("uses an actual starter curve instead of uniform four-ofs", () => {
    for (const faction of ["alloy_clan", "flux_collective", "biomass_swarm"] as const) {
      const cards = getStarterDeckCardIds(faction);
      const expensiveCards = cards.filter((cardId) => {
        const definition = getCardDefinition(cardId);
        if (!definition) {
          return false;
        }
        const cost = definition.cost;
        const primary =
          (cost.alloy ?? 0) +
          (cost.flux ?? 0) +
          (cost.biomass ?? 0);
        return (cost.credits ?? 0) + primary >= 5;
      });

      expect(expensiveCards.length).toBeGreaterThanOrEqual(6);
      expect(new Set(cards).size).toBeGreaterThan(15);
    }
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
