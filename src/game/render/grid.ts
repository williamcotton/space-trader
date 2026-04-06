import { getPlayableHexes } from "../model/hex";
import type { GameState } from "../model/state";
import { getPlayerTheme, getResourceTheme } from "../presentation";
import type { GameFrame } from "../types";
import { toPixel, clamp, drawHexOutline, drawResourceGlyph } from "./primitives";

type DrawContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let backdropCache: OffscreenCanvas | null = null;
let backdropCacheKey = "";
let staticBoardCache: OffscreenCanvas | null = null;
let staticBoardCacheKey = "";

export function drawBackdrop(context: DrawContext, frame: GameFrame): void {
  const { width, height } = frame.viewport;
  const key = `${width},${height}`;

  if (!backdropCache || backdropCacheKey !== key) {
    backdropCache = new OffscreenCanvas(width, height);
    backdropCacheKey = key;
    const offCtx = backdropCache.getContext("2d")!;

    const gradient = offCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#071121");
    gradient.addColorStop(0.5, "#05091a");
    gradient.addColorStop(1, "#040612");
    offCtx.fillStyle = gradient;
    offCtx.fillRect(0, 0, width, height);

    const glow = offCtx.createRadialGradient(width * 0.3, height * 0.2, 0, width * 0.3, height * 0.2, width * 0.6);
    glow.addColorStop(0, "rgba(70, 123, 223, 0.14)");
    glow.addColorStop(1, "rgba(70, 123, 223, 0)");
    offCtx.fillStyle = glow;
    offCtx.fillRect(0, 0, width, height);

    const accent = offCtx.createRadialGradient(width * 0.74, height * 0.18, 0, width * 0.74, height * 0.18, width * 0.45);
    accent.addColorStop(0, "rgba(90, 214, 180, 0.12)");
    accent.addColorStop(1, "rgba(90, 214, 180, 0)");
    offCtx.fillStyle = accent;
    offCtx.fillRect(0, 0, width, height);

    offCtx.fillStyle = "rgba(214, 232, 255, 0.52)";
    for (let index = 0; index < 42; index += 1) {
      const x = (index * 187) % width;
      const y = ((index * 113) % height) * 0.92 + (index % 3) * 7;
      const radius = 0.6 + (index % 4) * 0.35;
      offCtx.globalAlpha = 0.22 + ((index * 17) % 100) / 420;
      offCtx.beginPath();
      offCtx.arc(x, y, radius, 0, Math.PI * 2);
      offCtx.fill();
    }
  }

  context.drawImage(backdropCache, 0, 0);
}

function buildStaticBoardCacheKey(
  state: GameState,
  frame: GameFrame,
  originX: number,
  originY: number,
  hexSize: number
): string {
  return [
    frame.viewport.width,
    frame.viewport.height,
    state.map.id,
    ...state.playerOrder.map((playerId) => state.players[playerId]?.faction ?? "none"),
    originX.toFixed(2),
    originY.toFixed(2),
    hexSize.toFixed(2),
  ].join("|");
}

export function drawHexGrid(state: GameState, context: DrawContext, originX: number, originY: number, hexSize: number): void {
  const fillPulse = 0.42 + 0.08 * Math.sin((originX + originY) * 0.001);

  for (const coord of getPlayableHexes(state.map)) {
    const { x, y } = toPixel(coord, originX, originY, hexSize);
    drawHexOutline(context, x, y, hexSize - 1.5);
    context.fillStyle = `rgba(9, 18, 46, ${fillPulse})`;
    context.fill();
    context.strokeStyle = "rgba(43, 69, 126, 0.66)";
    context.lineWidth = 1;
    context.stroke();
  }
}

export function drawPlayerTerritory(state: GameState, context: DrawContext, originX: number, originY: number, hexSize: number): void {
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId];
    if (!player) {
      continue;
    }
    const base = state.entities[player.baseEntityId];
    if (!base || base.kind !== "base") {
      continue;
    }

    const theme = getPlayerTheme(playerId);
    const { x, y } = toPixel(base.coord, originX, originY, hexSize);
    const radius = hexSize * 3.8;
    const aura = context.createRadialGradient(x, y, hexSize * 0.4, x, y, radius);
    aura.addColorStop(0, theme.glow);
    aura.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = aura;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function drawStaticResourceNodes(state: GameState, context: DrawContext, originX: number, originY: number, hexSize: number): void {
  const labelSize = clamp(hexSize * 0.36, 10, 14);

  for (const node of state.map.resourceNodes) {
    const theme = getResourceTheme(node.resourceType);
    const { x, y } = toPixel(node.coord, originX, originY, hexSize);
    const outerRadius = hexSize * 0.36;
    const innerRadius = outerRadius * 0.72;

    const glow = context.createRadialGradient(x, y, 0, x, y, outerRadius * 2.2);
    glow.addColorStop(0, theme.glow);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, outerRadius * 2.2, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "rgba(8, 13, 31, 0.92)";
    context.beginPath();
    context.arc(x, y, outerRadius, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "rgba(140, 158, 193, 0.32)";
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = theme.color;
    context.strokeStyle = theme.color;
    drawResourceGlyph(context, x, y, node.resourceType, innerRadius);

    context.font = `${labelSize}px "Avenir Next", "Trebuchet MS", sans-serif`;
    context.fillStyle = "rgba(210, 224, 255, 0.85)";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillText(node.displayName, x, y + outerRadius + 6);
  }
}

export function drawStaticBoardLayer(state: GameState, frame: GameFrame, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
  const key = buildStaticBoardCacheKey(state, frame, originX, originY, hexSize);

  if (!staticBoardCache || staticBoardCacheKey !== key) {
    staticBoardCache = new OffscreenCanvas(frame.viewport.width, frame.viewport.height);
    staticBoardCacheKey = key;
    const offCtx = staticBoardCache.getContext("2d");
    if (!offCtx) {
      return;
    }

    drawBackdrop(offCtx, frame);
    drawPlayerTerritory(state, offCtx, originX, originY, hexSize);
    drawHexGrid(state, offCtx, originX, originY, hexSize);
    drawStaticResourceNodes(state, offCtx, originX, originY, hexSize);
  }

  context.drawImage(staticBoardCache, 0, 0);
}

export function drawResourceNodeControlOverlays(
  state: GameState,
  context: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  hexSize: number
): void {
  for (const node of state.map.resourceNodes) {
    if (!node.controlledBy) {
      continue;
    }

    const { x, y } = toPixel(node.coord, originX, originY, hexSize);
    const outerRadius = hexSize * 0.36;

    context.beginPath();
    context.arc(x, y, outerRadius, 0, Math.PI * 2);
    context.strokeStyle = getPlayerTheme(node.controlledBy).line;
    context.lineWidth = 2;
    context.stroke();
  }
}

export function drawMoveRangeOverlay(frame: GameFrame, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
  const cells = frame.derived.moveRangeOverlay;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const { x, y } = toPixel(cell.coord, originX, originY, hexSize);
    drawHexOutline(context, x, y, hexSize - 3.2);
    context.fillStyle = cell.occupied ? "rgba(255, 110, 110, 0.11)" : "rgba(107, 245, 188, 0.1)";
    context.fill();
    context.strokeStyle = cell.occupied ? "rgba(255, 145, 145, 0.34)" : "rgba(107, 245, 188, 0.35)";
    context.lineWidth = 1.4;
    context.stroke();
  }
}

export function drawResourceNodes(state: GameState, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
  drawStaticResourceNodes(state, context, originX, originY, hexSize);
  drawResourceNodeControlOverlays(state, context, originX, originY, hexSize);
}
