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
}

function drawHud(state: GameState, context: CanvasRenderingContext2D, viewport: { width: number; height: number }): void {
  context.fillStyle = "rgba(6, 8, 24, 0.82)";
  context.fillRect(12, 12, 560, 286);

  context.fillStyle = "#d5e6ff";
  context.font = "16px monospace";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText(`Map: ${state.map.name}`, 24, 24);
  context.fillText(`Turn: ${state.turn}`, 24, 46);
  context.fillText(`Phase: ${state.phase}`, 24, 68);
  context.fillText(`Active: ${state.activePlayerId}`, 24, 90);
  context.fillText(`Priority: ${state.priorityPlayerId ?? "none"}`, 24, 112);
  context.fillText(`Passes: ${state.consecutivePriorityPasses}`, 24, 134);
  context.fillText(`Stack: ${state.stack.length}`, 24, 156);
  context.fillText(`State Version: ${state.stateVersion}`, 24, 178);
  context.fillText(`Selected: ${state.selectedEntityId ?? "none"}`, 24, 200);
  context.fillText(
    `Hover: ${state.hoveredHex ? `${state.hoveredHex.q}, ${state.hoveredHex.r}` : "none"}`,
    24,
    222
  );
  context.fillText(`Winner: ${state.winner ?? "none"}`, 24, 244);

  const p1 = state.players.player_1.resources;
  const p2 = state.players.player_2.resources;

  context.fillStyle = "#9fd8ff";
  context.fillText(`P1 C:${p1.credits} A:${p1.alloy} F:${p1.flux} B:${p1.biomass}`, 230, 68);

  context.fillStyle = "#ffb49a";
  context.fillText(`P2 C:${p2.credits} A:${p2.alloy} F:${p2.flux} B:${p2.biomass}`, 230, 90);

  context.fillStyle = "#9ca7d6";
  context.fillText("Click unit: select/deselect (active player)", 230, 112);
  context.fillText("Arrow Keys: Move selected (tactical phase)", 230, 134);
  context.fillText("A: Attack first target in range", 230, 156);
  context.fillText("P: Pass priority, R/T/C: No-op/Ping/Counter", 230, 178);
  context.fillText("N: End phase, U: Select first unit", 230, 200);

  if (state.lastRejectedReason) {
    context.fillStyle = "#ff9f92";
    context.fillText(`Last Reject: ${state.lastRejectedReason}`, 24, 266);
  }

  context.strokeStyle = "#1f2a58";
  context.strokeRect(0.5, 0.5, viewport.width - 1, viewport.height - 1);
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
  const targetArmor = hoveredEntity.kind === "unit" ? hoveredEntity.armor : 0;
  const projectedDamage = Math.max(1, selected.attackDamage - targetArmor);
  const projectedHp = Math.max(0, hoveredEntity.hp - projectedDamage);
  const isProjectedKill = projectedHp === 0;

  context.beginPath();
  context.moveTo(selectedPos.x, selectedPos.y);
  context.lineTo(targetPos.x, targetPos.y);
  context.strokeStyle = canAttackNow ? "rgba(107, 238, 142, 0.85)" : "rgba(255, 126, 126, 0.85)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = canAttackNow ? "#a8ffc0" : "#ffb1ad";
  context.font = "12px monospace";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText(
    `Target ${hoveredEntity.id}: ${distance}/${selected.attackRange}, Dmg ${projectedDamage}, HP ${hoveredEntity.hp}->${projectedHp}, KO ${isProjectedKill ? "yes" : "no"}`,
    24,
    294
  );
}

function drawSelectedUnitPanel(state: GameState, context: CanvasRenderingContext2D, viewport: { width: number; height: number }): void {
  const selected = getSelectedUnit(state);
  if (!selected) {
    return;
  }

  const panelWidth = 250;
  const panelHeight = 172;
  const x = viewport.width - panelWidth - 16;
  const y = 16;

  context.fillStyle = "rgba(7, 11, 30, 0.88)";
  context.fillRect(x, y, panelWidth, panelHeight);

  context.strokeStyle = "#274084";
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, panelWidth - 1, panelHeight - 1);

  context.fillStyle = getPlayerColor(selected.ownerId);
  context.font = "15px monospace";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText("Selected Unit", x + 12, y + 10);

  context.fillStyle = "#d5e6ff";
  context.font = "13px monospace";
  context.fillText(`ID: ${selected.id}`, x + 12, y + 34);
  context.fillText(`Role: ${selected.role}`, x + 12, y + 54);
  context.fillText(`HP: ${selected.hp}  Armor: ${selected.armor}`, x + 12, y + 74);
  context.fillText(`Attack: ${selected.attackDamage}  Range: ${selected.attackRange}`, x + 12, y + 94);
  context.fillText(`Move: ${selected.movesRemaining}/${selected.moveRange}`, x + 12, y + 114);
  context.fillText(`Attacks: ${selected.attacksRemaining}/${selected.attackActionsPerTurn}`, x + 12, y + 134);
  context.fillText(`Sickness: ${selected.hasSummoningSickness ? "yes" : "no"}`, x + 12, y + 154);
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

  drawHud(state, context, viewport);
  drawSelectedUnitPanel(state, context, viewport);
}
