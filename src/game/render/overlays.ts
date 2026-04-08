import { getPlayableHexes, hexDistance, hexKey, isWithinMapBounds } from "../model/hex";
import type { EntityId } from "../model/ids";
import type { GameState, HexCoord, UnitEntity } from "../model/state";
import { getSelectedUnit } from "../model/queries";
import { spatialGetEntity } from "../derived";
import type { GameFrame } from "../types";
import { canUnitDeclareAttack, getAttackableEntitiesForUnit } from "../rules/directInteraction";
import { getEffectiveUnitAttackRange } from "../systems/unitStats";
import type { ContinuousEffect, StatModifier } from "../systems/continuousEffects";
import { getPlayerTheme } from "../presentation";
import { toPixel, clamp, drawDiamond, drawRegularPolygon, drawRoundedRect, drawHexOutline } from "./primitives";

type AdjacentAuraTarget = Extract<ContinuousEffect["target"], { type: "adjacent_allies" }>;
type AdjacentAuraEffect = ContinuousEffect & {
  payload: StatModifier;
  target: AdjacentAuraTarget;
};
type AuraStatLabel = "ATK" | "ARM" | "SG";
type ContextualAuraSource = {
  source: UnitEntity;
  effects: AdjacentAuraEffect[];
  selected: boolean;
  hovered: boolean;
};
type AuraImpactSummary = {
  unit: UnitEntity;
  bonuses: Map<AuraStatLabel, number>;
};

function getAuraStatLabel(stat: StatModifier["stat"]): AuraStatLabel | null {
  switch (stat) {
    case "attackDamage":
      return "ATK";
    case "armor":
      return "ARM";
    case "siegeDamageBonus":
      return "SG";
    default:
      return null;
  }
}

function isRenderableAdjacentAuraEffect(effect: ContinuousEffect): effect is AdjacentAuraEffect {
  return (
    effect.target.type === "adjacent_allies" &&
    effect.payload.type === "stat_modifier" &&
    effect.payload.amount !== 0 &&
    getAuraStatLabel(effect.payload.stat) !== null
  );
}

function getHoveredAuraSourceId(state: GameState, frame: GameFrame): EntityId | null {
  const hoveredHex = frame.transients.hoveredHex;
  if (!hoveredHex) {
    return null;
  }

  const entity = spatialGetEntity(frame.derived.spatialIndex, state.entities, hoveredHex);
  return entity?.kind === "unit" ? entity.id : null;
}

function collectContextualAuraSources(state: GameState, frame: GameFrame): ContextualAuraSource[] {
  const selectedSourceId = state.selectedEntityId;
  const hoveredSourceId = getHoveredAuraSourceId(state, frame);
  const sourceIds = new Set<EntityId>();
  if (selectedSourceId) {
    sourceIds.add(selectedSourceId);
  }
  if (hoveredSourceId) {
    sourceIds.add(hoveredSourceId);
  }
  if (sourceIds.size === 0) {
    return [];
  }

  const sources = new Map<EntityId, ContextualAuraSource>();
  for (const effect of state.continuousEffects) {
    if (!isRenderableAdjacentAuraEffect(effect) || !sourceIds.has(effect.target.sourceEntityId)) {
      continue;
    }

    const source = state.entities[effect.target.sourceEntityId];
    if (!source || source.kind !== "unit") {
      continue;
    }

    const existing = sources.get(source.id);
    if (existing) {
      existing.effects.push(effect);
      continue;
    }

    sources.set(source.id, {
      source,
      effects: [effect],
      selected: selectedSourceId === source.id,
      hovered: hoveredSourceId === source.id,
    });
  }

  return [...sources.values()];
}

function doesAuraEffectApplyToUnit(effect: AdjacentAuraEffect, source: UnitEntity, unit: UnitEntity): boolean {
  if (source.id === unit.id) {
    return false;
  }
  if (source.ownerId !== unit.ownerId) {
    return false;
  }
  if (effect.target.roleFilter && unit.role !== effect.target.roleFilter) {
    return false;
  }
  return hexDistance(source.coord, unit.coord) === 1;
}

function addAuraBonus(summary: AuraImpactSummary, label: AuraStatLabel, amount: number): void {
  summary.bonuses.set(label, (summary.bonuses.get(label) ?? 0) + amount);
}

