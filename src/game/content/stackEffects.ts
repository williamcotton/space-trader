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

export type StackResolutionRules =
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
  resolution: StackResolutionRules;
};

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
    resolution: {
      type: "noop_log",
    },
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
    resolution: {
      type: "deploy_unit",
    },
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
    resolution: {
      type: "damage_enemy_base",
      amount: 2,
    },
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
    resolution: {
      type: "counter",
      destination: "discard",
    },
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
    resolution: {
      type: "counter",
      destination: "hand",
    },
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
    resolution: {
      type: "damage_entity",
      amount: 2,
    },
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
    resolution: {
      type: "damage_entity",
      amount: 2,
    },
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
    resolution: {
      type: "destroy_entity",
      requireDamaged: true,
    },
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
    resolution: {
      type: "modify_unit_until_end_of_turn",
      attackBonus: 0,
      armorBonus: 2,
    },
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
    resolution: {
      type: "damage_entity",
      amount: 1,
    },
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
  return effect?.resolution.type === "counter";
}

export function requiresEntityTarget(effectId: string): boolean {
  const effect = getStackEffectDefinition(effectId);
  return effect?.targeting.type === "entity";
}
