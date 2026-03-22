import { axialToPixel } from "../model/hex";
import type { HexCoord } from "../model/state";

export function toPixel(coord: HexCoord, originX: number, originY: number, hexSize: number): { x: number; y: number } {
  return axialToPixel(coord, { x: originX, y: originY }, hexSize);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function truncateLabel(label: string, maxLength = 18): string {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

export function drawRegularPolygon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  sides: number,
  rotation = 0
): void {
  context.beginPath();
  for (let side = 0; side < sides; side += 1) {
    const angle = rotation + (Math.PI * 2 * side) / sides;
    const pointX = x + radius * Math.cos(angle);
    const pointY = y + radius * Math.sin(angle);
    if (side === 0) {
      context.moveTo(pointX, pointY);
    } else {
      context.lineTo(pointX, pointY);
    }
  }
  context.closePath();
}

export function drawHexOutline(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  drawRegularPolygon(context, x, y, size, 6, -Math.PI / 6);
}

export function drawDiamond(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size * 0.92, y);
  context.lineTo(x, y + size);
  context.lineTo(x - size * 0.92, y);
  context.closePath();
}

export function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const resolvedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + resolvedRadius, y);
  context.lineTo(x + width - resolvedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius);
  context.lineTo(x + width, y + height - resolvedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - resolvedRadius, y + height);
  context.lineTo(x + resolvedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius);
  context.lineTo(x, y + resolvedRadius);
  context.quadraticCurveTo(x, y, x + resolvedRadius, y);
  context.closePath();
}

export function drawResourceGlyph(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  resourceType: "credits" | "alloy" | "flux" | "biomass",
  size: number
): void {
  context.save();
  context.translate(x, y);
  context.lineWidth = Math.max(1, size * 0.16);
  context.lineCap = "round";
  context.lineJoin = "round";

  switch (resourceType) {
    case "credits":
      drawRegularPolygon(context, 0, 0, size, 6, -Math.PI / 6);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, size * 0.32, 0, Math.PI * 2);
      context.stroke();
      break;
    case "alloy":
      drawRoundedRect(context, -size * 0.72, -size * 0.46, size * 1.44, size * 0.38, size * 0.12);
      context.stroke();
      drawRoundedRect(context, -size * 0.54, size * 0.08, size * 1.08, size * 0.34, size * 0.12);
      context.stroke();
      break;
    case "flux":
      context.beginPath();
      context.moveTo(-size * 0.18, -size);
      context.lineTo(size * 0.12, -size * 0.2);
      context.lineTo(-size * 0.04, -size * 0.2);
      context.lineTo(size * 0.24, size);
      context.lineTo(-size * 0.1, size * 0.12);
      context.lineTo(size * 0.04, size * 0.12);
      context.closePath();
      context.fill();
      break;
    case "biomass":
      context.beginPath();
      context.moveTo(0, size);
      context.quadraticCurveTo(size * 0.08, size * 0.12, size * 0.54, -size * 0.4);
      context.quadraticCurveTo(size * 0.08, -size * 0.76, 0, -size * 0.14);
      context.quadraticCurveTo(-size * 0.08, -size * 0.76, -size * 0.54, -size * 0.4);
      context.quadraticCurveTo(-size * 0.08, size * 0.12, 0, size);
      context.fill();
      context.beginPath();
      context.moveTo(0, size * 0.78);
      context.lineTo(0, -size * 0.42);
      context.stroke();
      break;
  }

  context.restore();
}

export function drawHealthBar(context: CanvasRenderingContext2D, x: number, y: number, width: number, hp: number, maxHp: number, color: string): void {
  const ratio = clamp(hp / maxHp, 0, 1);
  drawRoundedRect(context, x - width / 2, y, width, 5, 2.5);
  context.fillStyle = "rgba(6, 11, 26, 0.82)";
  context.fill();
  context.strokeStyle = "rgba(102, 125, 174, 0.44)";
  context.lineWidth = 1;
  context.stroke();

  drawRoundedRect(context, x - width / 2 + 1, y + 1, Math.max(0, (width - 2) * ratio), 3, 1.5);
  context.fillStyle = color;
  context.fill();
}
