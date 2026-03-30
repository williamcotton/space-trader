import type { CardDefinition } from "../content/cards/catalog";
import type { StackEffectDefinition } from "../content/stackEffects";

export type CardCounterabilityHook = (
  card: CardDefinition,
  stackEffect: StackEffectDefinition,
  defaultCounterable: boolean
) => boolean;

const cardCounterabilityHooks = new Map<string, CardCounterabilityHook>();

export function registerCardCounterabilityHook(id: string, hook: CardCounterabilityHook): void {
  cardCounterabilityHooks.set(id, hook);
}

export function resolveCardCounterable(
  card: CardDefinition,
  stackEffect: StackEffectDefinition,
  defaultCounterable: boolean
): boolean {
  let counterable = defaultCounterable;
  for (const hook of cardCounterabilityHooks.values()) {
    counterable = hook(card, stackEffect, counterable);
  }
  return counterable;
}

export function resetCardCounterabilityRegistry(): void {
  cardCounterabilityHooks.clear();
}
