import type { GameInstruction, InstructionContext } from "../../actions/instructions";
import type { ResourceType, UnitRole, Faction } from "../../model/enums";
import type { PlayerId } from "../../model/ids";
import type { EntityState, GameState, HexCoord } from "../../model/state";
import type { CardTrigger } from "../../systems/triggerEngine";

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

export type CardResolveAnimationProfile = {
  kind: string;
} & Record<string, unknown>;

export type CardAnimationProfile = {
  resolve?: CardResolveAnimationProfile;
};

export type CardPlayEffectConfig = {
  type: string;
} & Record<string, unknown>;

export type CardPlayModifierEffectConfigs = Partial<Record<string, CardPlayEffectConfig>>;

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
  modifierEffectConfigs?: CardPlayModifierEffectConfigs;
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
