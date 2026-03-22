import type { GameInstruction, InstructionContext } from "../actions/instructions";
import { getCardDefinition } from "./cards/catalog";
import { LAYER } from "../systems/continuousEffects";

export type CounterDestination = "discard" | "hand" | "exile" | "none";
export type StackObjectKind = "spell" | "ability";
export type StackEntityTargetKind = "unit" | "entity";
export type StackEntityTargetRelation = "ally" | "enemy" | "any";

export type StackObjectRules = {
  kind: StackObjectKind;
  counterable: boolean;
  defaultCounterDestination: CounterDestination;
};

export type StackTargetingRules =
  | {
      type: "none";
    }
  | {
      type: "stack_item";
    }
  | {
      type: "entity";
      entityKind: StackEntityTargetKind;
      relation: StackEntityTargetRelation;
      requireDamaged?: boolean;
    };

export type StackEffectBehavior =
  | {
      type: "noop_log";
    }
  | {
      type: "deploy_unit";
    }
  | {
      type: "damage_enemy_base";
      amount: number;
    }
  | {
      type: "damage_entity";
      amount: number;
    }
  | {
      type: "destroy_entity";
      requireDamaged: boolean;
    }
  | {
      type: "modify_unit_until_end_of_turn";
      attackBonus: number;
      armorBonus: number;
    }
  | {
      type: "counter";
      destination: CounterDestination;
    };

export type StackEffectDefinition = {
  id: string;
  label: string;
  object: StackObjectRules;
  targeting: StackTargetingRules;
  behavior: StackEffectBehavior;
  createInstructions: (context: InstructionContext) => GameInstruction[];
};

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

const STACK_EFFECTS: Record<string, StackEffectDefinition> = {
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
};

export function getStackEffectDefinition(effectId: string): StackEffectDefinition | undefined {
  return STACK_EFFECTS[effectId];
}

export function isKnownStackEffect(effectId: string): boolean {
  return typeof STACK_EFFECTS[effectId] !== "undefined";
}

export function isCounterResponse(effectId: string): boolean {
  const effect = getStackEffectDefinition(effectId);
  return effect?.behavior.type === "counter";
}

export function requiresEntityTarget(effectId: string): boolean {
  const effect = getStackEffectDefinition(effectId);
  return effect?.targeting.type === "entity";
}

export function getStackEffectMagnitude(effectId: string): number {
  const effect = getStackEffectDefinition(effectId);
  if (!effect) return 0;

  switch (effect.behavior.type) {
    case "damage_enemy_base":
    case "damage_entity":
      return effect.behavior.amount;
    default:
      return 0;
  }
}
