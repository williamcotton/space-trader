import type { GameFrame } from "./types";
import { areSameHex, axialToPixel, getMapAxialBounds, hexDistance, isWithinMapBounds } from "./model/hex";
import type { EntityState, GameState, HexCoord, UnitEntity } from "./model/state";
import { getPlayerTheme, getResourceTheme, getUnitRoleTheme } from "./presentation";
import { getHexMetrics } from "./render/layout";

function toPixel(coord: HexCoord, originX: number, originY: number, hexSize: number): { x: number; y: number } {
  return axialToPixel(coord, { x: originX, y: originY }, hexSize);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drawRegularPolygon(
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

function drawHexOutline(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  drawRegularPolygon(context, x, y, size, 6, -Math.PI / 6);
}

function drawDiamond(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size * 0.92, y);
  context.lineTo(x, y + size);
  context.lineTo(x - size * 0.92, y);
  context.closePath();
}

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
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

function drawResourceGlyph(
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

function drawBackdrop(context: CanvasRenderingContext2D, frame: GameFrame): void {
  const { width, height } = frame.viewport;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#071121");
  gradient.addColorStop(0.5, "#05091a");
  gradient.addColorStop(1, "#040612");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * 0.3, height * 0.2, 0, width * 0.3, height * 0.2, width * 0.6);
  glow.addColorStop(0, "rgba(70, 123, 223, 0.14)");
  glow.addColorStop(1, "rgba(70, 123, 223, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  const accent = context.createRadialGradient(width * 0.74, height * 0.18, 0, width * 0.74, height * 0.18, width * 0.45);
  accent.addColorStop(0, "rgba(90, 214, 180, 0.12)");
  accent.addColorStop(1, "rgba(90, 214, 180, 0)");
  context.fillStyle = accent;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(214, 232, 255, 0.52)";
  for (let index = 0; index < 42; index += 1) {
    const x = (index * 187) % width;
    const y = ((index * 113) % height) * 0.92 + (index % 3) * 7;
    const radius = 0.6 + (index % 4) * 0.35;
    context.globalAlpha = 0.22 + ((index * 17) % 100) / 420;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function getStackAnchor(frame: GameFrame): { x: number; y: number } {
  return {
    x: frame.viewport.width * 0.5,
    y: clamp(frame.viewport.height * 0.1, 36, 60),
  };
}

function truncateLabel(label: string, maxLength = 18): string {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

function drawStackGlyph(context: CanvasRenderingContext2D, x: number, y: number, size: number, visual: "unit" | "counter" | "tactic" | "generic"): void {
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

function drawStackAnchor(context: CanvasRenderingContext2D, frame: GameFrame, stackCount: number, highlightLevel: number): void {
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

function drawHexGrid(state: GameState, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  const fillPulse = 0.42 + 0.08 * Math.sin((originX + originY) * 0.001);

  for (let r = rMin; r <= rMax; r += 1) {
    for (let q = qMin; q <= qMax; q += 1) {
      const { x, y } = toPixel({ q, r }, originX, originY, hexSize);
      drawHexOutline(context, x, y, hexSize - 1.5);
      context.fillStyle = `rgba(9, 18, 46, ${fillPulse})`;
      context.fill();
      context.strokeStyle = "rgba(43, 69, 126, 0.66)";
      context.lineWidth = 1;
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

function drawPlayerTerritory(state: GameState, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
  for (const playerId of ["player_1", "player_2"] as const) {
    const base = state.entities[state.players[playerId].baseEntityId];
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

function drawMoveRangeOverlay(state: GameState, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
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
      const { x, y } = toPixel(coord, originX, originY, hexSize);
      drawHexOutline(context, x, y, hexSize - 3.2);
      context.fillStyle = occupied ? "rgba(255, 110, 110, 0.11)" : "rgba(107, 245, 188, 0.1)";
      context.fill();
      context.strokeStyle = occupied ? "rgba(255, 145, 145, 0.34)" : "rgba(107, 245, 188, 0.35)";
      context.lineWidth = 1.4;
      context.stroke();
    }
  }
}

function drawResourceNodes(state: GameState, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
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

    context.strokeStyle = node.controlledBy ? getPlayerTheme(node.controlledBy).line : "rgba(140, 158, 193, 0.32)";
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

function drawHealthBar(context: CanvasRenderingContext2D, x: number, y: number, width: number, hp: number, maxHp: number, color: string): void {
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

function drawBase(entity: EntityState, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
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

function drawUnit(state: GameState, entity: EntityState, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number, timeSeconds: number): void {
  if (entity.kind !== "unit") {
    return;
  }

  const theme = getPlayerTheme(entity.ownerId);
  const roleTheme = getUnitRoleTheme(entity.role);
  const { x, y } = toPixel(entity.coord, originX, originY, hexSize);
  const size = hexSize * 0.36;
  const pulse = 0.5 + 0.5 * Math.sin(timeSeconds * 7);

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
    context.arc(x, y, size * (1.35 + pulse * 0.12), 0, Math.PI * 2);
    context.strokeStyle = `rgba(255, 255, 255, ${0.42 + pulse * 0.25})`;
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

function drawHoverHexAndTargetPreview(state: GameState, context: CanvasRenderingContext2D, originX: number, originY: number, hexSize: number): void {
  if (!state.hoveredHex || !isWithinMapBounds(state.hoveredHex, state.map)) {
    return;
  }

  const hoverPos = toPixel(state.hoveredHex, originX, originY, hexSize);
  drawHexOutline(context, hoverPos.x, hoverPos.y, hexSize - 3);
  context.strokeStyle = "rgba(246, 229, 108, 0.72)";
  context.lineWidth = 2;
  context.stroke();

  const selected = getSelectedUnit(state);
  const hoveredEntity = getEntityAtCoord(state, state.hoveredHex, selected?.id);
  if (!selected || !hoveredEntity || hoveredEntity.ownerId === selected.ownerId) {
    return;
  }

  const selectedPos = toPixel(selected.coord, originX, originY, hexSize);
  const targetPos = toPixel(hoveredEntity.coord, originX, originY, hexSize);
  const distance = hexDistance(selected.coord, hoveredEntity.coord);
  const canAttackNow = state.phase === "tactical" && selected.attacksRemaining > 0 && distance <= selected.attackRange;

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

function drawAnimations(context: CanvasRenderingContext2D, frame: GameFrame, originX: number, originY: number, hexSize: number): void {
  for (const animation of frame.transients.animations) {
    const progress = clamp(animation.ageSeconds / animation.durationSeconds, 0, 1);
    const playerTheme = getPlayerTheme(animation.playerId);

    if (animation.kind === "move") {
      const from = toPixel(animation.from, originX, originY, hexSize);
      const to = toPixel(animation.to, originX, originY, hexSize);
      const currentX = from.x + (to.x - from.x) * progress;
      const currentY = from.y + (to.y - from.y) * progress;

      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(currentX, currentY);
      context.strokeStyle = `rgba(${animation.playerId === "player_1" ? "99, 213, 255" : "255, 153, 105"}, ${0.55 - progress * 0.35})`;
      context.lineWidth = 4;
      context.stroke();

      context.fillStyle = `rgba(255, 255, 255, ${0.28 - progress * 0.16})`;
      context.beginPath();
      context.arc(currentX, currentY, hexSize * 0.18, 0, Math.PI * 2);
      context.fill();
      continue;
    }

    if (animation.kind === "attack") {
      const from = toPixel(animation.from, originX, originY, hexSize);
      const to = toPixel(animation.to, originX, originY, hexSize);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.strokeStyle = `rgba(${animation.playerId === "player_1" ? "105, 229, 255" : "255, 163, 110"}, ${0.9 - progress * 0.55})`;
      context.lineWidth = 3 + (1 - progress) * 3;
      context.stroke();

      context.beginPath();
      context.arc(to.x, to.y, hexSize * (0.18 + progress * 0.4), 0, Math.PI * 2);
      context.strokeStyle = animation.targetDestroyed ? `rgba(255, 118, 118, ${0.84 - progress * 0.42})` : `rgba(255, 232, 178, ${0.82 - progress * 0.46})`;
      context.lineWidth = 2.2;
      context.stroke();

      context.fillStyle = `rgba(255, 239, 214, ${0.78 - progress * 0.54})`;
      context.font = `${clamp(hexSize * 0.34, 11, 15)}px "Avenir Next", "Trebuchet MS", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.fillText(`-${animation.damage}`, to.x, to.y - hexSize * (0.32 + progress * 0.44));
      continue;
    }

    if (animation.kind === "harvest") {
      const position = toPixel(animation.coord, originX, originY, hexSize);
      const resourceTheme = getResourceTheme(animation.resourceType);
      context.beginPath();
      context.arc(position.x, position.y, hexSize * (0.24 + progress * 0.46), 0, Math.PI * 2);
      context.strokeStyle = `rgba(${resourceTheme.color === "#e8f15e" ? "232, 241, 94" : resourceTheme.color === "#b7c2d1" ? "183, 194, 209" : resourceTheme.color === "#6ea8ff" ? "110, 168, 255" : "95, 227, 143"}, ${0.82 - progress * 0.58})`;
      context.lineWidth = 2;
      context.stroke();

      context.save();
      context.globalAlpha = 0.92 - progress * 0.58;
      context.translate(position.x, position.y - hexSize * progress * 0.34);
      context.fillStyle = resourceTheme.color;
      context.strokeStyle = resourceTheme.color;
      drawResourceGlyph(context, 0, 0, animation.resourceType, hexSize * 0.18);
      context.restore();
      continue;
    }

    if (animation.kind === "deploy") {
      const position = toPixel(animation.coord, originX, originY, hexSize);
      context.beginPath();
      context.arc(position.x, position.y, hexSize * (0.36 + progress * 0.64), 0, Math.PI * 2);
      context.strokeStyle = `${playerTheme.glow.replace(/0\.28/, String(0.72 - progress * 0.44))}`;
      context.lineWidth = 2.4;
      context.stroke();

      context.beginPath();
      context.moveTo(position.x, position.y - hexSize * 1.3);
      context.lineTo(position.x, position.y - hexSize * 0.18);
      context.strokeStyle = `rgba(${animation.playerId === "player_1" ? "99, 213, 255" : "255, 153, 105"}, ${0.56 - progress * 0.32})`;
      context.lineWidth = 3.2;
      context.stroke();
      continue;
    }

    if (animation.kind === "base_hit") {
      const position = toPixel(animation.coord, originX, originY, hexSize);
      context.beginPath();
      context.arc(position.x, position.y, hexSize * (0.54 + progress * 0.92), 0, Math.PI * 2);
      context.strokeStyle = `rgba(255, 112, 112, ${0.84 - progress * 0.52})`;
      context.lineWidth = 3;
      context.stroke();
      context.fillStyle = `rgba(255, 211, 184, ${0.74 - progress * 0.46})`;
      context.font = `${clamp(hexSize * 0.36, 12, 18)}px "Avenir Next", "Trebuchet MS", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.fillText(`-${animation.damage}`, position.x, position.y - hexSize * (0.5 + progress * 0.4));
      continue;
    }

    if (animation.kind === "stack_cast") {
      const from = toPixel(animation.from, originX, originY, hexSize);
      const anchor = getStackAnchor(frame);
      const controlX = (from.x + anchor.x) * 0.5;
      const controlY = Math.min(from.y, anchor.y) - hexSize * 1.25;
      const trailT = progress;
      const currentX = (1 - trailT) * (1 - trailT) * from.x + 2 * (1 - trailT) * trailT * controlX + trailT * trailT * anchor.x;
      const currentY = (1 - trailT) * (1 - trailT) * from.y + 2 * (1 - trailT) * trailT * controlY + trailT * trailT * anchor.y;
      const beamAlpha = 0.78 - progress * 0.42;

      context.beginPath();
      context.moveTo(from.x, from.y);
      context.quadraticCurveTo(controlX, controlY, anchor.x, anchor.y);
      context.strokeStyle = animation.playerId === "player_1" ? `rgba(99, 213, 255, ${beamAlpha})` : `rgba(255, 153, 105, ${beamAlpha})`;
      context.lineWidth = 2.4 + (1 - progress) * 1.4;
      context.stroke();

      context.strokeStyle = animation.visual === "counter" ? "#a9d7ff" : "#e6f0ff";
      drawStackGlyph(context, currentX, currentY, hexSize * 0.16, animation.visual);

      context.fillStyle = `rgba(228, 239, 255, ${0.86 - progress * 0.54})`;
      context.font = `${clamp(hexSize * 0.3, 10, 13)}px "Avenir Next", "Trebuchet MS", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.fillText(truncateLabel(animation.label), anchor.x, anchor.y - hexSize * 0.42);
      continue;
    }

    if (animation.kind === "stack_counter") {
      const from = toPixel(animation.from, originX, originY, hexSize);
      const anchor = getStackAnchor(frame);
      const controlX = (from.x + anchor.x) * 0.5;
      const controlY = Math.min(from.y, anchor.y) - hexSize * 1.18;
      const burstRadius = hexSize * (0.2 + progress * 0.52);
      const beamAlpha = 0.84 - progress * 0.48;

      context.beginPath();
      context.moveTo(from.x, from.y);
      context.quadraticCurveTo(controlX, controlY, anchor.x, anchor.y);
      context.strokeStyle = animation.playerId === "player_1" ? `rgba(99, 213, 255, ${beamAlpha})` : `rgba(255, 153, 105, ${beamAlpha})`;
      context.lineWidth = 2.8 + (1 - progress) * 1.6;
      context.stroke();

      context.beginPath();
      context.arc(anchor.x, anchor.y, burstRadius, 0, Math.PI * 2);
      context.strokeStyle = animation.returnToHand ? `rgba(114, 244, 198, ${0.9 - progress * 0.52})` : `rgba(255, 126, 126, ${0.9 - progress * 0.52})`;
      context.lineWidth = 2.2;
      context.stroke();

      context.strokeStyle = `rgba(226, 240, 255, ${0.78 - progress * 0.48})`;
      drawStackGlyph(context, anchor.x, anchor.y, hexSize * (0.2 + progress * 0.06), animation.targetVisual);

      context.strokeStyle = animation.returnToHand ? `rgba(150, 250, 214, ${0.92 - progress * 0.56})` : `rgba(255, 210, 210, ${0.92 - progress * 0.56})`;
      drawStackGlyph(context, anchor.x, anchor.y, hexSize * (0.16 + progress * 0.1), "counter");

      context.fillStyle = animation.returnToHand ? `rgba(180, 255, 222, ${0.9 - progress * 0.58})` : `rgba(255, 219, 219, ${0.9 - progress * 0.58})`;
      context.font = `${clamp(hexSize * 0.28, 10, 13)}px "Avenir Next", "Trebuchet MS", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.fillText(`${animation.returnToHand ? "Recall" : "Counter"} ${truncateLabel(animation.targetLabel, 16)}`, anchor.x, anchor.y - hexSize * (0.54 + progress * 0.2));
      continue;
    }

    if (animation.kind === "spell_resolve") {
      const anchor = getStackAnchor(frame);
      const target = toPixel(animation.coord, originX, originY, hexSize);
      const controlX = anchor.x + (target.x - anchor.x) * 0.46;
      const controlY = Math.min(anchor.y, target.y) - hexSize * 0.68;

      const beamAlpha = 0.86 - progress * 0.44;
      context.beginPath();
      context.moveTo(anchor.x, anchor.y);
      context.quadraticCurveTo(controlX, controlY, target.x, target.y);
      context.strokeStyle = animation.playerId === "player_1" ? `rgba(99, 213, 255, ${beamAlpha})` : `rgba(255, 153, 105, ${beamAlpha})`;
      context.lineWidth = 2.4 + (1 - progress) * 1.8;
      context.stroke();

      if (animation.visual === "buff") {
        context.beginPath();
        context.arc(target.x, target.y, hexSize * (0.3 + progress * 0.46), 0, Math.PI * 2);
        context.strokeStyle = `rgba(111, 245, 195, ${0.88 - progress * 0.5})`;
        context.lineWidth = 2.2;
        context.stroke();

        context.beginPath();
        context.arc(target.x, target.y, hexSize * (0.14 + progress * 0.18), 0, Math.PI * 2);
        context.fillStyle = `rgba(111, 245, 195, ${0.22 - progress * 0.14})`;
        context.fill();

        context.fillStyle = `rgba(190, 255, 229, ${0.9 - progress * 0.5})`;
        context.font = `${clamp(hexSize * 0.29, 10, 13)}px "Avenir Next", "Trebuchet MS", sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "bottom";
        context.fillText(animation.label, target.x, target.y - hexSize * (0.54 + progress * 0.22));
        continue;
      }

      if (animation.visual === "destroy") {
        const radius = hexSize * (0.22 + progress * 0.42);
        context.beginPath();
        context.arc(target.x, target.y, radius, 0, Math.PI * 2);
        context.strokeStyle = `rgba(255, 120, 120, ${0.9 - progress * 0.5})`;
        context.lineWidth = 2.3;
        context.stroke();

        context.beginPath();
        context.moveTo(target.x - radius * 0.72, target.y - radius * 0.72);
        context.lineTo(target.x + radius * 0.72, target.y + radius * 0.72);
        context.moveTo(target.x + radius * 0.72, target.y - radius * 0.72);
        context.lineTo(target.x - radius * 0.72, target.y + radius * 0.72);
        context.strokeStyle = `rgba(255, 215, 215, ${0.94 - progress * 0.56})`;
        context.lineWidth = 2.4;
        context.stroke();

        context.fillStyle = `rgba(255, 215, 215, ${0.88 - progress * 0.54})`;
        context.font = `${clamp(hexSize * 0.29, 10, 13)}px "Avenir Next", "Trebuchet MS", sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "bottom";
        context.fillText("Destroy", target.x, target.y - hexSize * (0.54 + progress * 0.22));
        continue;
      }

      const impactColor = animation.visual === "base_damage" ? "rgba(255, 137, 116," : "rgba(255, 232, 178,";
      const textColor = animation.visual === "base_damage" ? "rgba(255, 214, 194," : "rgba(255, 244, 214,";
      context.beginPath();
      context.arc(target.x, target.y, hexSize * (0.18 + progress * 0.46), 0, Math.PI * 2);
      context.strokeStyle = `${impactColor} ${0.88 - progress * 0.54})`;
      context.lineWidth = 2.2;
      context.stroke();

      context.fillStyle = `${textColor} ${0.84 - progress * 0.5})`;
      context.font = `${clamp(hexSize * 0.34, 11, 15)}px "Avenir Next", "Trebuchet MS", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.fillText(`-${animation.amount ?? 0}`, target.x, target.y - hexSize * (0.5 + progress * 0.3));
      continue;
    }
  }
}

function drawMapFrame(context: CanvasRenderingContext2D, frame: GameFrame): void {
  const { width, height } = frame.viewport;
  context.strokeStyle = "rgba(39, 60, 118, 0.72)";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
}

export function updateGame(state: GameState, frame: GameFrame): void {
  void state;
  void frame;
}

export function renderGame(state: GameState, frame: GameFrame): void {
  const { context, viewport } = frame;
  const metrics = getHexMetrics(viewport, state.map);
  const originX = metrics.origin.x;
  const originY = metrics.origin.y;
  const hexSize = metrics.size;

  drawBackdrop(context, frame);
  drawPlayerTerritory(state, context, originX, originY, hexSize);
  drawHexGrid(state, context, originX, originY, hexSize);
  drawMoveRangeOverlay(state, context, originX, originY, hexSize);
  drawResourceNodes(state, context, originX, originY, hexSize);
  drawHoverHexAndTargetPreview(state, context, originX, originY, hexSize);
  const stackActivityLevel = frame.transients.animations.some((animation) => {
    return animation.kind === "stack_cast" || animation.kind === "stack_counter" || animation.kind === "spell_resolve";
  })
    ? 1
    : 0;
  if (state.stack.length > 0 || stackActivityLevel > 0) {
    drawStackAnchor(context, frame, state.stack.length, stackActivityLevel);
  }
  drawAnimations(context, frame, originX, originY, hexSize);

  for (const entity of Object.values(state.entities)) {
    drawBase(entity, context, originX, originY, hexSize);
  }

  for (const entity of Object.values(state.entities)) {
    drawUnit(state, entity, context, originX, originY, hexSize, frame.transients.timeSeconds);
  }

  drawMapFrame(context, frame);
}
