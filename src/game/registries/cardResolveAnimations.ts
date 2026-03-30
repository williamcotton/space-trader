import type { StackItemResolvedEvent } from "../actions/events";
import type { CardDefinition, CardResolveAnimationProfile } from "../content/cards/catalog";
import type { GameState } from "../model/state";
import type { CanvasAnimation } from "../types";
import type { AnimationCapture } from "../render/animations";

export type CardResolveAnimationBuilderContext = {
  event: StackItemResolvedEvent;
  before: AnimationCapture;
  state: GameState;
  baseId: string;
  sourceCard: CardDefinition;
  profile: CardResolveAnimationProfile;
};

export type CardResolveAnimationBuilder = (context: CardResolveAnimationBuilderContext) => CanvasAnimation | null;

const cardResolveAnimationBuilders = new Map<string, CardResolveAnimationBuilder>();

export function registerCardResolveAnimationBuilder(kind: string, builder: CardResolveAnimationBuilder): void {
  cardResolveAnimationBuilders.set(kind, builder);
}

export function getCardResolveAnimationBuilder(kind: string): CardResolveAnimationBuilder | undefined {
  return cardResolveAnimationBuilders.get(kind);
}

export function resetCardResolveAnimationRegistry(): void {
  cardResolveAnimationBuilders.clear();
}
