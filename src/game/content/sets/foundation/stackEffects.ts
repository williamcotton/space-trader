import type { GameInstruction, InstructionContext } from "../../../actions/instructions";
import { getCardDefinition, getCardPlayEffectMagnitude, getResolvedCardPlayEffectConfigs } from "../../cards/catalog";
import {
  createDestroyDamagedUnitsInstructions,
  createDrawAndGainResourcesInstructions,
  createGlobalUnitBuffInstructions,
  createHexAreaDamageInstructions,
  createMassDamageInstructions,
  createResourcesByUnitCountInstructions,
} from "./playEffects";
import {
  getPlayEffectResolver,
  registerPlayEffectMagnitudeCalculator,
  registerPlayEffectResolver,
} from "../../../registries/playEffects";
import { registerStackEffectMagnitudeCalculator } from "../../../registries/stackEffectMagnitudes";
import { LAYER } from "../../../systems/continuousEffects";
import type { ResourceType } from "../../../model/enums";
import { getRegisteredResourceIds } from "../../registry";
import type { CounterDestination, StackEffectDefinition } from "../../stackEffects/types";

function getOpponentBaseEntityId(context: InstructionContext): string {
  const opponentId = context.controllerId === "player_1" ? "player_2" : "player_1";
  return context.state.players[opponentId].baseEntityId;
}

function createNoopLogInstructions(context: InstructionContext): GameInstruction[] {
  return [{ type: "LOG", text: `Resolved stack item ${context.item.label}: no-op.` }];
}

function createDeployUnitInstructions(context: InstructionContext): GameInstruction[] {
  const sourceCardId = context.item.sourceCardId;
  const sourceCard = sourceCardId ? getCardDefinition(sourceCardId) : undefined;
  if (!sourceCard || sourceCard.kind !== "unit") {
    return [{ type: "LOG", text: `Resolved ${context.item.label}: missing unit card definition.` }];
  }

  return [{
    type: "DEPLOY_UNIT",
    cardId: sourceCard.id,
    controllerId: context.controllerId,
    entityId: context.item.pendingUnitEntityId ?? undefined,
  }];
}

function createDamageEnemyBaseInstructions(amount: number) {
  return (context: InstructionContext): GameInstruction[] => [{
    type: "DEAL_DAMAGE",
    targetEntityId: getOpponentBaseEntityId(context),
    amount,
    sourceLabel: context.item.label,
  }];
}

function createDamageEntityInstructions(amount: number) {
  return (context: InstructionContext): GameInstruction[] => {
    if (!context.targetEntityId) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no battlefield target configured.` }];
    }

    return [{
      type: "DEAL_DAMAGE",
      targetEntityId: context.targetEntityId,
      amount,
      sourceLabel: context.item.label,
    }];
  };
}

function createDestroyEntityInstructions(requireDamaged: boolean) {
  return (context: InstructionContext): GameInstruction[] => {
    if (!context.targetEntityId) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no battlefield target configured.` }];
    }

    if (requireDamaged) {
      const target = context.state.entities[context.targetEntityId];
      if (!target || target.kind !== "unit") {
        return [{ type: "LOG", text: `Resolved ${context.item.label}: target unit not found.` }];
      }

      if (target.hp >= target.maxHp) {
        return [{ type: "LOG", text: `Resolved ${context.item.label}: target ${target.id} was no longer damaged.` }];
      }
    }

    return [{
      type: "DESTROY_ENTITY",
      targetEntityId: context.targetEntityId,
      sourceLabel: context.item.label,
    }];
  };
}

function createModifyUnitUntilEndOfTurnInstructions(attackBonus: number, armorBonus: number) {
  return (context: InstructionContext): GameInstruction[] => {
    if (!context.targetEntityId) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no battlefield target configured.` }];
    }

    const target = context.state.entities[context.targetEntityId];
    if (!target || target.kind !== "unit") {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: target unit not found.` }];
    }

    const instructions: GameInstruction[] = [];

    if (attackBonus !== 0) {
      instructions.push({
        type: "APPLY_CONTINUOUS_EFFECT",
        effectId: `ce_${context.item.id}_atk`,
        sourceEntityId: null,
        sourceCardId: context.item.sourceCardId,
        controllerId: context.controllerId,
        payload: { type: "stat_modifier", stat: "attackDamage", amount: attackBonus },
        target: { type: "specific_entity", entityId: context.targetEntityId },
        expiry: { type: "end_of_turn", turn: context.state.turn },
        layer: LAYER.TEMPORARY,
      });
    }

    if (armorBonus !== 0) {
      instructions.push({
        type: "APPLY_CONTINUOUS_EFFECT",
        effectId: `ce_${context.item.id}_arm`,
        sourceEntityId: null,
        sourceCardId: context.item.sourceCardId,
        controllerId: context.controllerId,
        payload: { type: "stat_modifier", stat: "armor", amount: armorBonus },
        target: { type: "specific_entity", entityId: context.targetEntityId },
        expiry: { type: "end_of_turn", turn: context.state.turn },
        layer: LAYER.TEMPORARY,
      });
    }

    const buffLabelParts: string[] = [];
    if (attackBonus !== 0) {
      buffLabelParts.push(`${attackBonus > 0 ? "+" : ""}${attackBonus} ATK`);
    }
    if (armorBonus !== 0) {
      buffLabelParts.push(`${armorBonus > 0 ? "+" : ""}${armorBonus} ARM`);
    }

    instructions.push({
      type: "LOG",
      text: `Resolved ${context.item.label}: ${context.targetEntityId} gains ${buffLabelParts.join(" and ")} until end of turn.`,
    });

    return instructions;
  };
}

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

