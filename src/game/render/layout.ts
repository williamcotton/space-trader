import { getMapAxialBounds } from "../model/hex";
import type { MapState } from "../model/state";
import type { GameViewport } from "../types";

function getNormalizedMapBounds(map: MapState): { minX: number; maxX: number; minY: number; maxY: number } {
  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(map);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let r = rMin; r <= rMax; r += 1) {
    for (let q = qMin; q <= qMax; q += 1) {
      const centerX = Math.sqrt(3) * (q + r / 2);
      const centerY = 1.5 * r;
      minX = Math.min(minX, centerX - 1);
      maxX = Math.max(maxX, centerX + 1);
      minY = Math.min(minY, centerY - 1);
      maxY = Math.max(maxY, centerY + 1);
    }
  }

  return { minX, maxX, minY, maxY };
}

export function getHexMetrics(viewport: GameViewport, map: MapState): { size: number; origin: { x: number; y: number } } {
  const bounds = getNormalizedMapBounds(map);
  const paddingX = Math.max(28, viewport.width * 0.055);
  const paddingY = Math.max(28, viewport.height * 0.07);
  const usableWidth = Math.max(120, viewport.width - paddingX * 2);
  const usableHeight = Math.max(120, viewport.height - paddingY * 2);
  const mapWidth = bounds.maxX - bounds.minX;
  const mapHeight = bounds.maxY - bounds.minY;
  const size = Math.max(20, Math.min(40, Math.min(usableWidth / mapWidth, usableHeight / mapHeight)));
  const extraX = usableWidth - mapWidth * size;
  const extraY = usableHeight - mapHeight * size;

  return {
    size,
    origin: {
      x: paddingX + extraX / 2 - bounds.minX * size,
      y: paddingY + extraY / 2 - bounds.minY * size,
    },
  };
}
