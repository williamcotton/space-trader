export const GAME_PHASES = ["start", "economy", "main", "tactical", "end", "discard"] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export type ResourceType = string;
export const RESOURCE_TYPES: ResourceType[] = [];

export type Faction = string;
export const FACTIONS: Faction[] = [];

export const UNIT_ROLES = ["resource", "combat", "utility"] as const;
export type UnitRole = (typeof UNIT_ROLES)[number];
