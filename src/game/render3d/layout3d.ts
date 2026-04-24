import { getPlayableHexes } from "../model/hex";
import type { HexCoord, MapState } from "../model/state";
import type { GameViewport } from "../types";

export const THREE_HEX_RADIUS = 1;
const SQRT3 = Math.sqrt(3);

export type WorldPoint3D = {
  x: number;
  y: number;
  z: number;
};

export type ThreeCameraLayout = {
  center: WorldPoint3D;
  position: WorldPoint3D;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function hexToWorldPoint(coord: HexCoord, y = 0): WorldPoint3D {
  return {
    x: THREE_HEX_RADIUS * SQRT3 * (coord.q + coord.r / 2),
    y,
    z: THREE_HEX_RADIUS * 1.5 * coord.r,
  };
}

export function getThreeCameraLayout(map: MapState, viewport: GameViewport): ThreeCameraLayout {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const coord of getPlayableHexes(map)) {
    const point = hexToWorldPoint(coord);
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    minX = -1;
    maxX = 1;
    minZ = -1;
    maxZ = 1;
  }

  const center = {
    x: (minX + maxX) / 2,
    y: 0,
    z: (minZ + maxZ) / 2,
  };
  const halfWidth = Math.max(1, (maxX - minX) / 2);
  const halfDepth = Math.max(1, (maxZ - minZ) / 2);
  const aspect = viewport.width / Math.max(1, viewport.height);
  const verticalSize = Math.max(3.2, halfDepth * 1.06 + 0.95, (halfWidth * 1.02 + 1.05) / aspect);
  const horizontalSize = verticalSize * aspect;

  return {
    center,
    position: {
      x: center.x,
      y: 8.5,
      z: center.z + 8.5,
    },
    left: -horizontalSize,
    right: horizontalSize,
    top: verticalSize,
    bottom: -verticalSize,
  };
}
