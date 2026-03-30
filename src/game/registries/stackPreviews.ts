import type { CardDefinition } from "../content/cards/catalog";
import type { StackEffectDefinition } from "../content/stackEffects";
import type { EntityState, GameState, StackItem } from "../model/state";

export type StackPreviewContext = {
  item: StackItem;
  state: GameState;
  sourceCard?: CardDefinition;
  effect?: StackEffectDefinition;
  targetEntity: EntityState | null;
  targetStackItem: StackItem | null;
  targetHex: StackItem["targetHex"] | null;
};

export type StackPreviewPresentation = {
  kindLabel?: string;
  detail?: string;
};

export type StackPreviewPresenter = (context: StackPreviewContext) => StackPreviewPresentation | null;

const stackPreviewPresenters = new Map<string, StackPreviewPresenter>();
const stackPreviewPresentersByEffectId = new Map<string, StackPreviewPresenter>();

export function registerStackPreviewPresenter(effectBehaviorType: string, presenter: StackPreviewPresenter): void {
  stackPreviewPresenters.set(effectBehaviorType, presenter);
}

export function getStackPreviewPresenter(effectBehaviorType: string): StackPreviewPresenter | undefined {
  return stackPreviewPresenters.get(effectBehaviorType);
}

export function registerStackPreviewPresenterByEffectId(effectId: string, presenter: StackPreviewPresenter): void {
  stackPreviewPresentersByEffectId.set(effectId, presenter);
}

export function getStackPreviewPresenterByEffectId(effectId: string): StackPreviewPresenter | undefined {
  return stackPreviewPresentersByEffectId.get(effectId);
}

export function resetStackPreviewRegistry(): void {
  stackPreviewPresenters.clear();
  stackPreviewPresentersByEffectId.clear();
}
