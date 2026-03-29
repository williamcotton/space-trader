import type { GameInstruction, InstructionContext } from "../../actions/instructions";
import type { ResourceType, UnitRole } from "../../model/enums";

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
      type: "mass_damage";
    }
  | {
      type: "global_unit_buff";
    }
  | {
      type: "destroy_damaged_units";
    }
  | {
      type: "draw_and_gain_resources";
    }
  | {
      type: "draw_cards";
      count: number;
    }
  | {
      type: "gain_resources";
      resources: Partial<Record<ResourceType, number>>;
    }
  | {
      type: "resources_by_unit_count";
    }
  | {
      type: "resources_by_bloom_count";
    }
  | {
      type: "resources_by_salvage_count";
    }
  | {
      type: "hex_area_damage";
    }
  | {
      type: "cascade_unit_buff";
      attackBonus: number;
      armorBonus: number;
      waves: number;
      roleFilter?: UnitRole;
      reward?: {
        resource: ResourceType;
        amount: number;
        minUnits: number;
      };
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

