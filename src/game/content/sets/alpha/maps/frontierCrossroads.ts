import type { MapState } from "../../../../model/state";

export const FRONTIER_CROSSROADS_MAP: MapState = {
  id: "frontier_crossroads",
  name: "Frontier Crossroads",
  width: 15,
  height: 13,
  spawnPoints: {
    player_1: { q: -5, r: -4 },
    player_2: { q: 5, r: -4 },
    player_3: { q: 5, r: 4 },
    player_4: { q: -5, r: 4 },
  },
  startingUnitOffsets: {
    player_1: {
      combat: { q: 1, r: 0 },
      resource: { q: 0, r: 1 },
    },
    player_2: {
      combat: { q: 0, r: 1 },
      resource: { q: -1, r: 0 },
    },
    player_3: {
      combat: { q: -1, r: 0 },
      resource: { q: 0, r: -1 },
    },
    player_4: {
      combat: { q: 0, r: -1 },
      resource: { q: 1, r: 0 },
    },
  },
  resourceNodes: [
    {
      id: "crossroads_credits_center",
      coord: { q: 0, r: 0 },
      resourceType: "credits",
      displayName: "Grand Exchange",
      controlledBy: null,
    },
    {
      id: "crossroads_credits_northwest",
      coord: { q: -1, r: -1 },
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "crossroads_credits_northeast",
      coord: { q: 1, r: -1 },
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "crossroads_credits_southwest",
      coord: { q: -1, r: 1 },
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "crossroads_credits_southeast",
      coord: { q: 1, r: 1 },
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "crossroads_alloy_northwest",
      coord: { q: -4, r: -3 },
      resourceType: "alloy",
      displayName: "Ore Mine",
      controlledBy: null,
    },
    {
      id: "crossroads_flux_northeast",
      coord: { q: 4, r: -3 },
      resourceType: "flux",
      displayName: "Ion Vent",
      controlledBy: null,
    },
    {
      id: "crossroads_biomass_southeast",
      coord: { q: 4, r: 3 },
      resourceType: "biomass",
      displayName: "Xenobog",
      controlledBy: null,
    },
    {
      id: "crossroads_alloy_southwest",
      coord: { q: -4, r: 3 },
      resourceType: "alloy",
      displayName: "Ore Mine",
      controlledBy: null,
    },
    {
      id: "crossroads_flux_north",
      coord: { q: 0, r: -3 },
      resourceType: "flux",
      displayName: "Ion Vent",
      controlledBy: null,
    },
    {
      id: "crossroads_biomass_south",
      coord: { q: 0, r: 3 },
      resourceType: "biomass",
      displayName: "Xenobog",
      controlledBy: null,
    },
  ],
};
