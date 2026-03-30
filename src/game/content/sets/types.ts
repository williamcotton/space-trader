import type { CardDefinition, CardAnimationAccent } from "../cards/types";
import type { ResourceType, UnitRole } from "../../model/enums";
import type { PlayerId } from "../../model/ids";
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

export type ResourceGlyphShape =
  | {
      type: "polygon";
      points: string;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    }
  | {
      type: "circle";
      cx: number;
      cy: number;
      r: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    }
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    }
  | {
      type: "path";
      d: string;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      strokeLinecap?: CanvasLineCap;
      strokeLinejoin?: CanvasLineJoin;
    }
  | {
      type: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke?: string;
      strokeWidth?: number;
      strokeLinecap?: CanvasLineCap;
    };

export type ResourceGlyphDefinition = {
  viewBox?: {
    width: number;
    height: number;
  };
  shapes: ResourceGlyphShape[];
};

export type ResourceModule = {
  id: ResourceType;
  label: string;
  shortLabel: string;
  color: string;
  glow: string;
  kind?: "currency" | "primary" | "other";
  displayOrder?: number;
  glyph?: ResourceGlyphDefinition;
};

export type MapModule = {
  id: string;
  map: MapState;
};

export type RuntimeProfile = {
  id: string;
  label: string;
  defaultMapId: string;
  defaultFactions?: Partial<Record<PlayerId, string>>;
  matchIdPrefix?: string;
  default?: boolean;
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
  runtimeProfiles?: RuntimeProfile[];
  roleThemes?: Record<UnitRole, RoleTheme>;
  resourceThemes?: Record<ResourceType, ResourceTheme>;
};
