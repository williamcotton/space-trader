export type CounterDestination = "discard" | "hand" | "exile" | "none";
export type StackObjectKind = "spell" | "ability";

export type StackObjectRules = {
  kind: StackObjectKind;
  counterable: boolean;
  defaultCounterDestination: CounterDestination;
};

export type StackResolutionRules =
  | {
      type: "noop_log";
    }
  | {
      type: "damage_enemy_base";
      amount: number;
    }
  | {
      type: "counter";
      destination: CounterDestination;
    };

export type StackEffectDefinition = {
  id: string;
  label: string;
  object: StackObjectRules;
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
    resolution: {
      type: "noop_log",
    },
  },
  damage_enemy_base_2: {
    id: "damage_enemy_base_2",
    label: "Orbital Ping",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    resolution: {
      type: "damage_enemy_base",
      amount: 2,
    },
  },
  counter_top_item: {
    id: "counter_top_item",
    label: "Counter Pulse",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    resolution: {
      type: "counter",
      destination: "discard",
    },
  },
  counter_to_hand: {
    id: "counter_to_hand",
    label: "Echo Recall",
    object: {
      kind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
    },
    resolution: {
      type: "counter",
      destination: "hand",
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
