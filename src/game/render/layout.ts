import { getMapAxialBounds } from "../model/hex";
import type { MapState } from "../model/state";
import type { GameViewport } from "../types";

const SQRT3 = Math.sqrt(3);

type MapBounds = { minX: number; maxX: number; minY: number; maxY: number };
type HexMetrics = { size: number; origin: { x: number; y: number } };

let cachedMapBounds: MapBounds | null = null;
let cachedMapBoundsKey = "";

function getNormalizedMapBounds(map: MapState): MapBounds {
  const key = `${map.width},${map.height}`;
  if (cachedMapBounds && cachedMapBoundsKey === key) {
    return cachedMapBounds;
  }

  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(map);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let r = rMin; r <= rMax; r += 1) {
    for (let q = qMin; q <= qMax; q += 1) {
      const centerX = SQRT3 * (q + r / 2);
      const centerY = 1.5 * r;
      minX = Math.min(minX, centerX - 1);
      maxX = Math.max(maxX, centerX + 1);
      minY = Math.min(minY, centerY - 1);
      maxY = Math.max(maxY, centerY + 1);
    }
  }

  cachedMapBounds = { minX, maxX, minY, maxY };
  cachedMapBoundsKey = key;
  return cachedMapBounds;
}

let cachedMetrics: HexMetrics | null = null;
let cachedMetricsKey = "";

export function getHexMetrics(viewport: GameViewport, map: MapState): HexMetrics {
  const scale = viewport.scale ?? 1;
  const key = `${viewport.width},${viewport.height},${scale},${map.width},${map.height}`;
  if (cachedMetrics && cachedMetricsKey === key) {
    return cachedMetrics;
  }

  const bounds = getNormalizedMapBounds(map);
  const minPaddingX = 28 * scale;
  const minPaddingY = 28 * scale;
  const minUsableWidth = 120 * scale;
  const minUsableHeight = 120 * scale;
  const minHexSize = 20 * scale;
  const maxHexSize = 40 * scale;
  const paddingX = Math.max(minPaddingX, viewport.width * 0.055);
  const paddingY = Math.max(minPaddingY, viewport.height * 0.07);
  const usableWidth = Math.max(minUsableWidth, viewport.width - paddingX * 2);
  const usableHeight = Math.max(minUsableHeight, viewport.height - paddingY * 2);
  const mapWidth = bounds.maxX - bounds.minX;
  const mapHeight = bounds.maxY - bounds.minY;
  const size = Math.max(minHexSize, Math.min(maxHexSize, Math.min(usableWidth / mapWidth, usableHeight / mapHeight)));
  const extraX = usableWidth - mapWidth * size;
  const extraY = usableHeight - mapHeight * size;

  cachedMetrics = {
    size,
    origin: {
      x: paddingX + extraX / 2 - bounds.minX * size,
      y: paddingY + extraY / 2 - bounds.minY * size,
    },
  };
  cachedMetricsKey = key;
  return cachedMetrics;
}
