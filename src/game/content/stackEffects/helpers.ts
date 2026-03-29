import { getStackEffectMagnitudeCalculator } from "../../registries/stackEffectMagnitudes";
import { getRegisteredStackEffectDefinition } from "../registry";

export function isKnownStackEffect(effectId: string): boolean {
  return typeof getRegisteredStackEffectDefinition(effectId) !== "undefined";
}

export function isCounterResponse(effectId: string): boolean {
  const effect = getRegisteredStackEffectDefinition(effectId);
  return effect?.behavior.type === "counter";
}

export function getStackEffectMagnitude(
  effectId: string,
  sourceCardId?: string | null,
  activeModifierIds: string[] = []
): number {
  const effect = getRegisteredStackEffectDefinition(effectId);
  if (!effect) return 0;

  const calculator = getStackEffectMagnitudeCalculator(effect.behavior.type);
  return calculator ? calculator(effect.behavior as never, { sourceCardId, activeModifierIds }) : 0;
}
