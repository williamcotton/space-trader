import type { Faction } from "../../model/enums";
import { getRegisteredStarterDeck } from "../registry";
import { getCardDefinition } from "../cards/catalog";

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
