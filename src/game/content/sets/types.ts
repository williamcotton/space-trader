import type { CardDefinition } from "../cards/catalog";
import type { ResourceType, UnitRole } from "../../model/enums";
import type { MapState } from "../../model/state";
import type { PlayerTheme, ResourceTheme, RoleTheme } from "../../registries/presentation";
import type { StackEffectDefinition } from "../stackEffects";

export type DeckRecipe = {
  id: string;
  factionId: string;
  cardIds: string[];
};

export type FactionModule = {
  id: string;
  label: string;
  primaryResourceId: string;
  mechanics: string[];
  theme: PlayerTheme;
  mirrorAltTheme?: PlayerTheme;
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
  cards?: Record<string, CardDefinition>;
  stackEffects?: Record<string, StackEffectDefinition>;
  factions?: FactionModule[];
  resources?: ResourceModule[];
  deckRecipes?: DeckRecipe[];
  maps?: MapModule[];
  roleThemes?: Record<UnitRole, RoleTheme>;
  resourceThemes?: Record<ResourceType, ResourceTheme>;
};
