import type { HexCoord, MapState } from "../../../../model/state";

const CROSSROADS_COLUMNS = 13;
const CROSSROADS_ROWS = 11;
const CROSSROADS_Q_SHIFT = -4;
const CROSSROADS_R_SHIFT = -5;

function offsetRectToAxial(col: number, row: number): HexCoord {
  return {
    q: col - Math.floor(row / 2) + CROSSROADS_Q_SHIFT,
    r: row + CROSSROADS_R_SHIFT,
  };
}

function buildPlayableHexes(): HexCoord[] {
  const coords: HexCoord[] = [];
  for (let row = 0; row < CROSSROADS_ROWS; row += 1) {
    for (let col = 0; col < CROSSROADS_COLUMNS; col += 1) {
      coords.push(offsetRectToAxial(col, row));
    }
  }
  return coords;
}

function offsetFrom(base: HexCoord, delta: HexCoord): HexCoord {
  return {
    q: base.q + delta.q,
    r: base.r + delta.r,
  };
}

const PLAYER_1_SPAWN = offsetRectToAxial(2, 1);
const PLAYER_2_SPAWN = offsetRectToAxial(10, 1);
const PLAYER_3_SPAWN = offsetRectToAxial(10, 9);
const PLAYER_4_SPAWN = offsetRectToAxial(2, 9);

export const FRONTIER_CROSSROADS_MAP: MapState = {
  id: "frontier_crossroads",
  name: "Frontier Crossroads",
  width: CROSSROADS_COLUMNS,
  height: CROSSROADS_ROWS,
  playableHexes: buildPlayableHexes(),
  spawnPoints: {
    player_1: PLAYER_1_SPAWN,
    player_2: PLAYER_2_SPAWN,
    player_3: PLAYER_3_SPAWN,
    player_4: PLAYER_4_SPAWN,
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
      id: "crossroads_credits_player_1",
      coord: offsetFrom(PLAYER_1_SPAWN, { q: 2, r: 2 }),
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "crossroads_credits_player_2",
      coord: offsetFrom(PLAYER_2_SPAWN, { q: -4, r: 2 }),
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "crossroads_credits_player_3",
      coord: offsetFrom(PLAYER_3_SPAWN, { q: -2, r: -2 }),
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "crossroads_credits_player_4",
      coord: offsetFrom(PLAYER_4_SPAWN, { q: 4, r: -2 }),
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "crossroads_alloy_player_1",
      coord: offsetFrom(PLAYER_1_SPAWN, { q: 2, r: 0 }),
      resourceType: "alloy",
      displayName: "Ore Mine",
      controlledBy: null,
    },
    {
      id: "crossroads_flux_player_1",
      coord: offsetFrom(PLAYER_1_SPAWN, { q: 1, r: 1 }),
      resourceType: "flux",
      displayName: "Ion Vent",
      controlledBy: null,
    },
    {
      id: "crossroads_biomass_player_1",
      coord: offsetFrom(PLAYER_1_SPAWN, { q: 0, r: 2 }),
      resourceType: "biomass",
      displayName: "Xenobog",
      controlledBy: null,
    },
    {
      id: "crossroads_alloy_player_2",
      coord: offsetFrom(PLAYER_2_SPAWN, { q: -2, r: 0 }),
      resourceType: "alloy",
      displayName: "Ore Mine",
      controlledBy: null,
    },
    {
      id: "crossroads_flux_player_2",
      coord: offsetFrom(PLAYER_2_SPAWN, { q: -1, r: 2 }),
      resourceType: "flux",
      displayName: "Ion Vent",
      controlledBy: null,
    },
    {
      id: "crossroads_biomass_player_2",
      coord: offsetFrom(PLAYER_2_SPAWN, { q: 0, r: 2 }),
      resourceType: "biomass",
      displayName: "Xenobog",
      controlledBy: null,
    },
    {
      id: "crossroads_alloy_player_3",
      coord: offsetFrom(PLAYER_3_SPAWN, { q: -2, r: 0 }),
      resourceType: "alloy",
      displayName: "Ore Mine",
      controlledBy: null,
    },
    {
      id: "crossroads_flux_player_3",
      coord: offsetFrom(PLAYER_3_SPAWN, { q: -1, r: -1 }),
      resourceType: "flux",
      displayName: "Ion Vent",
      controlledBy: null,
    },
    {
      id: "crossroads_biomass_player_3",
      coord: offsetFrom(PLAYER_3_SPAWN, { q: 0, r: -2 }),
      resourceType: "biomass",
      displayName: "Xenobog",
      controlledBy: null,
    },
    {
      id: "crossroads_alloy_player_4",
      coord: offsetFrom(PLAYER_4_SPAWN, { q: 2, r: 0 }),
      resourceType: "alloy",
      displayName: "Ore Mine",
      controlledBy: null,
    },
    {
      id: "crossroads_flux_player_4",
      coord: offsetFrom(PLAYER_4_SPAWN, { q: 1, r: -2 }),
      resourceType: "flux",
      displayName: "Ion Vent",
      controlledBy: null,
    },
    {
      id: "crossroads_biomass_player_4",
      coord: offsetFrom(PLAYER_4_SPAWN, { q: 0, r: -2 }),
      resourceType: "biomass",
      displayName: "Xenobog",
      controlledBy: null,
    },
  ],
};
