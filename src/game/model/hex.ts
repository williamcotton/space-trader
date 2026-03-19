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

export function getMapAxialBounds(map: MapState): { qMin: number; qMax: number; rMin: number; rMax: number } {
  const qRadius = Math.floor(map.width / 2);
  const rRadius = Math.floor(map.height / 2);
  return {
    qMin: -qRadius,
    qMax: qRadius,
    rMin: -rRadius,
    rMax: rRadius,
  };
}

export function isWithinMapBounds(coord: HexCoord, map: MapState): boolean {
  const bounds = getMapAxialBounds(map);
  return coord.q >= bounds.qMin && coord.q <= bounds.qMax && coord.r >= bounds.rMin && coord.r <= bounds.rMax;
}

export function areSameHex(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}