function collectAuraImpacts(state: GameState, sources: ContextualAuraSource[]): Map<EntityId, AuraImpactSummary> {
  const impacts = new Map<EntityId, AuraImpactSummary>();
  for (const auraSource of sources) {
    for (const entity of Object.values(state.entities)) {
      if (entity.kind !== "unit") {
        continue;
      }

      for (const effect of auraSource.effects) {
        if (!doesAuraEffectApplyToUnit(effect, auraSource.source, entity)) {
          continue;
        }

        const label = getAuraStatLabel(effect.payload.stat);
        if (!label) {
          continue;
        }

        const existing = impacts.get(entity.id);
        if (existing) {
          addAuraBonus(existing, label, effect.payload.amount);
        } else {
          const summary: AuraImpactSummary = {
            unit: entity,
            bonuses: new Map(),
          };
          addAuraBonus(summary, label, effect.payload.amount);
          impacts.set(entity.id, summary);
        }
      }
    }
  }

  return impacts;
}

function formatAuraBonus(amount: number, label: AuraStatLabel): string {
  return `${amount > 0 ? "+" : ""}${amount} ${label}`;
}

function collectAffectedHexesForSource(state: GameState, auraSource: ContextualAuraSource): Set<string> {
  const affectedHexes = new Set<string>();
  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "unit") {
      continue;
    }
    if (auraSource.effects.some((effect) => doesAuraEffectApplyToUnit(effect, auraSource.source, entity))) {
      affectedHexes.add(hexKey(entity.coord));
    }
  }
  return affectedHexes;
}

function getAdjacentMapHexes(state: GameState, sourceCoord: HexCoord): HexCoord[] {
  return getPlayableHexes(state.map).filter((coord) => hexDistance(sourceCoord, coord) === 1);
}

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

export function drawAuraFootprintOverlay(
  state: GameState,
  frame: GameFrame,
  context: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  hexSize: number
): void {
  const sources = collectContextualAuraSources(state, frame);
  if (sources.length === 0) {
    return;
  }

  for (const auraSource of sources) {
    const theme = getPlayerTheme(auraSource.source.ownerId);
    const affectedHexes = collectAffectedHexesForSource(state, auraSource);
    const sourceAlpha = auraSource.hovered ? 0.88 : 0.72;
    const sourcePos = toPixel(auraSource.source.coord, originX, originY, hexSize);

    context.save();
    drawHexOutline(context, sourcePos.x, sourcePos.y, hexSize - 2.8);
    context.strokeStyle = theme.line;
    context.globalAlpha = sourceAlpha;
    context.lineWidth = auraSource.selected ? 2.1 : 1.7;
    context.stroke();
    context.restore();

    for (const coord of getAdjacentMapHexes(state, auraSource.source.coord)) {
      const { x, y } = toPixel(coord, originX, originY, hexSize);
      const hasAffectedUnit = affectedHexes.has(hexKey(coord));

      context.save();
      drawHexOutline(context, x, y, hexSize - 5.2);
      context.fillStyle = theme.primary;
      context.globalAlpha = hasAffectedUnit ? 0.18 : 0.08;
      context.fill();
      context.globalAlpha = hasAffectedUnit ? 0.74 : 0.38;
      context.strokeStyle = theme.line;
      context.lineWidth = hasAffectedUnit ? 1.9 : 1.25;
      context.stroke();
      context.restore();
    }
  }
}

export function drawAuraImpactOverlay(
  state: GameState,
  frame: GameFrame,
  context: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  hexSize: number
): void {
  const sources = collectContextualAuraSources(state, frame);
  if (sources.length === 0) {
    return;
  }

  const impacts = collectAuraImpacts(state, sources);
  if (impacts.size === 0) {
    return;
  }

  const statOrder: AuraStatLabel[] = ["ATK", "ARM", "SG"];
  for (const summary of impacts.values()) {
    const labels = statOrder.flatMap((label) => {
      const amount = summary.bonuses.get(label) ?? 0;
      return amount === 0 ? [] : [formatAuraBonus(amount, label)];
    });
    if (labels.length === 0) {
      continue;
    }

    const theme = getPlayerTheme(summary.unit.ownerId);
    const { x, y } = toPixel(summary.unit.coord, originX, originY, hexSize);
    const text = labels.join(" ");
    const fontSize = clamp(hexSize * 0.24, 8, 11);
    const height = clamp(hexSize * 0.32, 14, 18);

    context.save();
    context.font = `700 ${fontSize}px "Avenir Next", "Trebuchet MS", sans-serif`;
    const width = Math.max(clamp(hexSize * 0.72, 30, 42), context.measureText(text).width + 12);
    const chipX = x - width / 2;
    const chipY = y + hexSize * 0.39;

    drawRoundedRect(context, chipX, chipY, width, height, height / 2);
    context.fillStyle = "rgba(6, 11, 27, 0.9)";
    context.fill();
    context.strokeStyle = theme.line;
    context.globalAlpha = 0.86;
    context.lineWidth = 1;
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = "#f4fbff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, chipY + height / 2 + 0.5);
    context.restore();
  }
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
