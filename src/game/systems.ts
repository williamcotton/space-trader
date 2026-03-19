import type { GameFrame } from "./types";
import { areSameHex, axialToPixel, getMapAxialBounds, hexDistance, isWithinMapBounds } from "./model/hex";
import type { PlayerId } from "./model/ids";
import type { EntityState, GameState, HexCoord, UnitEntity } from "./model/state";
import { HEX_SIZE, getMapOrigin } from "./render/layout";

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

function toPixel(coord: HexCoord, originX: number, originY: number): { x: number; y: number } {
  return axialToPixel(coord, { x: originX, y: originY }, HEX_SIZE);
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
      const { x, y } = toPixel({ q, r }, originX, originY);
      drawHexOutline(context, x, y, HEX_SIZE - 1);
      context.stroke();
    }
  }
}

function getSelectedUnit(state: GameState): UnitEntity | null {
  if (!state.selectedEntityId) {
    return null;
  }

  const selected = state.entities[state.selectedEntityId];
  if (!selected || selected.kind !== "unit") {
    return null;
  }

  return selected;
}

function hasEntityAtCoord(state: GameState, coord: HexCoord, ignoreEntityId?: string): boolean {
  return Object.values(state.entities).some((entity) => {
    if (ignoreEntityId && entity.id === ignoreEntityId) {
      return false;
    }
    return areSameHex(entity.coord, coord);
  });
}

function getEntityAtCoord(state: GameState, coord: HexCoord, ignoreEntityId?: string): EntityState | null {
  return (
    Object.values(state.entities).find((entity) => {
      if (ignoreEntityId && entity.id === ignoreEntityId) {
        return false;
      }
      return areSameHex(entity.coord, coord);
    }) ?? null
  );
}

function drawMoveRangeOverlay(state: GameState, context: CanvasRenderingContext2D, originX: number, originY: number): void {
  const selected = getSelectedUnit(state);
  if (!selected || selected.ownerId !== state.activePlayerId) {
    return;
  }

  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  for (let r = rMin; r <= rMax; r += 1) {
    for (let q = qMin; q <= qMax; q += 1) {
      const coord = { q, r };
      if (!isWithinMapBounds(coord, state.map)) {
        continue;
      }

      const distance = hexDistance(selected.coord, coord);
      if (distance === 0 || distance > selected.movesRemaining) {
        continue;
      }

      const occupied = hasEntityAtCoord(state, coord, selected.id);
      const { x, y } = toPixel(coord, originX, originY);

      drawHexOutline(context, x, y, HEX_SIZE - 2);
      context.fillStyle = occupied ? "rgba(255, 110, 110, 0.14)" : "rgba(88, 247, 170, 0.14)";
      context.fill();

      context.strokeStyle = occupied ? "rgba(255, 130, 130, 0.3)" : "rgba(88, 247, 170, 0.35)";
      context.lineWidth = 1;
      context.stroke();
    }
  }
}

function drawResourceNodes(state: GameState, context: CanvasRenderingContext2D, originX: number, originY: number): void {
  for (const node of state.map.resourceNodes) {
    const { x, y } = toPixel(node.coord, originX, originY);
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

  const { x, y } = toPixel(entity.coord, originX, originY);
  context.fillStyle = getPlayerColor(entity.ownerId);
  context.fillRect(x - 16, y - 16, 32, 32);

  context.fillStyle = "#0b0d1f";
  context.font = "12px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(entity.hp), x, y);
}

function drawUnit(state: GameState, entity: EntityState, context: CanvasRenderingContext2D, originX: number, originY: number): void {
  if (entity.kind !== "unit") {
    return;
  }

  const { x, y } = toPixel(entity.coord, originX, originY);
  context.fillStyle = getPlayerColor(entity.ownerId);
  context.beginPath();
  context.arc(x, y, 10, 0, Math.PI * 2);
  context.fill();

  context.lineWidth = 2;
  context.strokeStyle = state.selectedEntityId === entity.id ? "#ffffff" : "#171a2d";
  context.stroke();

  context.fillStyle = "#0c0f23";
  context.font = "11px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(entity.role[0].toUpperCase(), x, y);

  if (entity.carries) {
    context.beginPath();
    context.fillStyle = getResourceColor(entity.carries);
    context.arc(x + 10, y - 9, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#0b1028";
    context.lineWidth = 1;
    context.stroke();
  }
}

function drawHoverHexAndTargetPreview(state: GameState, context: CanvasRenderingContext2D, originX: number, originY: number): void {
  if (!state.hoveredHex || !isWithinMapBounds(state.hoveredHex, state.map)) {
    return;
  }

  const hoverPos = toPixel(state.hoveredHex, originX, originY);
  drawHexOutline(context, hoverPos.x, hoverPos.y, HEX_SIZE - 2);
  context.strokeStyle = "rgba(246, 229, 108, 0.75)";
  context.lineWidth = 2;
  context.stroke();

  const selected = getSelectedUnit(state);
  const hoveredEntity = getEntityAtCoord(state, state.hoveredHex, selected?.id);
  if (!selected || !hoveredEntity || hoveredEntity.ownerId === selected.ownerId) {
    return;
  }

  const selectedPos = toPixel(selected.coord, originX, originY);
  const targetPos = toPixel(hoveredEntity.coord, originX, originY);
  const distance = hexDistance(selected.coord, hoveredEntity.coord);
  const canAttackNow = state.phase === "tactical" && selected.attacksRemaining > 0 && distance <= selected.attackRange;

  context.beginPath();
  context.moveTo(selectedPos.x, selectedPos.y);
  context.lineTo(targetPos.x, targetPos.y);
  context.strokeStyle = canAttackNow ? "rgba(107, 238, 142, 0.85)" : "rgba(255, 126, 126, 0.85)";
  context.lineWidth = 2;
  context.stroke();
}

export function updateGame(state: GameState, frame: GameFrame): void {
  void state;
  void frame;
}

export function renderGame(state: GameState, frame: GameFrame): void {
  const { context, viewport } = frame;
  const origin = getMapOrigin(viewport);
  const originX = origin.x;
  const originY = origin.y;

  context.fillStyle = "#070a22";
  context.fillRect(0, 0, viewport.width, viewport.height);

  drawHexGrid(state, context, originX, originY);
  drawMoveRangeOverlay(state, context, originX, originY);
  drawHoverHexAndTargetPreview(state, context, originX, originY);
  drawResourceNodes(state, context, originX, originY);

  for (const entity of Object.values(state.entities)) {
    drawBase(entity, context, originX, originY);
    drawUnit(state, entity, context, originX, originY);
  }

  context.strokeStyle = "#1f2a58";
  context.strokeRect(0.5, 0.5, viewport.width - 1, viewport.height - 1);
}
