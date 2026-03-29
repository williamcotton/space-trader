import type { CardAnimationAccent } from "../content/cards/catalog";
import type { Faction, ResourceType, UnitRole } from "../model/enums";

export type PlayerTheme = {
  label: string;
  primary: string;
  secondary: string;
  glow: string;
  shadow: string;
  fillDark: string;
  line: string;
};

export type ResourceTheme = {
  label: string;
  shortLabel: string;
  color: string;
  glow: string;
};

export type RoleTheme = {
  label: string;
  accent: string;
};

export type FactionPresentation = {
  label: string;
  theme: PlayerTheme;
  mirrorAltTheme?: PlayerTheme;
  animationAccent: CardAnimationAccent;
};

const factionPresentations = new Map<Faction, FactionPresentation>();
const resourceThemes = new Map<ResourceType, ResourceTheme>();
const unitRoleThemes = new Map<UnitRole, RoleTheme>();

export function registerFactionPresentation(factionId: Faction, presentation: FactionPresentation): void {
  factionPresentations.set(factionId, presentation);
}

export function getFactionPresentation(factionId: Faction): FactionPresentation {
  const presentation = factionPresentations.get(factionId);
  if (!presentation) {
    throw new Error(`Missing faction presentation for ${factionId}.`);
  }
  return presentation;
}

export function getFactionAnimationAccent(factionId: Faction | "neutral" | null | undefined): CardAnimationAccent {
  if (!factionId || factionId === "neutral") {
    return "neutral";
  }
  return getFactionPresentation(factionId).animationAccent;
}

export function registerResourceTheme(resourceType: ResourceType, theme: ResourceTheme): void {
  resourceThemes.set(resourceType, theme);
}

export function getRegisteredResourceTheme(resourceType: ResourceType): ResourceTheme {
  const theme = resourceThemes.get(resourceType);
  if (!theme) {
    throw new Error(`Missing resource theme for ${resourceType}.`);
  }
  return theme;
}

export function registerUnitRoleTheme(role: UnitRole, theme: RoleTheme): void {
  unitRoleThemes.set(role, theme);
}

export function getRegisteredUnitRoleTheme(role: UnitRole): RoleTheme {
  const theme = unitRoleThemes.get(role);
  if (!theme) {
    throw new Error(`Missing unit role theme for ${role}.`);
  }
  return theme;
}
