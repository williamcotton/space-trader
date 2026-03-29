import type { StackItemResolvedEvent } from "../actions/events";
import type { CardDefinition } from "../content/cards/catalog";
import type { StackEffectBehavior } from "../content/stackEffects";
import type { GameState } from "../model/state";
import type { CanvasAnimation } from "../types";
import type { AnimationCapture } from "../render/animations";

export type StackResolveAnimationBuilderContext = {
  event: StackItemResolvedEvent;
  before: AnimationCapture;
  state: GameState;
  baseId: string;
  sourceCard?: CardDefinition;
  behavior: StackEffectBehavior;
};

export type StackResolveAnimationBuilder = (context: StackResolveAnimationBuilderContext) => CanvasAnimation | null;

const stackResolveAnimationBuilders = new Map<StackEffectBehavior["type"], StackResolveAnimationBuilder>();

export function registerStackResolveAnimationBuilder(
  type: StackEffectBehavior["type"],
  builder: StackResolveAnimationBuilder
): void {
  stackResolveAnimationBuilders.set(type, builder);
}

export function getStackResolveAnimationBuilder(
  type: StackEffectBehavior["type"]
): StackResolveAnimationBuilder | undefined {
  return stackResolveAnimationBuilders.get(type);
}
