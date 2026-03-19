import type { GameViewport } from "../types";

export const HEX_SIZE = 34;
export const MAP_ORIGIN_Y_OFFSET = 30;

export function getMapOrigin(viewport: GameViewport): { x: number; y: number } {
  return {
    x: viewport.width / 2,
    y: viewport.height / 2 + MAP_ORIGIN_Y_OFFSET,
  };
}
