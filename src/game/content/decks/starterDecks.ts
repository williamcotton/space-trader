import type { Faction } from "../../model/enums";
import { getCardDefinition } from "../cards/catalog";

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
  ["escort_drone_card", 2],
  ["failsafe_redirect", 4],
  ["pathfinder_buggy_card", 2],
  ["salvage_hauler_card", 2],
  ["frontline_scout_card", 4],
  ["forge_captain_card", 4],
  ["shrapnel_relay", 4],
  ["bulwark_drone_card", 4],
  ["chain_beacon", 4],
  ["alloy_guard_card", 4],
  ["scorched_protocol", 4],
  ["orbital_purge", 2],
];

const FLUX_STARTER_ENTRIES: readonly DeckEntry[] = [
  ["expedition_harvester_card", 4],
  ["orbital_ping", 4],
  ["arc_snap", 4],
  ["counter_pulse", 4],
  ["escort_drone_card", 4],
  ["failsafe_redirect", 4],
  ["pathfinder_buggy_card", 2],
  ["salvage_hauler_card", 2],
  ["echo_recall", 4],
  ["flux_runner_card", 4],
  ["ion_shower", 4],
  ["overload_finish", 4],
  ["relay_savant_card", 4],
  ["bulwark_drone_card", 2],
  ["chain_beacon", 2],
  ["ion_surge_archive", 4],
  ["meteor_chain", 4],
];

const BIOMASS_STARTER_ENTRIES: readonly DeckEntry[] = [
  ["expedition_harvester_card", 4],
  ["neural_echo", 4],
  ["spore_burst", 4],
  ["emergency_thrust", 4],
  ["escort_drone_card", 4],
  ["failsafe_redirect", 2],
  ["null_intercept", 2],
  ["pathfinder_buggy_card", 4],
  ["salvage_hauler_card", 2],
  ["spore_bloom", 4],
  ["support_drone_card", 4],
  ["swarm_harvester_card", 4],
  ["bulwark_drone_card", 4],
  ["chain_beacon", 4],
  ["holdfast_protocol", 4],
  ["overgrowth_wave", 4],
  ["orbital_purge", 2],
];

const STARTER_DECKS: Record<Faction, string[]> = {
  alloy_clan: defineStarterDeck(ALLOY_STARTER_ENTRIES),
  flux_collective: defineStarterDeck(FLUX_STARTER_ENTRIES),
  biomass_swarm: defineStarterDeck(BIOMASS_STARTER_ENTRIES),
};

export function getStarterDeckCardIds(faction: Faction): string[] {
  return [...STARTER_DECKS[faction]];
}

export function validateDeckCardIds(cardIds: string[]): string[] {
  const errors: string[] = [];

  if (cardIds.length !== 60) {
    errors.push(`Deck must contain exactly 60 cards; received ${cardIds.length}.`);
  }

  const copyCounts = new Map<string, number>();
  for (const cardId of cardIds) {
    if (!getCardDefinition(cardId)) {
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
