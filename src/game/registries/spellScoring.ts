import type { CardPlayEffectConfig } from "../content/cards/catalog";
import type { StackEffectBehavior } from "../content/stackEffects";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import type { PlayCardTargetOption } from "../rules/cardPlayOptions";

export type SpellScoringContext = {
  state: GameState;
  botPlayerId: PlayerId;
  targeting: PlayCardTargetOption;
  effect: StackEffectBehavior;
  effectConfigs: CardPlayEffectConfig[];
};

export type SpellScoringResolver = (context: SpellScoringContext) => number;

const spellScoringResolvers = new Map<StackEffectBehavior["type"], SpellScoringResolver>();

export function registerSpellScoringResolver(
  type: StackEffectBehavior["type"],
  resolver: SpellScoringResolver
): void {
  spellScoringResolvers.set(type, resolver);
}

export function getSpellScoringResolver(
  type: StackEffectBehavior["type"]
): SpellScoringResolver | undefined {
  return spellScoringResolvers.get(type);
}

export function resetSpellScoringRegistry(): void {
  spellScoringResolvers.clear();
}
