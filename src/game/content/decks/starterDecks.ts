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
  "support_drone_card",
  "slag_barrage",
  "patchwork_barrier",
  "jammer_cloud",
  "null_intercept",
  "emergency_thrust",
  "orbital_ping",
  "counter_pulse",
  "swarm_harvester_card",
  "flux_runner_card",
  "spore_burst",
  "echo_recall",
  "neural_echo",
];

const FLUX_STARTER_UNIQUE: string[] = [
  "flux_runner_card",
  "support_drone_card",
  "frontline_scout_card",
  "orbital_ping",
  "counter_pulse",
  "echo_recall",
  "null_intercept",
  "jammer_cloud",
  "emergency_thrust",
  "slag_barrage",
  "swarm_harvester_card",
  "alloy_guard_card",
  "spore_burst",
  "patchwork_barrier",
  "neural_echo",
];

const BIOMASS_STARTER_UNIQUE: string[] = [
  "swarm_harvester_card",
  "support_drone_card",
  "frontline_scout_card",
  "spore_burst",
  "neural_echo",
  "echo_recall",
  "jammer_cloud",
  "null_intercept",
  "emergency_thrust",
  "slag_barrage",
  "orbital_ping",
  "alloy_guard_card",
  "flux_runner_card",
  "counter_pulse",
  "patchwork_barrier",
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
