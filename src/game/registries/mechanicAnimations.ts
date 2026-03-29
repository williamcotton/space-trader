import type { GameEvent } from "../actions/events";
import type { AnimationCapture } from "../render/animations";
import type { GameState } from "../model/state";
import type { CanvasAnimation } from "../types";

export type MechanicAnimationContributor = (
  events: readonly GameEvent[],
  before: AnimationCapture,
  state: GameState
) => CanvasAnimation[];

const mechanicAnimationContributors = new Map<string, MechanicAnimationContributor>();

export function registerMechanicAnimationContributor(id: string, contributor: MechanicAnimationContributor): void {
  mechanicAnimationContributors.set(id, contributor);
}

export function buildRegisteredMechanicAnimations(
  events: readonly GameEvent[],
  before: AnimationCapture,
  state: GameState
): CanvasAnimation[] {
  const animations: CanvasAnimation[] = [];
  for (const contributor of mechanicAnimationContributors.values()) {
    animations.push(...contributor(events, before, state));
  }
  return animations;
}