function createCardOwnedMassDamageInstructions(context: InstructionContext): GameInstruction[] {
  return createCardOwnedConfiguredInstructions(context, "mass_damage", "missing mass-damage config on source card.");
}

function createCardOwnedGlobalUnitBuffInstructions(context: InstructionContext): GameInstruction[] {
  return createCardOwnedConfiguredInstructions(context, "global_unit_buff", "missing global-buff config on source card.");
}

function createCardOwnedDestroyDamagedUnitsInstructions(context: InstructionContext): GameInstruction[] {
  return createCardOwnedConfiguredInstructions(context, "destroy_damaged_units", "missing destroy-damaged config on source card.");
}

function createCardOwnedDrawAndGainResourcesInstructions(context: InstructionContext): GameInstruction[] {
  return createCardOwnedConfiguredInstructions(context, "draw_and_gain_resources", "missing draw-and-gain config on source card.");
}

function createDrawCardsInstructions(count: number) {
  return (context: InstructionContext): GameInstruction[] => [
    {
      type: "DRAW_CARDS",
      playerId: context.controllerId,
      count,
    },
    {
      type: "LOG",
      text: `Resolved ${context.item.label}: drew ${count} card${count === 1 ? "" : "s"}.`,
    },
  ];
}

function createGainResourcesInstructions(resources: Partial<Record<ResourceType, number>>) {
  return (context: InstructionContext): GameInstruction[] => [
    {
      type: "GAIN_RESOURCES",
      playerId: context.controllerId,
      resources,
    },
    {
      type: "LOG",
      text: `Resolved ${context.item.label}: gained ${Object.entries(resources)
        .filter((entry) => (entry[1] ?? 0) > 0)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" and ")}.`,
    },
  ];
}

function createCardOwnedResourcesByUnitCountInstructions(context: InstructionContext): GameInstruction[] {
  return createCardOwnedConfiguredInstructions(context, "resources_by_unit_count", "missing unit-count resource config on source card.");
}

function createCardOwnedHexAreaDamageInstructions(context: InstructionContext): GameInstruction[] {
  return createCardOwnedConfiguredInstructions(context, "hex_area_damage", "missing area-damage config on source card.");
}

