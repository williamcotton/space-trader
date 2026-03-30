import type { StackEffectBehavior } from "../content/stackEffects";

export type StackEffectMagnitudeCalculator = (
  behavior: StackEffectBehavior,
  options: {
    sourceCardId?: string | null;
    activeModifierIds?: string[];
  }
) => number;

const stackEffectMagnitudeCalculators = new Map<StackEffectBehavior["type"], StackEffectMagnitudeCalculator>();

export function registerStackEffectMagnitudeCalculator(
  type: StackEffectBehavior["type"],
  calculator: StackEffectMagnitudeCalculator
): void {
  stackEffectMagnitudeCalculators.set(type, calculator);
}

export function getStackEffectMagnitudeCalculator(
  type: StackEffectBehavior["type"]
): StackEffectMagnitudeCalculator | undefined {
  return stackEffectMagnitudeCalculators.get(type);
}

export function resetStackEffectMagnitudeRegistry(): void {
  stackEffectMagnitudeCalculators.clear();
}
