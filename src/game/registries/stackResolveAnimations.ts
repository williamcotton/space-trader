import type { StackItemResolvedEvent } from "../actions/events";
import type { CardDefinition } from "../content/cards/catalog";
import type { StackEffectBehavior } from "../content/stackEffects";
import type { GameState } from "../model/state";
import type { CanvasAnimation } from "../types";
import type { AnimationCapture } from "../render/animations";

export type StackResolveAnimationBuilderContext<K extends StackEffectBehavior["type"] = StackEffectBehavior["type"]> = {
  event: StackItemResolvedEvent;
  before: AnimationCapture;
  state: GameState;
  baseId: string;
  sourceCard?: CardDefinition;
  behavior: Extract<StackEffectBehavior, { type: K }>;
};

export type StackResolveAnimationBuilder<K extends StackEffectBehavior["type"] = StackEffectBehavior["type"]> = (
  context: StackResolveAnimationBuilderContext<K>
) => CanvasAnimation | null;

const stackResolveAnimationBuilders = new Map<StackEffectBehavior["type"], StackResolveAnimationBuilder>();

export function registerStackResolveAnimationBuilder<K extends StackEffectBehavior["type"]>(
  type: K,
  builder: StackResolveAnimationBuilder<K>
): void {
  stackResolveAnimationBuilders.set(type, builder as unknown as StackResolveAnimationBuilder);
}

export function getStackResolveAnimationBuilder(
  type: StackEffectBehavior["type"]
): StackResolveAnimationBuilder | undefined {
  return stackResolveAnimationBuilders.get(type);
}
