import { axialToPixel } from "../model/hex";
import type { ResourceType } from "../model/enums";
import type { HexCoord } from "../model/state";
import { getRegisteredCurrencyResourceId, getRegisteredResourceModule } from "../content/registry";
import type { ResourceGlyphShape } from "../content/sets/types";
import { getRegisteredResourceTheme, tryGetRegisteredResourceTheme } from "../registries/presentation";

type DrawContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

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
  context: DrawContext,
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

export function drawHexOutline(context: DrawContext, x: number, y: number, size: number): void {
  drawRegularPolygon(context, x, y, size, 6, -Math.PI / 6);
}

export function drawDiamond(context: DrawContext, x: number, y: number, size: number): void {
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size * 0.92, y);
  context.lineTo(x, y + size);
  context.lineTo(x - size * 0.92, y);
  context.closePath();
}

export function drawRoundedRect(context: DrawContext, x: number, y: number, width: number, height: number, radius: number): void {
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

const DEFAULT_RESOURCE_GLYPH_VIEWBOX = {
  width: 24,
  height: 24,
};

function resolveGlyphPaint(paint: string | undefined, currentColor: string): string {
  return !paint || paint === "currentColor" ? currentColor : paint;
}

function drawCanvasGlyphShape(context: DrawContext, shape: ResourceGlyphShape, currentColor: string): void {
  context.beginPath();
  context.lineCap = "round";
  context.lineJoin = "round";

  switch (shape.type) {
    case "polygon": {
      const points = shape.points
        .trim()
        .split(/\s+/)
        .map((point) => point.split(",").map((value) => Number(value)));
      points.forEach(([pointX, pointY], index) => {
        if (index === 0) {
          context.moveTo(pointX, pointY);
        } else {
          context.lineTo(pointX, pointY);
        }
      });
      context.closePath();
      break;
    }
    case "circle":
      context.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      break;
    case "rect":
      drawRoundedRect(context, shape.x, shape.y, shape.width, shape.height, shape.rx ?? 0);
      break;
    case "path": {
      if (typeof Path2D === "undefined") {
        return;
      }
      const path = new Path2D(shape.d);
      if (shape.fill && shape.fill !== "none") {
        context.fillStyle = resolveGlyphPaint(shape.fill, currentColor);
        context.fill(path);
      }
      if (shape.stroke && shape.stroke !== "none") {
        context.strokeStyle = resolveGlyphPaint(shape.stroke, currentColor);
        context.lineWidth = shape.strokeWidth ?? context.lineWidth;
        context.lineCap = shape.strokeLinecap ?? context.lineCap;
        context.lineJoin = shape.strokeLinejoin ?? context.lineJoin;
        context.stroke(path);
      }
      return;
    }
    case "line":
      context.moveTo(shape.x1, shape.y1);
      context.lineTo(shape.x2, shape.y2);
      break;
  }

  if ("fill" in shape && shape.fill && shape.fill !== "none") {
    context.fillStyle = resolveGlyphPaint(shape.fill, currentColor);
    context.fill();
  }

  if ("stroke" in shape && shape.stroke && shape.stroke !== "none") {
    context.strokeStyle = resolveGlyphPaint(shape.stroke, currentColor);
    context.lineWidth = shape.strokeWidth ?? context.lineWidth;
    if ("strokeLinecap" in shape && shape.strokeLinecap) {
      context.lineCap = shape.strokeLinecap;
    }
    context.stroke();
  }
}

export function drawResourceGlyph(
  context: DrawContext,
  x: number,
  y: number,
  resourceType: ResourceType,
  size: number
): void {
  const module = getRegisteredResourceModule(resourceType);
  context.save();
  context.translate(x, y);
  if (module?.glyph) {
    const viewBox = module.glyph.viewBox ?? DEFAULT_RESOURCE_GLYPH_VIEWBOX;
    const scale = size / Math.max(viewBox.width, viewBox.height) * 2;
    const currentColor = typeof context.fillStyle === "string" ? context.fillStyle : (typeof context.strokeStyle === "string" ? context.strokeStyle : "#ffffff");
    context.scale(scale, scale);
    context.translate(-viewBox.width / 2, -viewBox.height / 2);
    context.lineWidth = Math.max(1, (size * 0.16) / Math.max(scale, 0.001));
    for (const shape of module.glyph.shapes) {
      drawCanvasGlyphShape(context, shape, currentColor);
    }
  } else {
    const fallbackId = getRegisteredCurrencyResourceId();
    const theme = tryGetRegisteredResourceTheme(resourceType) ?? getRegisteredResourceTheme(fallbackId);
    context.font = `${Math.max(8, size * 1.4)}px "Avenir Next", "Trebuchet MS", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = theme.color;
    context.fillText(theme.shortLabel.toUpperCase().slice(0, 2), 0, 0);
  }

  context.restore();
}

export function drawHealthBar(context: DrawContext, x: number, y: number, width: number, hp: number, maxHp: number, color: string): void {
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
