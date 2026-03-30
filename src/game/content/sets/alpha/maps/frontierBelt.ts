import type { MapState } from "../../../../model/state";

export const FRONTIER_BELT_MAP: MapState = {
  id: "frontier_belt",
  name: "Frontier Belt",
  width: 11,
  height: 9,
  spawnPoints: {
    player_1: { q: -4, r: -2 },
    player_2: { q: 4, r: 2 },
  },
  resourceNodes: [
    {
      id: "frontier_credits_center",
      coord: { q: 0, r: 0 },
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "frontier_credits_northwest",
      coord: { q: -2, r: 1 },
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "frontier_credits_southeast",
      coord: { q: 2, r: -1 },
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "frontier_alloy_west",
      coord: { q: -3, r: -1 },
      resourceType: "alloy",
      displayName: "Ore Mine",
      controlledBy: null,
    },
    {
      id: "frontier_alloy_east",
      coord: { q: 3, r: 1 },
      resourceType: "alloy",
      displayName: "Ore Mine",
      controlledBy: null,
    },
    {
      id: "frontier_flux_north",
      coord: { q: -2, r: -2 },
      resourceType: "flux",
      displayName: "Ion Vent",
      controlledBy: null,
    },
    {
      id: "frontier_flux_south",
      coord: { q: 2, r: 2 },
      resourceType: "flux",
      displayName: "Ion Vent",
      controlledBy: null,
    },
    {
      id: "frontier_biomass_northwest",
      coord: { q: -4, r: 0 },
      resourceType: "biomass",
      displayName: "Xenobog",
      controlledBy: null,
    },
    {
      id: "frontier_biomass_southeast",
      coord: { q: 4, r: 0 },
      resourceType: "biomass",
      displayName: "Xenobog",
      controlledBy: null,
    },
  ],
};
