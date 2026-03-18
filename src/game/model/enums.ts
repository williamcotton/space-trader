export const GAME_PHASES = ["start", "economy", "main", "tactical", "end"] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export const RESOURCE_TYPES = ["credits", "alloy", "flux", "biomass"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const FACTIONS = ["alloy_clan", "flux_collective", "biomass_swarm"] as const;
export type Faction = (typeof FACTIONS)[number];

export const UNIT_ROLES = ["resource", "combat", "utility"] as const;
export type UnitRole = (typeof UNIT_ROLES)[number];
