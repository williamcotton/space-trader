import type { CardDefinition, CardAnimationAccent } from "../cards/types";
import type { ResourceType, UnitRole } from "../../model/enums";
import type { MapState } from "../../model/state";
import type { PlayerTheme, ResourceTheme, RoleTheme } from "../../registries/presentation";
import type { StackEffectDefinition } from "../stackEffects/types";
import type { SetMechanicModule } from "../mechanics/types";

export type SetInstallerModule = {
  id: string;
  install: () => void;
};

export type DeckRecipe = {
  id: string;
  factionId: string;
  cardIds: string[];
};

export type StartingUnitOverrides = Partial<{
  name: string;
  hp: number;
  attackDamage: number;
  siegeDamageBonus: number;
  armor: number;
  moveRange: number;
  attackRange: number;
  attackActionsPerTurn: number;
  keywords: string[];
}>;

export type FactionModule = {
  id: string;
  label: string;
  primaryResourceId: string;
  mechanics: string[];
  theme: PlayerTheme;
  mirrorAltTheme?: PlayerTheme;
  animationAccent?: CardAnimationAccent;
  startingCombatUnitCardId: string;
  startingResourceUnitCardId: string;
  startingCombatUnitOverrides?: StartingUnitOverrides;
  startingResourceUnitOverrides?: StartingUnitOverrides;
};

export type ResourceModule = {
  id: ResourceType;
  label: string;
  shortLabel: string;
  color: string;
  glow: string;
};

export type MapModule = {
  id: string;
  map: MapState;
};

export type CardSet = {
  id: string;
  name: string;
  dependencies?: string[];
  mechanics?: SetMechanicModule[];
  installers?: SetInstallerModule[];
  cards?: Record<string, CardDefinition>;
  stackEffects?: Record<string, StackEffectDefinition>;
  factions?: FactionModule[];
  resources?: ResourceModule[];
  deckRecipes?: DeckRecipe[];
  maps?: MapModule[];
  roleThemes?: Record<UnitRole, RoleTheme>;
  resourceThemes?: Record<ResourceType, ResourceTheme>;
};
