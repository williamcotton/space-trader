import type { HexCoord, MapState } from "./state";

type CubeCoord = {
  x: number;
  y: number;
  z: number;
};

type PixelCoord = {
  x: number;
  y: number;
};

export function axialToCube(coord: HexCoord): CubeCoord {
  const x = coord.q;
  const z = coord.r;
  const y = -x - z;
  return { x, y, z };
}

function cubeToAxial(coord: CubeCoord): HexCoord {
  return { q: coord.x, r: coord.z };
}

function roundCube(coord: CubeCoord): CubeCoord {
  let rx = Math.round(coord.x);
  let ry = Math.round(coord.y);
  let rz = Math.round(coord.z);

  const xDiff = Math.abs(rx - coord.x);
  const yDiff = Math.abs(ry - coord.y);
  const zDiff = Math.abs(rz - coord.z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { x: rx, y: ry, z: rz };
}

export function axialToPixel(coord: HexCoord, origin: PixelCoord, hexSize: number): PixelCoord {
  const x = origin.x + hexSize * Math.sqrt(3) * (coord.q + coord.r / 2);
  const y = origin.y + hexSize * 1.5 * coord.r;
  return { x, y };
}

export function pixelToAxial(point: PixelCoord, origin: PixelCoord, hexSize: number): HexCoord {
  const localX = point.x - origin.x;
  const localY = point.y - origin.y;

  const q = localX / (Math.sqrt(3) * hexSize) - localY / (3 * hexSize);
  const r = (2 / 3) * (localY / hexSize);
  const rounded = roundCube(axialToCube({ q, r }));
  return cubeToAxial(rounded);
}

export function hexDistance(from: HexCoord, to: HexCoord): number {
  const a = axialToCube(from);
  const b = axialToCube(to);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

let cachedPlayableHexesKey = "";
let cachedPlayableHexes: HexCoord[] = [];
let cachedPlayableHexSet: Set<string> = new Set();

function buildPlayableHexesKey(map: MapState): string {
  const playableHexes = map.playableHexes ?? [];
  const first = playableHexes[0];
  const last = playableHexes[playableHexes.length - 1];
  return [
    map.id,
    map.width,
    map.height,
    playableHexes.length,
    first ? `${first.q},${first.r}` : "none",
    last ? `${last.q},${last.r}` : "none",
  ].join("|");
}

export function getPlayableHexes(map: MapState): HexCoord[] {
  const key = buildPlayableHexesKey(map);
  if (cachedPlayableHexesKey === key) {
    return cachedPlayableHexes;
  }

  if (map.playableHexes && map.playableHexes.length > 0) {
    cachedPlayableHexes = map.playableHexes;
  } else {
    const qRadius = Math.floor(map.width / 2);
    const rRadius = Math.floor(map.height / 2);
    const coords: HexCoord[] = [];
    for (let r = -rRadius; r <= rRadius; r += 1) {
      for (let q = -qRadius; q <= qRadius; q += 1) {
        coords.push({ q, r });
      }
    }
    cachedPlayableHexes = coords;
  }

  cachedPlayableHexSet = new Set(cachedPlayableHexes.map((coord) => hexKey(coord)));
  cachedPlayableHexesKey = key;
  return cachedPlayableHexes;
}

export function getMapAxialBounds(map: MapState): { qMin: number; qMax: number; rMin: number; rMax: number } {
  const playableHexes = getPlayableHexes(map);
  let qMin = Number.POSITIVE_INFINITY;
  let qMax = Number.NEGATIVE_INFINITY;
  let rMin = Number.POSITIVE_INFINITY;
  let rMax = Number.NEGATIVE_INFINITY;

  for (const coord of playableHexes) {
    qMin = Math.min(qMin, coord.q);
    qMax = Math.max(qMax, coord.q);
    rMin = Math.min(rMin, coord.r);
    rMax = Math.max(rMax, coord.r);
  }

  return {
    qMin: Number.isFinite(qMin) ? qMin : 0,
    qMax: Number.isFinite(qMax) ? qMax : 0,
    rMin: Number.isFinite(rMin) ? rMin : 0,
    rMax: Number.isFinite(rMax) ? rMax : 0,
  };
}

export function isWithinMapBounds(coord: HexCoord, map: MapState): boolean {
  getPlayableHexes(map);
  return cachedPlayableHexSet.has(hexKey(coord));
}

export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

export function areSameHex(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}
