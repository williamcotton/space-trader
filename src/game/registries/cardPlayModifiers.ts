import type { CardDefinition } from "../content/cards/types";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";

export type CardPlayModifier = {
  label?: string;
  isActive?: (state: Readonly<GameState>, playerId: PlayerId, card: CardDefinition) => boolean;
  onCardPlayedToStack?: (
    state: GameState,
    playerId: PlayerId,
    card: CardDefinition,
    activeModifierIds: readonly string[]
  ) => void;
};

const registeredCardPlayModifiers = new Map<string, CardPlayModifier>();

export function registerCardPlayModifier(modifierId: string, modifier: CardPlayModifier): void {
  registeredCardPlayModifiers.set(modifierId, modifier);
}

export function getRegisteredCardPlayModifier(modifierId: string): CardPlayModifier | undefined {
  return registeredCardPlayModifiers.get(modifierId);
}

export function getActiveCardPlayModifierIds(
  state: Readonly<GameState>,
  playerId: PlayerId,
  card: CardDefinition
): string[] {
  return [...registeredCardPlayModifiers.entries()]
    .filter(([, modifier]) => modifier.isActive?.(state, playerId, card))
    .map(([modifierId]) => modifierId)
    .sort((a, b) => a.localeCompare(b));
}

export function runCardPlayedToStackModifierHooks(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition,
  activeModifierIds: readonly string[]
): void {
  for (const modifier of registeredCardPlayModifiers.values()) {
    modifier.onCardPlayedToStack?.(state, playerId, card, activeModifierIds);
  }
}

export function getCardPlayModifierLabels(activeModifierIds: readonly string[]): string[] {
  return activeModifierIds.map((modifierId) => {
    const modifier = getRegisteredCardPlayModifier(modifierId);
    return modifier?.label ?? modifierId;
  });
}

export function resetCardPlayModifierRegistry(): void {
  registeredCardPlayModifiers.clear();
}
