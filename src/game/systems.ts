import type { GameFrame } from "./types";
import type { PlayerId } from "./model/ids";
import type { EntityState, GameState, HexCoord, MapState } from "./model/state";

const MAP_ORIGIN_Y_OFFSET = 30;
const HEX_SIZE = 34;

function getPlayerColor(playerId: PlayerId): string {
  return playerId === "player_1" ? "#5cd1ff" : "#ff8a5b";
}

function getResourceColor(resourceType: string): string {
  switch (resourceType) {
    case "credits":
      return "#e2f14f";
    case "alloy":
      return "#9da8b4";
    case "flux":
      return "#63a8ff";
    case "biomass":
      return "#48d47f";
    default:
      return "#ffffff";
  }
}

function axialToPixel(coord: HexCoord, originX: number, originY: number): { x: number; y: number } {
  const x = originX + HEX_SIZE * Math.sqrt(3) * (coord.q + coord.r / 2);
  const y = originY + HEX_SIZE * 1.5 * coord.r;
  return { x, y };
}

function getMapAxialBounds(map: MapState): { qMin: number; qMax: number; rMin: number; rMax: number } {
  const qRadius = Math.floor(map.width / 2);
  const rRadius = Math.floor(map.height / 2);
  return {
    qMin: -qRadius,
    qMax: qRadius,
    rMin: -rRadius,
    rMax: rRadius,
  };
}

function drawHexOutline(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  context.beginPath();
  for (let side = 0; side < 6; side += 1) {
    const angle = ((60 * side - 30) * Math.PI) / 180;
    const pointX = x + size * Math.cos(angle);
    const pointY = y + size * Math.sin(angle);

    if (side === 0) {
      context.moveTo(pointX, pointY);
    } else {
      context.lineTo(pointX, pointY);
    }
  }
  context.closePath();
}

function drawHexGrid(state: GameState, context: CanvasRenderingContext2D, originX: number, originY: number): void {
  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  context.strokeStyle = "#1f2b54";
  context.lineWidth = 1;

  for (let r = rMin; r <= rMax; r += 1) {
    for (let q = qMin; q <= qMax; q += 1) {
      const { x, y } = axialToPixel({ q, r }, originX, originY);
      drawHexOutline(context, x, y, HEX_SIZE - 1);
      context.stroke();
    }
  }
}

function drawResourceNodes(state: GameState, context: CanvasRenderingContext2D, originX: number, originY: number): void {
  for (const node of state.map.resourceNodes) {
    const { x, y } = axialToPixel(node.coord, originX, originY);
    context.fillStyle = getResourceColor(node.resourceType);
    context.beginPath();
    context.arc(x, y, 12, 0, Math.PI * 2);
    context.fill();

    context.lineWidth = 2;
    context.strokeStyle = node.controlledBy ? getPlayerColor(node.controlledBy) : "#2f3357";
    context.stroke();

    context.fillStyle = "#cfd5ef";
    context.font = "12px monospace";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillText(node.displayName, x, y + 16);
  }
}

function drawBase(entity: EntityState, context: CanvasRenderingContext2D, originX: number, originY: number): void {
  if (entity.kind !== "base") {
    return;
  }

  const { x, y } = axialToPixel(entity.coord, originX, originY);
  context.fillStyle = getPlayerColor(entity.ownerId);
  context.fillRect(x - 16, y - 16, 32, 32);

  context.fillStyle = "#0b0d1f";
  context.font = "12px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(entity.hp), x, y);
}

function drawHud(state: GameState, context: CanvasRenderingContext2D, viewport: { width: number; height: number }): void {
  context.fillStyle = "rgba(6, 8, 24, 0.82)";
  context.fillRect(12, 12, 430, 146);

  context.fillStyle = "#d5e6ff";
  context.font = "16px monospace";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText(`Map: ${state.map.name}`, 24, 24);
  context.fillText(`Turn: ${state.turn}`, 24, 46);
  context.fillText(`Phase: ${state.phase}`, 24, 68);
  context.fillText(`Active: ${state.activePlayerId}`, 24, 90);
  context.fillText(`Stack: ${state.stack.length}`, 24, 112);
  context.fillText(`State Version: ${state.stateVersion}`, 24, 134);

  const p1 = state.players.player_1.resources;
  const p2 = state.players.player_2.resources;

  context.fillStyle = "#9fd8ff";
  context.fillText(`P1 C:${p1.credits} A:${p1.alloy} F:${p1.flux} B:${p1.biomass}`, 230, 68);

  context.fillStyle = "#ffb49a";
  context.fillText(`P2 C:${p2.credits} A:${p2.alloy} F:${p2.flux} B:${p2.biomass}`, 230, 90);

  context.fillStyle = "#9ca7d6";
  context.fillText("Press N to advance phase", 230, 134);

  context.strokeStyle = "#1f2a58";
  context.strokeRect(0.5, 0.5, viewport.width - 1, viewport.height - 1);
}

export function updateGame(state: GameState, frame: GameFrame): void {
  void state;
  void frame;
}

export function renderGame(state: GameState, frame: GameFrame): void {
  const { context, viewport } = frame;
  const originX = viewport.width / 2;
  const originY = viewport.height / 2 + MAP_ORIGIN_Y_OFFSET;

  context.fillStyle = "#070a22";
  context.fillRect(0, 0, viewport.width, viewport.height);

  drawHexGrid(state, context, originX, originY);
  drawResourceNodes(state, context, originX, originY);

  for (const entity of Object.values(state.entities)) {
    drawBase(entity, context, originX, originY);
  }

  drawHud(state, context, viewport);
}
