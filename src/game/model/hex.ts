import type { HexCoord, MapState } from "./state";

type CubeCoord = {
  x: number;
  y: number;
  z: number;
};

export function axialToCube(coord: HexCoord): CubeCoord {
  const x = coord.q;
  const z = coord.r;
  const y = -x - z;
  return { x, y, z };
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
