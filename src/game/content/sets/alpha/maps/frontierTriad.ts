import type { HexCoord, MapState } from "../../../../model/state";

const TRIAD_SIZE = 12;

type BarycentricCoord = {
  q: number;
  r: number;
  c: number;
};

function toBarycentric(coord: HexCoord): BarycentricCoord {
  return {
    q: coord.q,
    r: coord.r,
    c: TRIAD_SIZE - coord.q - coord.r,
  };
}

function buildPlayableHexes(): HexCoord[] {
  const coords: HexCoord[] = [];
  for (let r = 0; r <= TRIAD_SIZE; r += 1) {
    for (let q = 0; q <= TRIAD_SIZE - r; q += 1) {
      coords.push({ q, r });
    }
  }
  return coords;
}

function rotatePlayerOneCoordForPlayerTwo(coord: HexCoord): HexCoord {
  const barycentric = toBarycentric(coord);
  return {
    q: barycentric.c,
    r: barycentric.r,
  };
}

function rotatePlayerOneCoordForPlayerThree(coord: HexCoord): HexCoord {
  const barycentric = toBarycentric(coord);
  return {
    q: barycentric.q,
    r: barycentric.c,
  };
}

const PLAYER_1_SPAWN: HexCoord = { q: 1, r: 1 };
const PLAYER_2_SPAWN = rotatePlayerOneCoordForPlayerTwo(PLAYER_1_SPAWN);
const PLAYER_3_SPAWN = rotatePlayerOneCoordForPlayerThree(PLAYER_1_SPAWN);

const PLAYER_1_ALLOY: HexCoord = { q: 3, r: 1 };
const PLAYER_1_FLUX: HexCoord = { q: 2, r: 2 };
const PLAYER_1_BIOMASS: HexCoord = { q: 1, r: 3 };
const PLAYER_1_CREDITS: HexCoord = { q: 3, r: 3 };

export const FRONTIER_TRIAD_MAP: MapState = {
  id: "frontier_triad",
  name: "Frontier Triad",
  width: TRIAD_SIZE + 1,
  height: TRIAD_SIZE + 1,
  playableHexes: buildPlayableHexes(),
  spawnPoints: {
    player_1: PLAYER_1_SPAWN,
    player_2: PLAYER_2_SPAWN,
    player_3: PLAYER_3_SPAWN,
  },
  startingUnitOffsets: {
    player_1: {
      combat: { q: 1, r: 0 },
      resource: { q: 0, r: 1 },
    },
    player_2: {
      combat: { q: -1, r: 0 },
      resource: { q: -1, r: 1 },
    },
    player_3: {
      combat: { q: 1, r: -1 },
      resource: { q: 0, r: -1 },
    },
  },
  resourceNodes: [
    {
      id: "triad_credits_player_1",
      coord: PLAYER_1_CREDITS,
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "triad_credits_player_2",
      coord: rotatePlayerOneCoordForPlayerTwo(PLAYER_1_CREDITS),
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "triad_credits_player_3",
      coord: rotatePlayerOneCoordForPlayerThree(PLAYER_1_CREDITS),
      resourceType: "credits",
      displayName: "Trade Beacon",
      controlledBy: null,
    },
    {
      id: "triad_credits_center",
      coord: { q: 4, r: 4 },
      resourceType: "credits",
      displayName: "Central Trade Beacon",
      controlledBy: null,
    },
    {
      id: "triad_alloy_player_1",
      coord: PLAYER_1_ALLOY,
      resourceType: "alloy",
      displayName: "Ore Mine",
      controlledBy: null,
    },
    {
      id: "triad_flux_player_1",
      coord: PLAYER_1_FLUX,
      resourceType: "flux",
      displayName: "Ion Vent",
      controlledBy: null,
    },
    {
      id: "triad_biomass_player_1",
      coord: PLAYER_1_BIOMASS,
      resourceType: "biomass",
      displayName: "Xenobog",
      controlledBy: null,
    },
    {
      id: "triad_alloy_player_2",
      coord: rotatePlayerOneCoordForPlayerTwo(PLAYER_1_ALLOY),
      resourceType: "alloy",
      displayName: "Ore Mine",
      controlledBy: null,
    },
    {
      id: "triad_flux_player_2",
      coord: rotatePlayerOneCoordForPlayerTwo(PLAYER_1_FLUX),
      resourceType: "flux",
      displayName: "Ion Vent",
      controlledBy: null,
    },
    {
      id: "triad_biomass_player_2",
      coord: rotatePlayerOneCoordForPlayerTwo(PLAYER_1_BIOMASS),
      resourceType: "biomass",
      displayName: "Xenobog",
      controlledBy: null,
    },
    {
      id: "triad_alloy_player_3",
      coord: rotatePlayerOneCoordForPlayerThree(PLAYER_1_ALLOY),
      resourceType: "alloy",
      displayName: "Ore Mine",
      controlledBy: null,
    },
    {
      id: "triad_flux_player_3",
      coord: rotatePlayerOneCoordForPlayerThree(PLAYER_1_FLUX),
      resourceType: "flux",
      displayName: "Ion Vent",
      controlledBy: null,
    },
    {
      id: "triad_biomass_player_3",
      coord: rotatePlayerOneCoordForPlayerThree(PLAYER_1_BIOMASS),
      resourceType: "biomass",
      displayName: "Xenobog",
      controlledBy: null,
    },
  ],
};
