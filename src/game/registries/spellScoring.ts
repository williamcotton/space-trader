import type { CardPlayEffectConfig } from "../content/cards/catalog";
import type { StackEffectBehavior } from "../content/stackEffects";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import type { PlayCardTargetOption } from "../rules/cardPlayOptions";

export type SpellScoringContext<K extends StackEffectBehavior["type"] = StackEffectBehavior["type"]> = {
  state: GameState;
  botPlayerId: PlayerId;
  targeting: PlayCardTargetOption;
  effect: Extract<StackEffectBehavior, { type: K }>;
  effectConfigs: CardPlayEffectConfig[];
};

export type SpellScoringResolver<K extends StackEffectBehavior["type"] = StackEffectBehavior["type"]> = (
  context: SpellScoringContext<K>
) => number;

const spellScoringResolvers = new Map<StackEffectBehavior["type"], SpellScoringResolver>();

export function registerSpellScoringResolver<K extends StackEffectBehavior["type"]>(
  type: K,
  resolver: SpellScoringResolver<K>
): void {
  spellScoringResolvers.set(type, resolver as unknown as SpellScoringResolver);
}

export function getSpellScoringResolver(
  type: StackEffectBehavior["type"]
): SpellScoringResolver | undefined {
  return spellScoringResolvers.get(type);
}
