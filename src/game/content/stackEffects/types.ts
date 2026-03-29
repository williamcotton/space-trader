import type { GameInstruction, InstructionContext } from "../../actions/instructions";

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
    }
  | {
      type: "hex";
    };

export type StackEffectBehavior = {
  type: string;
} & Record<string, unknown>;

export type StackEffectDefinition = {
  id: string;
  label: string;
  object: StackObjectRules;
  targeting: StackTargetingRules;
  behavior: StackEffectBehavior;
  createInstructions: (context: InstructionContext) => GameInstruction[];
};
