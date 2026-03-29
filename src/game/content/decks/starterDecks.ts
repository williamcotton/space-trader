import type { Faction } from "../../model/enums";
import { CARD_DEFINITIONS, getCardDefinition } from "../cards/catalog";
import { getRegisteredStarterDeck } from "../registry";

type DeckEntry = readonly [cardId: string, copies: number];

function expandDeck(entries: readonly DeckEntry[]): string[] {
  const cards: string[] = [];
  for (const [cardId, copies] of entries) {
    for (let index = 0; index < copies; index += 1) {
      cards.push(cardId);
    }
  }
  return cards;
}

function defineStarterDeck(entries: readonly DeckEntry[]): string[] {
  const cards = expandDeck(entries);
  const errors = validateDeckCardIds(cards);
  if (errors.length > 0) {
    throw new Error(`Invalid starter deck definition: ${errors.join(" | ")}`);
  }
  return cards;
}

const ALLOY_STARTER_ENTRIES: readonly DeckEntry[] = [
  ["expedition_harvester_card", 4],
  ["brace_protocol", 4],
  ["patchwork_barrier", 4],
  ["rivet_volley", 4],
  ["slag_barrage", 4],
  ["war_protocol", 2],
  ["iron_formation", 2],
  ["scrap_dividend", 2],
  ["forge_hauler_card", 4],
  ["salvage_hauler_card", 4],
  ["frontline_scout_card", 4],
  ["forge_captain_card", 4],
  ["linebreak_marshal_card", 2],
  ["scrap_quartermaster_card", 2],
  ["shrapnel_relay", 4],
  ["alloy_guard_card", 4],
  ["scorched_protocol", 4],
  ["orbital_purge", 2],
];

const FLUX_STARTER_ENTRIES: readonly DeckEntry[] = [
  ["expedition_harvester_card", 4],
  ["surge_archivist_card", 2],
  ["overcharge_savant_card", 2],
  ["arc_snap", 4],
  ["counter_pulse", 2],
  ["emergency_war_chest", 2],
  ["ion_skimmer_card", 4],
  ["salvage_hauler_card", 4],
  ["echo_recall", 2],
  ["flux_runner_card", 4],
  ["ion_shower", 4],
  ["signal_fork", 2],
  ["static_insight", 2],
  ["surge_matrix", 2],
  ["arc_bloom", 2],
  ["phase_coil", 2],
  ["overload_finish", 4],
  ["arc_repeater_card", 2],
  ["relay_savant_card", 4],
  ["ion_surge_archive", 4],
  ["meteor_chain", 2],
];

const BIOMASS_STARTER_ENTRIES: readonly DeckEntry[] = [
  ["expedition_harvester_card", 4],
  ["neural_echo", 4],
  ["spore_burst", 4],
  ["emergency_thrust", 2],
  ["escort_drone_card", 2],
  ["spore_tender_card", 4],
  ["bloom_archivist_card", 2],
  ["compost_broker_card", 2],
  ["pathfinder_buggy_card", 4],
  ["salvage_hauler_card", 4],
  ["spore_bloom", 4],
  ["support_drone_card", 4],
  ["swarm_harvester_card", 4],
  ["spore_harvest", 2],
  ["canopy_dividend", 2],
  ["chain_beacon", 4],
  ["holdfast_protocol", 2],
  ["overgrowth_wave", 4],
  ["orbital_purge", 2],
];

export const BASE_STARTER_DECKS: Record<string, string[]> = {
  alloy_clan: defineStarterDeck(ALLOY_STARTER_ENTRIES),
  flux_collective: defineStarterDeck(FLUX_STARTER_ENTRIES),
  biomass_swarm: defineStarterDeck(BIOMASS_STARTER_ENTRIES),
};

export const STARTER_DECKS = BASE_STARTER_DECKS;

export function getStarterDeckCardIds(faction: Faction): string[] {
  return getRegisteredStarterDeck(faction);
}

export function validateDeckCardIds(cardIds: string[]): string[] {
  const errors: string[] = [];

  if (cardIds.length !== 60) {
    errors.push(`Deck must contain exactly 60 cards; received ${cardIds.length}.`);
  }

  const copyCounts = new Map<string, number>();
  for (const cardId of cardIds) {
    if (!(getCardDefinition(cardId) ?? CARD_DEFINITIONS[cardId])) {
      errors.push(`Deck contains unknown card id: ${cardId}`);
      continue;
    }

    const next = (copyCounts.get(cardId) ?? 0) + 1;
    copyCounts.set(cardId, next);
  }

  for (const [cardId, copies] of copyCounts) {
    if (copies > 4) {
      errors.push(`Deck exceeds copy limit for ${cardId}: ${copies} > 4.`);
    }
  }

  return errors;
}
