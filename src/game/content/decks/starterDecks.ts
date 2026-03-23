import type { Faction } from "../../model/enums";
import { getCardDefinition } from "../cards/catalog";

function expandToSixty(uniqueCardIds: string[]): string[] {
  const cards: string[] = [];
  for (const cardId of uniqueCardIds) {
    cards.push(cardId, cardId, cardId, cardId);
  }
  return cards;
}

const ALLOY_STARTER_UNIQUE: string[] = [
  "frontline_scout_card",
  "alloy_guard_card",
  "forge_captain_card",
  "brace_protocol",
  "shrapnel_relay",
  "rivet_volley",
  "expedition_harvester_card",
  "escort_drone_card",
  "salvage_hauler_card",
  "bulwark_drone_card",
  "pathfinder_buggy_card",
  "null_intercept",
  "chain_beacon",
  "failsafe_redirect",
  "slag_barrage",
];

const FLUX_STARTER_UNIQUE: string[] = [
  "flux_runner_card",
  "relay_savant_card",
  "arc_snap",
  "overload_finish",
  "counter_pulse",
  "echo_recall",
  "ion_shower",
  "expedition_harvester_card",
  "escort_drone_card",
  "salvage_hauler_card",
  "bulwark_drone_card",
  "pathfinder_buggy_card",
  "null_intercept",
  "chain_beacon",
  "failsafe_redirect",
];

const BIOMASS_STARTER_UNIQUE: string[] = [
  "swarm_harvester_card",
  "spore_burst",
  "neural_echo",
  "spore_bloom",
  "expedition_harvester_card",
  "support_drone_card",
  "escort_drone_card",
  "salvage_hauler_card",
  "bulwark_drone_card",
  "pathfinder_buggy_card",
  "null_intercept",
  "chain_beacon",
  "failsafe_redirect",
  "emergency_thrust",
  "holdfast_protocol",
];

const STARTER_DECKS: Record<Faction, string[]> = {
  alloy_clan: expandToSixty(ALLOY_STARTER_UNIQUE),
  flux_collective: expandToSixty(FLUX_STARTER_UNIQUE),
  biomass_swarm: expandToSixty(BIOMASS_STARTER_UNIQUE),
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
