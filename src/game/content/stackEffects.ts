import { getRegisteredStackEffectDefinition, getRegisteredStackEffectDefinitions } from "./registry";
import { getStackEffectMagnitude, isCounterResponse, isKnownStackEffect } from "./stackEffects/helpers";
import type { StackEffectDefinition } from "./stackEffects/types";

export type {
  CounterDestination,
  StackEffectBehavior,
  StackEffectDefinition,
  StackEntityTargetKind,
  StackEntityTargetRelation,
  StackObjectKind,
  StackObjectRules,
  StackTargetingRules,
} from "./stackEffects/types";

export { getStackEffectMagnitude, isCounterResponse, isKnownStackEffect };

export function getStackEffectDefinition(effectId: string): StackEffectDefinition | undefined {
  return getRegisteredStackEffectDefinition(effectId);
}

export function getStackEffectCatalog(): Record<string, StackEffectDefinition> {
  return getRegisteredStackEffectDefinitions();
}
