import type { GameInstruction, InstructionContext } from "../../../actions/instructions";
import { getCardDefinition, getCardPlayEffectMagnitude, getResolvedCardPlayEffectConfigs } from "../../cards/catalog";
import {
  createCascadeUnitBuffInstructions,
  createResourcesByBloomCountInstructions,
  createResourcesBySalvageCountInstructions,
} from "./playEffects";
import {
  getPlayEffectResolver,
  registerPlayEffectMagnitudeCalculator,
  registerPlayEffectResolver,
} from "../../../registries/playEffects";
import { registerStackEffectMagnitudeCalculator } from "../../../registries/stackEffectMagnitudes";
import { getRegisteredResourceIds } from "../../registry";
import type { StackEffectDefinition } from "../../stackEffects/types";

function createInstructionsForPlayEffectConfig(
  context: InstructionContext,
  effectConfig: ReturnType<typeof getResolvedCardPlayEffectConfigs>[number]
): GameInstruction[] {
  const resolver = getPlayEffectResolver(effectConfig.type);
  return resolver ? resolver(context, effectConfig as never) : [];
}

function createCardOwnedConfiguredInstructions(
  context: InstructionContext,
  effectType: ReturnType<typeof getResolvedCardPlayEffectConfigs>[number]["type"],
  missingMessage: string
): GameInstruction[] {
  const sourceCard = context.item.sourceCardId ? getCardDefinition(context.item.sourceCardId) : undefined;
  const effectConfigs = getResolvedCardPlayEffectConfigs(sourceCard, context.item.activeModifierIds ?? [])
    .filter((effectConfig) => effectConfig.type === effectType);
  if (effectConfigs.length === 0) {
    return [{ type: "LOG", text: `Resolved ${context.item.label}: ${missingMessage}` }];
  }

  return effectConfigs.flatMap((effectConfig) => createInstructionsForPlayEffectConfig(context, effectConfig));
}

function createCardOwnedResourcesByBloomCountInstructions(context: InstructionContext): GameInstruction[] {
  return createCardOwnedConfiguredInstructions(context, "resources_by_bloom_count", "missing bloom-count resource config on source card.");
}

function createCardOwnedResourcesBySalvageCountInstructions(context: InstructionContext): GameInstruction[] {
  return createCardOwnedConfiguredInstructions(context, "resources_by_salvage_count", "missing salvage-count resource config on source card.");
}

function createCardOwnedCascadeUnitBuffInstructions(context: InstructionContext): GameInstruction[] {
  return createCardOwnedConfiguredInstructions(context, "cascade_unit_buff", "missing cascade config on source card.");
}

export const ALPHA_STACK_EFFECTS: Record<string, StackEffectDefinition> = {
  resources_by_bloom_count: {
    id: "resources_by_bloom_count",
    label: "Resources By Bloom Count",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "resources_by_bloom_count",
    },
    createInstructions: createCardOwnedResourcesByBloomCountInstructions,
  },
  resources_by_salvage_count: {
    id: "resources_by_salvage_count",
    label: "Resources By Salvage Count",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "resources_by_salvage_count",
    },
    createInstructions: createCardOwnedResourcesBySalvageCountInstructions,
  },
  cascade_unit_buff: {
    id: "cascade_unit_buff",
    label: "Cascade Unit Buff",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "hex",
    },
    behavior: {
      type: "cascade_unit_buff",
      attackBonus: 0,
      armorBonus: 0,
      waves: 0,
    },
    createInstructions: createCardOwnedCascadeUnitBuffInstructions,
  },
};

export function installAlphaPlayEffectRegistrations(): void {
  registerPlayEffectResolver("resources_by_bloom_count", (context, effectConfig) => createResourcesByBloomCountInstructions(effectConfig as never)(context));
  registerPlayEffectResolver("resources_by_salvage_count", (context, effectConfig) => createResourcesBySalvageCountInstructions(effectConfig as never)(context));
  registerPlayEffectResolver("cascade_unit_buff", (context, effectConfig) => createCascadeUnitBuffInstructions(effectConfig as never)(context));

  registerPlayEffectMagnitudeCalculator("resources_by_bloom_count", (effectConfig) =>
    Math.max(
      ...getRegisteredResourceIds().map((resource) =>
        Number((effectConfig.resourcesPerThreshold as Record<string, number> | undefined)?.[resource] ?? 0) *
        Number(effectConfig.maxThresholds ?? 1)
      ),
      0
    )
  );
  registerPlayEffectMagnitudeCalculator("resources_by_salvage_count", (effectConfig) =>
    Math.max(
      ...getRegisteredResourceIds().map((resource) =>
        Number((effectConfig.resourcesPerThreshold as Record<string, number> | undefined)?.[resource] ?? 0) *
        Number(effectConfig.maxThresholds ?? 1)
      ),
      0
    )
  );
  registerPlayEffectMagnitudeCalculator("cascade_unit_buff", (effectConfig) =>
    Math.max(
      Math.abs(Number(effectConfig.attackBonus ?? 0)),
      Math.abs(Number(effectConfig.armorBonus ?? 0)),
      Array.isArray(effectConfig.grantedKeywords) && effectConfig.grantedKeywords.length > 0 ? 1 : 0
    )
  );
}

export function installAlphaStackEffectMagnitudeRegistrations(): void {
  registerStackEffectMagnitudeCalculator("resources_by_bloom_count", (_behavior, options) =>
    options.sourceCardId ? getCardPlayEffectMagnitude(getCardDefinition(options.sourceCardId), options.activeModifierIds ?? []) : 0
  );
  registerStackEffectMagnitudeCalculator("resources_by_salvage_count", (_behavior, options) =>
    options.sourceCardId ? getCardPlayEffectMagnitude(getCardDefinition(options.sourceCardId), options.activeModifierIds ?? []) : 0
  );
  registerStackEffectMagnitudeCalculator("cascade_unit_buff", (behavior, options) =>
    options.sourceCardId
      ? getCardPlayEffectMagnitude(getCardDefinition(options.sourceCardId), options.activeModifierIds ?? [])
      : Math.max(Math.abs(Number(behavior.attackBonus ?? 0)), Math.abs(Number(behavior.armorBonus ?? 0)))
  );
}
