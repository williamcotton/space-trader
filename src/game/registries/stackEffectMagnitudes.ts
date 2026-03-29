import type { StackEffectBehavior } from "../content/stackEffects";

export type StackEffectMagnitudeCalculator<K extends StackEffectBehavior["type"] = StackEffectBehavior["type"]> = (
  behavior: Extract<StackEffectBehavior, { type: K }>,
  options: {
    sourceCardId?: string | null;
    activeModifierIds?: string[];
  }
) => number;

const stackEffectMagnitudeCalculators = new Map<StackEffectBehavior["type"], StackEffectMagnitudeCalculator>();

export function registerStackEffectMagnitudeCalculator<K extends StackEffectBehavior["type"]>(
  type: K,
  calculator: StackEffectMagnitudeCalculator<K>
): void {
  stackEffectMagnitudeCalculators.set(type, calculator as unknown as StackEffectMagnitudeCalculator);
}

export function getStackEffectMagnitudeCalculator(
  type: StackEffectBehavior["type"]
): StackEffectMagnitudeCalculator | undefined {
  return stackEffectMagnitudeCalculators.get(type);
}