function createCounterInstructions(destination: CounterDestination) {
  return (context: InstructionContext): GameInstruction[] => {
    if (!context.targetStackItemId) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no stack target configured.` }];
    }

    return [{
      type: "COUNTER_STACK_ITEM",
      targetStackItemId: context.targetStackItemId,
      destination,
      sourceLabel: context.item.label,
    }];
  };
}

export const FOUNDATION_STACK_EFFECTS: Record<string, StackEffectDefinition> = {
  noop_log: {
    id: "noop_log",
    label: "No-op Log",
    object: {
      kind: "ability",
      counterable: false,
      defaultCounterDestination: "none",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "noop_log",
    },
    createInstructions: createNoopLogInstructions,
  },
  deploy_unit_card: {
    id: "deploy_unit_card",
    label: "Deploy Unit",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "deploy_unit",
    },
    createInstructions: createDeployUnitInstructions,
  },
  damage_enemy_base_2: {
    id: "damage_enemy_base_2",
    label: "Deal 2 Base Damage",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "damage_enemy_base",
      amount: 2,
    },
    createInstructions: createDamageEnemyBaseInstructions(2),
  },
  counter_top_item: {
    id: "counter_top_item",
    label: "Counter Spell",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "stack_item",
    },
    behavior: {
      type: "counter",
      destination: "discard",
    },
    createInstructions: createCounterInstructions("discard"),
  },
  counter_to_hand: {
    id: "counter_to_hand",
    label: "Counter to Hand",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "stack_item",
    },
    behavior: {
      type: "counter",
      destination: "hand",
    },
    createInstructions: createCounterInstructions("hand"),
  },
  damage_enemy_unit_2: {
    id: "damage_enemy_unit_2",
    label: "Deal 2 Unit Damage",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "entity",
      entityKind: "unit",
      relation: "enemy",
    },
    behavior: {
      type: "damage_entity",
      amount: 2,
    },
    createInstructions: createDamageEntityInstructions(2),
  },
  damage_enemy_entity_2: {
    id: "damage_enemy_entity_2",
    label: "Deal 2 Damage",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "entity",
      entityKind: "entity",
      relation: "enemy",
    },
    behavior: {
      type: "damage_entity",
      amount: 2,
    },
    createInstructions: createDamageEntityInstructions(2),
  },
  destroy_damaged_enemy_unit: {
    id: "destroy_damaged_enemy_unit",
    label: "Destroy Damaged Unit",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "entity",
      entityKind: "unit",
      relation: "enemy",
      requireDamaged: true,
    },
    behavior: {
      type: "destroy_entity",
      requireDamaged: true,
    },
    createInstructions: createDestroyEntityInstructions(true),
  },
  armor_ally_unit_2_eot: {
    id: "armor_ally_unit_2_eot",
    label: "Grant +2 Armor",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "entity",
      entityKind: "unit",
      relation: "ally",
    },
    behavior: {
      type: "modify_unit_until_end_of_turn",
      attackBonus: 0,
      armorBonus: 2,
    },
    createInstructions: createModifyUnitUntilEndOfTurnInstructions(0, 2),
  },
  mass_damage: {
    id: "mass_damage",
    label: "Mass Damage",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "mass_damage",
    },
    createInstructions: createCardOwnedMassDamageInstructions,
  },
  global_unit_buff: {
    id: "global_unit_buff",
    label: "Global Unit Buff",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "global_unit_buff",
    },
    createInstructions: createCardOwnedGlobalUnitBuffInstructions,
  },
  destroy_damaged_units: {
    id: "destroy_damaged_units",
    label: "Destroy Damaged Units",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "destroy_damaged_units",
    },
    createInstructions: createCardOwnedDestroyDamagedUnitsInstructions,
  },
  draw_and_gain_resources: {
    id: "draw_and_gain_resources",
    label: "Draw and Gain Resources",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "draw_and_gain_resources",
    },
    createInstructions: createCardOwnedDrawAndGainResourcesInstructions,
  },
  draw_card_1_uncounterable: {
    id: "draw_card_1_uncounterable",
    label: "Draw 1 Card",
    object: {
      kind: "ability",
      counterable: false,
      defaultCounterDestination: "none",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "draw_cards",
      count: 1,
    },
    createInstructions: createDrawCardsInstructions(1),
  },
  gain_credit_1_uncounterable: {
    id: "gain_credit_1_uncounterable",
    label: "Gain 1 Credit",
    object: {
      kind: "ability",
      counterable: false,
      defaultCounterDestination: "none",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "gain_resources",
      resources: { credits: 1 },
    },
    createInstructions: createGainResourcesInstructions({ credits: 1 }),
  },
  resources_by_unit_count: {
    id: "resources_by_unit_count",
    label: "Resources By Unit Count",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "resources_by_unit_count",
    },
    createInstructions: createCardOwnedResourcesByUnitCountInstructions,
  },
  hex_area_damage: {
    id: "hex_area_damage",
    label: "Hex Area Damage",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    targeting: {
      type: "hex",
    },
    behavior: {
      type: "hex_area_damage",
    },
    createInstructions: createCardOwnedHexAreaDamageInstructions,
  },
  damage_enemy_unit_1_uncounterable: {
    id: "damage_enemy_unit_1_uncounterable",
    label: "Deal 1 Unit Damage",
    object: {
      kind: "ability",
      counterable: false,
      defaultCounterDestination: "none",
    },
    targeting: {
      type: "entity",
      entityKind: "unit",
      relation: "enemy",
    },
    behavior: {
      type: "damage_entity",
      amount: 1,
    },
    createInstructions: createDamageEntityInstructions(1),
  },
  damage_enemy_base_1_uncounterable: {
    id: "damage_enemy_base_1_uncounterable",
    label: "Deal 1 Base Damage",
    object: {
      kind: "ability",
      counterable: false,
      defaultCounterDestination: "none",
    },
    targeting: {
      type: "none",
    },
    behavior: {
      type: "damage_enemy_base",
      amount: 1,
    },
    createInstructions: createDamageEnemyBaseInstructions(1),
  },
};

export function installFoundationPlayEffectRegistrations(): void {
  registerPlayEffectResolver("mass_damage", (context, effectConfig) => createMassDamageInstructions(effectConfig as never)(context));
  registerPlayEffectResolver("global_unit_buff", (context, effectConfig) => createGlobalUnitBuffInstructions(effectConfig as never)(context));
  registerPlayEffectResolver("destroy_damaged_units", (context, effectConfig) => createDestroyDamagedUnitsInstructions(effectConfig as never)(context));
  registerPlayEffectResolver("draw_and_gain_resources", (context, effectConfig) => createDrawAndGainResourcesInstructions(effectConfig as never)(context));
  registerPlayEffectResolver("resources_by_unit_count", (context, effectConfig) => createResourcesByUnitCountInstructions(effectConfig as never)(context));
  registerPlayEffectResolver("hex_area_damage", (context, effectConfig) => createHexAreaDamageInstructions(effectConfig as never)(context));

  registerPlayEffectMagnitudeCalculator("mass_damage", (effectConfig) => Number(effectConfig.amount ?? 0));
  registerPlayEffectMagnitudeCalculator("global_unit_buff", (effectConfig) =>
    Math.max(
      Math.abs(Number(effectConfig.attackBonus ?? 0)),
      Math.abs(Number(effectConfig.armorBonus ?? 0))
    )
  );
  registerPlayEffectMagnitudeCalculator("destroy_damaged_units", () => 0);
  registerPlayEffectMagnitudeCalculator("draw_and_gain_resources", (effectConfig) =>
    Math.max(
      Number(effectConfig.drawCount ?? 0),
      ...getRegisteredResourceIds().map((resource) =>
        Number((effectConfig.resources as Record<string, number> | undefined)?.[resource] ?? 0)
      ),
      0
    )
  );
  registerPlayEffectMagnitudeCalculator("resources_by_unit_count", (effectConfig) =>
    Math.max(
      ...getRegisteredResourceIds().map((resource) =>
        Number((effectConfig.resourcesPerThreshold as Record<string, number> | undefined)?.[resource] ?? 0) *
        Number(effectConfig.maxThresholds ?? 1)
      ),
      0
    )
  );
  registerPlayEffectMagnitudeCalculator("hex_area_damage", (effectConfig) => Number(effectConfig.amount ?? 0));
}

export function installFoundationStackEffectMagnitudeRegistrations(): void {
  registerStackEffectMagnitudeCalculator("damage_enemy_base", (behavior) => Number(behavior.amount ?? 0));
  registerStackEffectMagnitudeCalculator("damage_entity", (behavior) => Number(behavior.amount ?? 0));
  registerStackEffectMagnitudeCalculator("mass_damage", (_behavior, options) =>
    options.sourceCardId ? getCardPlayEffectMagnitude(getCardDefinition(options.sourceCardId), options.activeModifierIds ?? []) : 0
  );
  registerStackEffectMagnitudeCalculator("global_unit_buff", (_behavior, options) =>
    options.sourceCardId ? getCardPlayEffectMagnitude(getCardDefinition(options.sourceCardId), options.activeModifierIds ?? []) : 0
  );
  registerStackEffectMagnitudeCalculator("destroy_damaged_units", (_behavior, options) =>
    options.sourceCardId ? getCardPlayEffectMagnitude(getCardDefinition(options.sourceCardId), options.activeModifierIds ?? []) : 0
  );
  registerStackEffectMagnitudeCalculator("draw_and_gain_resources", (_behavior, options) =>
    options.sourceCardId ? getCardPlayEffectMagnitude(getCardDefinition(options.sourceCardId), options.activeModifierIds ?? []) : 0
  );
  registerStackEffectMagnitudeCalculator("resources_by_unit_count", (_behavior, options) =>
    options.sourceCardId ? getCardPlayEffectMagnitude(getCardDefinition(options.sourceCardId), options.activeModifierIds ?? []) : 0
  );
  registerStackEffectMagnitudeCalculator("hex_area_damage", (_behavior, options) =>
    options.sourceCardId ? getCardPlayEffectMagnitude(getCardDefinition(options.sourceCardId), options.activeModifierIds ?? []) : 0
  );
  registerStackEffectMagnitudeCalculator("draw_cards", (behavior) => Number(behavior.count ?? 0));
  registerStackEffectMagnitudeCalculator("gain_resources", (behavior) =>
    Math.max(
      ...getRegisteredResourceIds().map((resource) =>
        Number((behavior.resources as Record<string, number> | undefined)?.[resource] ?? 0)
      ),
      0
    )
  );
  registerStackEffectMagnitudeCalculator("noop_log", () => 0);
  registerStackEffectMagnitudeCalculator("deploy_unit", () => 0);
  registerStackEffectMagnitudeCalculator("destroy_entity", () => 0);
  registerStackEffectMagnitudeCalculator("counter", () => 0);
}
