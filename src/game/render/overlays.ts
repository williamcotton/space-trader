import { hexDistance, isWithinMapBounds } from "../model/hex";
import type { GameState } from "../model/state";
import { getSelectedUnit } from "../model/queries";
import { spatialGetEntity } from "../derived";
import type { GameFrame } from "../types";
import { canUnitDeclareAttack, getAttackableEntitiesForUnit } from "../rules/directInteraction";
import { getEffectiveUnitAttackRange } from "../systems/unitStats";
import { toPixel, clamp, drawDiamond, drawRegularPolygon, drawRoundedRect, drawHexOutline } from "./primitives";

export function getStackAnchor(frame: GameFrame): { x: number; y: number } {
  return {
    x: frame.viewport.width * 0.5,
    y: clamp(frame.viewport.height * 0.1, 36, 60),
  };
}

export function drawStackGlyph(context: CanvasRenderingContext2D, x: number, y: number, size: number, visual: "unit" | "counter" | "tactic" | "generic"): void {
  context.save();
  context.translate(x, y);
  context.lineWidth = Math.max(1.4, size * 0.14);
  context.lineCap = "round";
  context.lineJoin = "round";

  if (visual === "unit") {
    drawDiamond(context, 0, 0, size * 0.9);
    context.stroke();
  } else if (visual === "counter") {
    context.beginPath();
    context.moveTo(-size * 0.74, -size * 0.74);
    context.lineTo(size * 0.74, size * 0.74);
    context.moveTo(size * 0.74, -size * 0.74);
    context.lineTo(-size * 0.74, size * 0.74);
    context.stroke();
  } else if (visual === "tactic") {
    drawRegularPolygon(context, 0, 0, size * 0.9, 6, -Math.PI / 6);
    context.stroke();
  } else {
    context.beginPath();
    context.arc(0, 0, size * 0.82, 0, Math.PI * 2);
    context.stroke();
  }

  context.restore();
}

export function drawStackAnchor(context: CanvasRenderingContext2D, frame: GameFrame, stackCount: number, highlightLevel: number): void {
  const anchor = getStackAnchor(frame);
  const width = 92;
  const height = 24;
  const alpha = 0.56 + highlightLevel * 0.24;

  context.save();
  drawRoundedRect(context, anchor.x - width / 2, anchor.y - height / 2, width, height, 12);
  context.fillStyle = `rgba(12, 20, 49, ${alpha})`;
  context.fill();
  context.strokeStyle = `rgba(108, 169, 255, ${0.24 + highlightLevel * 0.52})`;
  context.lineWidth = 1.4;
  context.stroke();

  context.fillStyle = `rgba(219, 233, 255, ${0.84 + highlightLevel * 0.12})`;
  context.font = `600 10px "Avenir Next", "Trebuchet MS", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(stackCount > 0 ? `STACK ${stackCount}` : "STACK", anchor.x, anchor.y);
  context.restore();
}

export function drawHoverHexAndTargetPreview(state: GameState, frame: GameFrame, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
  const hoveredHex = frame.transients.hoveredHex;
  if (!hoveredHex || !isWithinMapBounds(hoveredHex, state.map)) {
    return;
  }

  const hoverPos = toPixel(hoveredHex, originX, originY, hexSize);
  drawHexOutline(context, hoverPos.x, hoverPos.y, hexSize - 3);
  context.strokeStyle = "rgba(246, 229, 108, 0.72)";
  context.lineWidth = 2;
  context.stroke();

  const selected = getSelectedUnit(state);
  const pendingAttacker = frame.transients.pendingAttackTargeting
    ? state.entities[frame.transients.pendingAttackTargeting.attackerId]
    : null;
  const previewUnit =
    pendingAttacker && pendingAttacker.kind === "unit"
      ? pendingAttacker
      : selected;

  if (pendingAttacker && pendingAttacker.kind === "unit") {
    const validTargets = getAttackableEntitiesForUnit(state, pendingAttacker);
    for (let index = 0; index < validTargets.length; index += 1) {
      const target = validTargets[index];
      const targetPos = toPixel(target.coord, originX, originY, hexSize);
      const isHoveredTarget = target.coord.q === hoveredHex.q && target.coord.r === hoveredHex.r;
      drawHexOutline(context, targetPos.x, targetPos.y, hexSize - (isHoveredTarget ? 1.8 : 3.6));
      context.fillStyle = isHoveredTarget ? "rgba(255, 170, 98, 0.22)" : "rgba(255, 118, 118, 0.12)";
      context.fill();
      context.strokeStyle = isHoveredTarget ? "rgba(255, 196, 110, 0.94)" : "rgba(255, 126, 126, 0.64)";
      context.lineWidth = isHoveredTarget ? 2.2 : 1.5;
      context.stroke();
    }
  }

  const hoveredEntity = spatialGetEntity(frame.derived.spatialIndex, state.entities, hoveredHex, previewUnit?.id);
  if (!previewUnit || !hoveredEntity || hoveredEntity.ownerId === previewUnit.ownerId) {
    return;
  }

  const selectedPos = toPixel(previewUnit.coord, originX, originY, hexSize);
  const targetPos = toPixel(hoveredEntity.coord, originX, originY, hexSize);
  const distance = hexDistance(previewUnit.coord, hoveredEntity.coord);
  const canAttackNow =
    state.phase === "tactical" &&
    previewUnit.attacksRemaining > 0 &&
    canUnitDeclareAttack(state, previewUnit) &&
    distance <= getEffectiveUnitAttackRange(state, previewUnit);

  context.beginPath();
  context.moveTo(selectedPos.x, selectedPos.y);
  context.lineTo(targetPos.x, targetPos.y);
  context.strokeStyle = canAttackNow ? "rgba(114, 238, 154, 0.86)" : "rgba(255, 123, 123, 0.86)";
  context.lineWidth = 2.5;
  if (!canAttackNow) {
    context.setLineDash([8, 6]);
  }
  context.stroke();
  context.setLineDash([]);
}

export function drawMapFrame(context: CanvasRenderingContext2D, frame: GameFrame): void {
  const { width, height } = frame.viewport;
  context.strokeStyle = "rgba(39, 60, 118, 0.72)";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
}
