import type { GameInstruction, InstructionContext } from "../../actions/instructions";
import type { ResourceType, UnitRole, Faction } from "../../model/enums";
import type { PlayerId } from "../../model/ids";
import type { EntityState, GameState, HexCoord } from "../../model/state";
import type { CardTrigger } from "../../systems/triggerEngine";
import type {
  CascadeUnitBuffReward,
  EffectRelation,
} from "./instructionFactories";

export type TargetPredicate = (
  state: Readonly<GameState>,
  target: EntityState,
  sourcePlayerId: PlayerId
) => boolean;

export type HexTargetPredicate = (
  state: Readonly<GameState>,
  target: HexCoord,
  sourcePlayerId: PlayerId
) => boolean;

export type CardKeyword = string;
export type CardSpeed = "instant" | "main";
export type CardTargetMode = "none" | "entity" | "stack_item" | "hex";
export type CardSourceDestination = "discard" | "hand" | "exile" | "none";
export type CardAnimationAccent = string;

export type CardCost = Partial<Record<ResourceType, number>>;

export type CardResolveAnimationProfile =
  | {
      kind: "hex_shower";
      label: string;
      waves: number;
      accent: CardAnimationAccent;
    }
  | {
      kind: "board_blast";
      label: string;
      accent: CardAnimationAccent;
    };

export type CardAnimationProfile = {
  resolve?: CardResolveAnimationProfile;
};

export type MassDamagePlayEffectConfig = {
  type: "mass_damage";
  amount: number;
  relation: EffectRelation;
};

export type GlobalUnitBuffPlayEffectConfig = {
  type: "global_unit_buff";
  attackBonus: number;
  armorBonus: number;
  relation: EffectRelation;
  roleFilter?: UnitRole;
};

export type DestroyDamagedUnitsPlayEffectConfig = {
  type: "destroy_damaged_units";
  relation: EffectRelation;
};

export type DrawAndGainResourcesPlayEffectConfig = {
  type: "draw_and_gain_resources";
  drawCount: number;
  resources: CardCost;
};

export type ResourcesByUnitCountPlayEffectConfig = {
  type: "resources_by_unit_count";
  relation: EffectRelation;
  threshold: number;
  resourcesPerThreshold: CardCost;
  roleFilter?: UnitRole;
  maxThresholds?: number;
};

export type ResourcesByBloomCountPlayEffectConfig = {
  type: "resources_by_bloom_count";
  threshold: number;
  resourcesPerThreshold: CardCost;
  maxThresholds?: number;
};

export type ResourcesBySalvageCountPlayEffectConfig = {
  type: "resources_by_salvage_count";
  threshold: number;
  resourcesPerThreshold: CardCost;
  maxThresholds?: number;
};

export type HexAreaDamagePlayEffectConfig = {
  type: "hex_area_damage";
  amount: number;
  radius: number;
  relation: EffectRelation;
};

export type CascadeUnitBuffPlayEffectConfig = {
  type: "cascade_unit_buff";
  attackBonus: number;
  armorBonus: number;
  waves: number;
  roleFilter?: UnitRole;
  grantedKeywords?: CardKeyword[];
  reward?: CascadeUnitBuffReward;
};

export type CardPlayEffectConfig =
  | MassDamagePlayEffectConfig
  | GlobalUnitBuffPlayEffectConfig
  | DestroyDamagedUnitsPlayEffectConfig
  | DrawAndGainResourcesPlayEffectConfig
  | ResourcesByUnitCountPlayEffectConfig
  | ResourcesByBloomCountPlayEffectConfig
  | ResourcesBySalvageCountPlayEffectConfig
  | HexAreaDamagePlayEffectConfig
  | CascadeUnitBuffPlayEffectConfig;

export type UnitAura = {
  type: "adjacent_ally_buff";
  targetRole?: UnitRole;
  attackBonus?: number;
  armorBonus?: number;
  siegeBonus?: number;
};

export type UnitTemplate = {
  role: UnitRole;
  hp: number;
  attackDamage: number;
  siegeDamageBonus: number;
  armor: number;
  moveRange: number;
  attackRange: number;
  attackActionsPerTurn: number;
  keywords?: CardKeyword[];
  auras?: UnitAura[];
};

type CardBase = {
  id: string;
  name: string;
  faction: Faction | "neutral";
  speed: CardSpeed;
  cost: CardCost;
  text: string;
  keywords?: CardKeyword[];
  play: CardPlayProfile;
  animation?: CardAnimationProfile;
};

type CardPlayBase = {
  stackEffectId: string;
  effectConfig?: CardPlayEffectConfig;
  surgeEffectConfig?: CardPlayEffectConfig;
  sourceDestinationOnResolve: CardSourceDestination;
  requiresOpenBaseAdjacentTile?: boolean;
  reserveEntityId?: boolean;
};

export type CardPlayProfile =
  | (CardPlayBase & {
      targetMode: "none";
      isValidTarget?: undefined;
    })
  | (CardPlayBase & {
      targetMode: "stack_item";
      isValidTarget?: undefined;
    })
  | (CardPlayBase & {
      targetMode: "entity";
      isValidTarget: TargetPredicate;
      isValidHexTarget?: undefined;
    })
  | (CardPlayBase & {
      targetMode: "hex";
      isValidTarget?: undefined;
      isValidHexTarget: HexTargetPredicate;
    });

export type AutoTargetStrategy = string;

export type UnitTrigger = {
  event: string;
  effectId: string;
  labelSuffix: string;
  autoTarget: AutoTargetStrategy;
};

export type UnitCardDefinition = CardBase & {
  kind: "unit";
  unit: UnitTemplate;
  /** @deprecated Use `triggers` array instead */
  trigger?: UnitTrigger;
  triggers?: CardTrigger[];
  onResolve?: (context: InstructionContext) => GameInstruction[];
};

export type TacticCardDefinition = CardBase & {
  kind: "tactic";
  onResolve?: (context: InstructionContext) => GameInstruction[];
};

export type CardDefinition = TacticCardDefinition | UnitCardDefinition;

