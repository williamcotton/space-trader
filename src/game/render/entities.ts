import type { EntityState, GameState, UnitEntity } from "../model/state";
import { getPlayerTheme, getResourceTheme, getUnitRoleTheme } from "../presentation";
import { toPixel, clamp, drawRegularPolygon, drawDiamond, drawResourceGlyph, drawHealthBar } from "./primitives";

export function drawBase(entity: EntityState, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
  if (entity.kind !== "base") {
    return;
  }

  const theme = getPlayerTheme(entity.ownerId);
  const { x, y } = toPixel(entity.coord, originX, originY, hexSize);
  const size = hexSize * 0.66;
  const glow = context.createRadialGradient(x, y, size * 0.25, x, y, size * 2.1);
  glow.addColorStop(0, theme.glow);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, size * 2.1, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = theme.shadow;
  drawRegularPolygon(context, x, y + 2, size * 1.06, 6, -Math.PI / 6);
  context.fill();

  const body = context.createLinearGradient(x - size, y - size, x + size, y + size);
  body.addColorStop(0, theme.secondary);
  body.addColorStop(1, theme.primary);
  context.fillStyle = body;
  drawRegularPolygon(context, x, y, size, 6, -Math.PI / 6);
  context.fill();
  context.strokeStyle = theme.line;
  context.lineWidth = 2.2;
  context.stroke();

  context.fillStyle = "rgba(7, 12, 30, 0.9)";
  drawRegularPolygon(context, x, y, size * 0.54, 6, -Math.PI / 6);
  context.fill();

  context.fillStyle = "#eff6ff";
  context.font = `${clamp(hexSize * 0.36, 13, 18)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(entity.hp), x, y + 1);

  drawHealthBar(context, x, y - size - 10, hexSize * 1.28, entity.hp, entity.maxHp, theme.secondary);
}

function drawUnitShape(context: CanvasRenderingContext2D, unit: UnitEntity, x: number, y: number, size: number): void {
  switch (unit.role) {
    case "combat":
      drawDiamond(context, x, y, size);
      return;
    case "resource":
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      return;
    case "utility":
      drawRegularPolygon(context, x, y, size, 6, 0);
      return;
  }
}

export function drawUnit(state: GameState, entity: EntityState, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
  if (entity.kind !== "unit") {
    return;
  }

  const theme = getPlayerTheme(entity.ownerId);
  const roleTheme = getUnitRoleTheme(entity.role);
  const { x, y } = toPixel(entity.coord, originX, originY, hexSize);
  const size = hexSize * 0.36;

  context.fillStyle = theme.shadow;
  context.beginPath();
  context.ellipse(x, y + size * 0.92, size * 0.92, size * 0.48, 0, 0, Math.PI * 2);
  context.fill();

  const shell = context.createLinearGradient(x - size, y - size, x + size, y + size);
  shell.addColorStop(0, theme.secondary);
  shell.addColorStop(1, theme.primary);
  drawUnitShape(context, entity, x, y, size);
  context.fillStyle = shell;
  context.fill();
  context.strokeStyle = state.selectedEntityId === entity.id ? "#ffffff" : theme.line;
  context.lineWidth = state.selectedEntityId === entity.id ? 2.4 : 1.8;
  context.stroke();

  drawUnitShape(context, entity, x, y, size * 0.56);
  context.fillStyle = "rgba(9, 13, 29, 0.82)";
  context.fill();

  context.fillStyle = roleTheme.accent;
  context.font = `${clamp(hexSize * 0.34, 10, 14)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(entity.role[0].toUpperCase(), x, y + 0.5);

  if (state.selectedEntityId === entity.id) {
    context.beginPath();
    context.arc(x, y, size * 1.42, 0, Math.PI * 2);
    context.strokeStyle = "rgba(255, 255, 255, 0.7)";
    context.lineWidth = 2;
    context.stroke();
  }

  if (entity.hasSummoningSickness) {
    context.beginPath();
    context.arc(x, y, size * 1.15, 0, Math.PI * 2);
    context.setLineDash([3, 4]);
    context.strokeStyle = "rgba(255, 194, 118, 0.82)";
    context.lineWidth = 1.4;
    context.stroke();
    context.setLineDash([]);
  }

  if (entity.ownerId === state.activePlayerId) {
    context.beginPath();
    context.arc(x - size * 0.84, y - size * 0.84, size * 0.18, 0, Math.PI * 2);
    context.fillStyle = theme.secondary;
    context.fill();
  }

  if (entity.carries) {
    const resourceTheme = getResourceTheme(entity.carries);
    context.fillStyle = "rgba(8, 12, 28, 0.96)";
    context.beginPath();
    context.arc(x + size * 0.9, y - size * 0.86, size * 0.38, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = resourceTheme.color;
    context.lineWidth = 1.4;
    context.stroke();
    context.fillStyle = resourceTheme.color;
    context.strokeStyle = resourceTheme.color;
    drawResourceGlyph(context, x + size * 0.9, y - size * 0.86, entity.carries, size * 0.2);
  }

  drawHealthBar(context, x, y - size - 11, hexSize * 0.84, entity.hp, entity.maxHp, theme.secondary);
}
