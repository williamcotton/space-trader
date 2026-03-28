import type { CanvasAnimation, GameFrame } from "../types";
import { getPlayerTheme, getResourceTheme } from "../presentation";
import { toPixel, clamp, drawHexOutline, drawResourceGlyph, truncateLabel } from "./primitives";
import { getStackAnchor, drawStackGlyph } from "./overlays";

export type AnimationDrawContext = {
  ctx: CanvasRenderingContext2D;
  frame: GameFrame;
  originX: number;
  originY: number;
  hexSize: number;
  progress: number;
};

function drawMoveAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "move" }>): void {
  const from = toPixel(animation.from, d.originX, d.originY, d.hexSize);
  const to = toPixel(animation.to, d.originX, d.originY, d.hexSize);
  const currentX = from.x + (to.x - from.x) * d.progress;
  const currentY = from.y + (to.y - from.y) * d.progress;

  d.ctx.beginPath();
  d.ctx.moveTo(from.x, from.y);
  d.ctx.lineTo(currentX, currentY);
  d.ctx.strokeStyle = `rgba(${animation.playerId === "player_1" ? "99, 213, 255" : "255, 153, 105"}, ${0.55 - d.progress * 0.35})`;
  d.ctx.lineWidth = 4;
  d.ctx.stroke();

  d.ctx.fillStyle = `rgba(255, 255, 255, ${0.28 - d.progress * 0.16})`;
  d.ctx.beginPath();
  d.ctx.arc(currentX, currentY, d.hexSize * 0.18, 0, Math.PI * 2);
  d.ctx.fill();
}

function drawAttackAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "attack" }>): void {
  const from = toPixel(animation.from, d.originX, d.originY, d.hexSize);
  const to = toPixel(animation.to, d.originX, d.originY, d.hexSize);
  d.ctx.beginPath();
  d.ctx.moveTo(from.x, from.y);
  d.ctx.lineTo(to.x, to.y);
  d.ctx.strokeStyle = `rgba(${animation.playerId === "player_1" ? "105, 229, 255" : "255, 163, 110"}, ${0.9 - d.progress * 0.55})`;
  d.ctx.lineWidth = 3 + (1 - d.progress) * 3;
  d.ctx.stroke();

  d.ctx.beginPath();
  d.ctx.arc(to.x, to.y, d.hexSize * (0.18 + d.progress * 0.4), 0, Math.PI * 2);
  d.ctx.strokeStyle = animation.targetDestroyed ? `rgba(255, 118, 118, ${0.84 - d.progress * 0.42})` : `rgba(255, 232, 178, ${0.82 - d.progress * 0.46})`;
  d.ctx.lineWidth = 2.2;
  d.ctx.stroke();

  d.ctx.fillStyle = `rgba(255, 239, 214, ${0.78 - d.progress * 0.54})`;
  d.ctx.font = `${clamp(d.hexSize * 0.34, 11, 15)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  d.ctx.textAlign = "center";
  d.ctx.textBaseline = "bottom";
  d.ctx.fillText(`-${animation.damage}`, to.x, to.y - d.hexSize * (0.32 + d.progress * 0.44));
}

function drawHarvestAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "harvest" }>): void {
  const position = toPixel(animation.coord, d.originX, d.originY, d.hexSize);
  const resourceTheme = getResourceTheme(animation.resourceType);
  d.ctx.beginPath();
  d.ctx.arc(position.x, position.y, d.hexSize * (0.24 + d.progress * 0.46), 0, Math.PI * 2);
  d.ctx.strokeStyle = `rgba(${resourceTheme.color === "#e8f15e" ? "232, 241, 94" : resourceTheme.color === "#b7c2d1" ? "183, 194, 209" : resourceTheme.color === "#6ea8ff" ? "110, 168, 255" : "95, 227, 143"}, ${0.82 - d.progress * 0.58})`;
  d.ctx.lineWidth = 2;
  d.ctx.stroke();

  d.ctx.save();
  d.ctx.globalAlpha = 0.92 - d.progress * 0.58;
  d.ctx.translate(position.x, position.y - d.hexSize * d.progress * 0.34);
  d.ctx.fillStyle = resourceTheme.color;
  d.ctx.strokeStyle = resourceTheme.color;
  drawResourceGlyph(d.ctx, 0, 0, animation.resourceType, d.hexSize * 0.18);
  d.ctx.restore();
}

function drawDeployAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "deploy" }>): void {
  const position = toPixel(animation.coord, d.originX, d.originY, d.hexSize);
  const playerTheme = getPlayerTheme(animation.playerId);
  d.ctx.beginPath();
  d.ctx.arc(position.x, position.y, d.hexSize * (0.36 + d.progress * 0.64), 0, Math.PI * 2);
  d.ctx.strokeStyle = `${playerTheme.glow.replace(/0\.28/, String(0.72 - d.progress * 0.44))}`;
  d.ctx.lineWidth = 2.4;
  d.ctx.stroke();

  d.ctx.beginPath();
  d.ctx.moveTo(position.x, position.y - d.hexSize * 1.3);
  d.ctx.lineTo(position.x, position.y - d.hexSize * 0.18);
  d.ctx.strokeStyle = `rgba(${animation.playerId === "player_1" ? "99, 213, 255" : "255, 153, 105"}, ${0.56 - d.progress * 0.32})`;
  d.ctx.lineWidth = 3.2;
  d.ctx.stroke();
}

function drawBaseHitAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "base_hit" }>): void {
  const position = toPixel(animation.coord, d.originX, d.originY, d.hexSize);
  d.ctx.beginPath();
  d.ctx.arc(position.x, position.y, d.hexSize * (0.54 + d.progress * 0.92), 0, Math.PI * 2);
  d.ctx.strokeStyle = `rgba(255, 112, 112, ${0.84 - d.progress * 0.52})`;
  d.ctx.lineWidth = 3;
  d.ctx.stroke();
  d.ctx.fillStyle = `rgba(255, 211, 184, ${0.74 - d.progress * 0.46})`;
  d.ctx.font = `${clamp(d.hexSize * 0.36, 12, 18)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  d.ctx.textAlign = "center";
  d.ctx.textBaseline = "bottom";
  d.ctx.fillText(`-${animation.damage}`, position.x, position.y - d.hexSize * (0.5 + d.progress * 0.4));
}

function drawStackCastAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "stack_cast" }>): void {
  const from = toPixel(animation.from, d.originX, d.originY, d.hexSize);
  const anchor = getStackAnchor(d.frame);
  const controlX = (from.x + anchor.x) * 0.5;
  const controlY = Math.min(from.y, anchor.y) - d.hexSize * 1.25;
  const trailT = d.progress;
  const currentX = (1 - trailT) * (1 - trailT) * from.x + 2 * (1 - trailT) * trailT * controlX + trailT * trailT * anchor.x;
  const currentY = (1 - trailT) * (1 - trailT) * from.y + 2 * (1 - trailT) * trailT * controlY + trailT * trailT * anchor.y;
  const beamAlpha = 0.78 - d.progress * 0.42;

  d.ctx.beginPath();
  d.ctx.moveTo(from.x, from.y);
  d.ctx.quadraticCurveTo(controlX, controlY, anchor.x, anchor.y);
  d.ctx.strokeStyle = animation.playerId === "player_1" ? `rgba(99, 213, 255, ${beamAlpha})` : `rgba(255, 153, 105, ${beamAlpha})`;
  d.ctx.lineWidth = 2.4 + (1 - d.progress) * 1.4;
  d.ctx.stroke();

  d.ctx.strokeStyle = animation.visual === "counter" ? "#a9d7ff" : "#e6f0ff";
  drawStackGlyph(d.ctx, currentX, currentY, d.hexSize * 0.16, animation.visual);

  d.ctx.fillStyle = `rgba(228, 239, 255, ${0.86 - d.progress * 0.54})`;
  d.ctx.font = `${clamp(d.hexSize * 0.3, 10, 13)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  d.ctx.textAlign = "center";
  d.ctx.textBaseline = "bottom";
  d.ctx.fillText(truncateLabel(animation.label), anchor.x, anchor.y - d.hexSize * 0.42);
}

function drawStackCounterAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "stack_counter" }>): void {
  const from = toPixel(animation.from, d.originX, d.originY, d.hexSize);
  const anchor = getStackAnchor(d.frame);
  const controlX = (from.x + anchor.x) * 0.5;
  const controlY = Math.min(from.y, anchor.y) - d.hexSize * 1.18;
  const burstRadius = d.hexSize * (0.2 + d.progress * 0.52);
  const beamAlpha = 0.84 - d.progress * 0.48;

  d.ctx.beginPath();
  d.ctx.moveTo(from.x, from.y);
  d.ctx.quadraticCurveTo(controlX, controlY, anchor.x, anchor.y);
  d.ctx.strokeStyle = animation.playerId === "player_1" ? `rgba(99, 213, 255, ${beamAlpha})` : `rgba(255, 153, 105, ${beamAlpha})`;
  d.ctx.lineWidth = 2.8 + (1 - d.progress) * 1.6;
  d.ctx.stroke();

  d.ctx.beginPath();
  d.ctx.arc(anchor.x, anchor.y, burstRadius, 0, Math.PI * 2);
  d.ctx.strokeStyle = animation.returnToHand ? `rgba(114, 244, 198, ${0.9 - d.progress * 0.52})` : `rgba(255, 126, 126, ${0.9 - d.progress * 0.52})`;
  d.ctx.lineWidth = 2.2;
  d.ctx.stroke();

  d.ctx.strokeStyle = `rgba(226, 240, 255, ${0.78 - d.progress * 0.48})`;
  drawStackGlyph(d.ctx, anchor.x, anchor.y, d.hexSize * (0.2 + d.progress * 0.06), animation.targetVisual);

  d.ctx.strokeStyle = animation.returnToHand ? `rgba(150, 250, 214, ${0.92 - d.progress * 0.56})` : `rgba(255, 210, 210, ${0.92 - d.progress * 0.56})`;
  drawStackGlyph(d.ctx, anchor.x, anchor.y, d.hexSize * (0.16 + d.progress * 0.1), "counter");

  d.ctx.fillStyle = animation.returnToHand ? `rgba(180, 255, 222, ${0.9 - d.progress * 0.58})` : `rgba(255, 219, 219, ${0.9 - d.progress * 0.58})`;
  d.ctx.font = `${clamp(d.hexSize * 0.28, 10, 13)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  d.ctx.textAlign = "center";
  d.ctx.textBaseline = "bottom";
  d.ctx.fillText(`${animation.returnToHand ? "Recall" : "Counter"} ${truncateLabel(animation.targetLabel, 16)}`, anchor.x, anchor.y - d.hexSize * (0.54 + d.progress * 0.2));
}

function drawSpellResolveAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "spell_resolve" }>): void {
  const anchor = getStackAnchor(d.frame);
  const target = toPixel(animation.coord, d.originX, d.originY, d.hexSize);
  const controlX = anchor.x + (target.x - anchor.x) * 0.46;
  const controlY = Math.min(anchor.y, target.y) - d.hexSize * 0.68;

  const beamAlpha = 0.86 - d.progress * 0.44;
  d.ctx.beginPath();
  d.ctx.moveTo(anchor.x, anchor.y);
  d.ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
  d.ctx.strokeStyle = animation.playerId === "player_1" ? `rgba(99, 213, 255, ${beamAlpha})` : `rgba(255, 153, 105, ${beamAlpha})`;
  d.ctx.lineWidth = 2.4 + (1 - d.progress) * 1.8;
  d.ctx.stroke();

  if (animation.visual === "buff") {
    d.ctx.beginPath();
    d.ctx.arc(target.x, target.y, d.hexSize * (0.3 + d.progress * 0.46), 0, Math.PI * 2);
    d.ctx.strokeStyle = `rgba(111, 245, 195, ${0.88 - d.progress * 0.5})`;
    d.ctx.lineWidth = 2.2;
    d.ctx.stroke();

    d.ctx.beginPath();
    d.ctx.arc(target.x, target.y, d.hexSize * (0.14 + d.progress * 0.18), 0, Math.PI * 2);
    d.ctx.fillStyle = `rgba(111, 245, 195, ${0.22 - d.progress * 0.14})`;
    d.ctx.fill();

    d.ctx.fillStyle = `rgba(190, 255, 229, ${0.9 - d.progress * 0.5})`;
    d.ctx.font = `${clamp(d.hexSize * 0.29, 10, 13)}px "Avenir Next", "Trebuchet MS", sans-serif`;
    d.ctx.textAlign = "center";
    d.ctx.textBaseline = "bottom";
    d.ctx.fillText(animation.label, target.x, target.y - d.hexSize * (0.54 + d.progress * 0.22));
    return;
  }

  if (animation.visual === "destroy") {
    const radius = d.hexSize * (0.22 + d.progress * 0.42);
    d.ctx.beginPath();
    d.ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
    d.ctx.strokeStyle = `rgba(255, 120, 120, ${0.9 - d.progress * 0.5})`;
    d.ctx.lineWidth = 2.3;
    d.ctx.stroke();

    d.ctx.beginPath();
    d.ctx.moveTo(target.x - radius * 0.72, target.y - radius * 0.72);
    d.ctx.lineTo(target.x + radius * 0.72, target.y + radius * 0.72);
    d.ctx.moveTo(target.x + radius * 0.72, target.y - radius * 0.72);
    d.ctx.lineTo(target.x - radius * 0.72, target.y + radius * 0.72);
    d.ctx.strokeStyle = `rgba(255, 215, 215, ${0.94 - d.progress * 0.56})`;
    d.ctx.lineWidth = 2.4;
    d.ctx.stroke();

    d.ctx.fillStyle = `rgba(255, 215, 215, ${0.88 - d.progress * 0.54})`;
    d.ctx.font = `${clamp(d.hexSize * 0.29, 10, 13)}px "Avenir Next", "Trebuchet MS", sans-serif`;
    d.ctx.textAlign = "center";
    d.ctx.textBaseline = "bottom";
    d.ctx.fillText("Destroy", target.x, target.y - d.hexSize * (0.54 + d.progress * 0.22));
    return;
  }

  const impactColor = animation.visual === "base_damage" ? "rgba(255, 137, 116," : "rgba(255, 232, 178,";
  const textColor = animation.visual === "base_damage" ? "rgba(255, 214, 194," : "rgba(255, 244, 214,";
  d.ctx.beginPath();
  d.ctx.arc(target.x, target.y, d.hexSize * (0.18 + d.progress * 0.46), 0, Math.PI * 2);
  d.ctx.strokeStyle = `${impactColor} ${0.88 - d.progress * 0.54})`;
  d.ctx.lineWidth = 2.2;
  d.ctx.stroke();

  d.ctx.fillStyle = `${textColor} ${0.84 - d.progress * 0.5})`;
  d.ctx.font = `${clamp(d.hexSize * 0.34, 11, 15)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  d.ctx.textAlign = "center";
  d.ctx.textBaseline = "bottom";
  d.ctx.fillText(`-${animation.amount ?? 0}`, target.x, target.y - d.hexSize * (0.5 + d.progress * 0.3));
}

function drawHexShowerAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "hex_shower" }>): void {
  const origin = toPixel(animation.origin, d.originX, d.originY, d.hexSize);
  const accentColors = {
    alloy: { stroke: "255, 178, 118", fill: "255, 223, 194" },
    flux: { stroke: "104, 223, 255", fill: "197, 246, 255" },
    biomass: { stroke: "122, 246, 165", fill: "209, 255, 224" },
    neutral: { stroke: "214, 227, 255", fill: "241, 246, 255" },
  } as const;
  const colors = accentColors[animation.accent];

  for (const [index, hex] of animation.hexes.entries()) {
    const position = toPixel(hex, d.originX, d.originY, d.hexSize);
    const stagger = (index % 4) * 0.06;
    const localProgress = clamp((d.progress - stagger) / (1 - stagger || 1), 0, 1);
    if (localProgress <= 0) {
      continue;
    }

    d.ctx.beginPath();
    drawHexOutline(d.ctx, position.x, position.y, d.hexSize * (0.42 + localProgress * 0.08));
    d.ctx.strokeStyle = `rgba(${colors.stroke}, ${0.72 - localProgress * 0.4})`;
    d.ctx.lineWidth = 1.8;
    d.ctx.stroke();

    d.ctx.beginPath();
    d.ctx.arc(position.x, position.y, d.hexSize * (0.12 + localProgress * 0.22), 0, Math.PI * 2);
    d.ctx.fillStyle = `rgba(${colors.fill}, ${0.18 - localProgress * 0.1})`;
    d.ctx.fill();

    const streakAlpha = 0.86 - localProgress * 0.56;
    for (let streakIndex = 0; streakIndex < 3; streakIndex += 1) {
      const offset = (streakIndex - 1) * d.hexSize * 0.18;
      d.ctx.beginPath();
      d.ctx.moveTo(position.x + offset, position.y - d.hexSize * (0.82 - localProgress * 0.18));
      d.ctx.lineTo(position.x + offset * 0.72, position.y - d.hexSize * (0.12 - localProgress * 0.1));
      d.ctx.strokeStyle = `rgba(${colors.stroke}, ${streakAlpha})`;
      d.ctx.lineWidth = 1.5 + (1 - localProgress) * 1.2;
      d.ctx.stroke();
    }
  }

  d.ctx.beginPath();
  d.ctx.arc(origin.x, origin.y, d.hexSize * (0.2 + d.progress * 0.52), 0, Math.PI * 2);
  d.ctx.strokeStyle = `rgba(${colors.stroke}, ${0.9 - d.progress * 0.5})`;
  d.ctx.lineWidth = 2.4;
  d.ctx.stroke();

  d.ctx.beginPath();
  d.ctx.arc(origin.x, origin.y, d.hexSize * (0.06 + d.progress * 0.18), 0, Math.PI * 2);
  d.ctx.fillStyle = `rgba(${colors.fill}, ${0.34 - d.progress * 0.2})`;
  d.ctx.fill();

  d.ctx.fillStyle = `rgba(${colors.fill}, ${0.92 - d.progress * 0.54})`;
  d.ctx.font = `${clamp(d.hexSize * 0.3, 10, 14)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  d.ctx.textAlign = "center";
  d.ctx.textBaseline = "bottom";
  d.ctx.fillText(animation.label, origin.x, origin.y - d.hexSize * (0.78 + d.progress * 0.14));
}

function drawBoardBlastAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "board_blast" }>): void {
  const center = toPixel(animation.center, d.originX, d.originY, d.hexSize);
  const accentColors = {
    alloy: { stroke: "255, 178, 118", fill: "255, 223, 194" },
    flux: { stroke: "104, 223, 255", fill: "197, 246, 255" },
    biomass: { stroke: "122, 246, 165", fill: "209, 255, 224" },
    neutral: { stroke: "230, 237, 255", fill: "246, 249, 255" },
  } as const;
  const colors = accentColors[animation.accent];

  for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
    const ringProgress = clamp((d.progress - ringIndex * 0.12) / (1 - ringIndex * 0.12 || 1), 0, 1);
    if (ringProgress <= 0) {
      continue;
    }

    d.ctx.beginPath();
    drawHexOutline(d.ctx, center.x, center.y, d.hexSize * (0.7 + ringIndex * 0.18 + ringProgress * 0.72));
    d.ctx.strokeStyle = `rgba(${colors.stroke}, ${0.42 - ringProgress * 0.22})`;
    d.ctx.lineWidth = 2.8 - ringProgress * 1.2;
    d.ctx.stroke();
  }

  for (const [index, hex] of animation.hexes.entries()) {
    const position = toPixel(hex, d.originX, d.originY, d.hexSize);
    const stagger = (index % 6) * 0.035;
    const localProgress = clamp((d.progress - stagger) / (1 - stagger || 1), 0, 1);
    if (localProgress <= 0) {
      continue;
    }

    d.ctx.beginPath();
    drawHexOutline(d.ctx, position.x, position.y, d.hexSize * (0.42 + localProgress * 0.08));
    d.ctx.strokeStyle = `rgba(${colors.stroke}, ${0.78 - localProgress * 0.42})`;
    d.ctx.lineWidth = 1.8;
    d.ctx.stroke();

    d.ctx.beginPath();
    d.ctx.arc(position.x, position.y, d.hexSize * (0.12 + localProgress * 0.3), 0, Math.PI * 2);
    d.ctx.fillStyle = `rgba(${colors.fill}, ${0.22 - localProgress * 0.12})`;
    d.ctx.fill();

    for (let streakIndex = 0; streakIndex < 3; streakIndex += 1) {
      const laneOffset = (streakIndex - 1) * d.hexSize * 0.2;
      d.ctx.beginPath();
      d.ctx.moveTo(position.x + laneOffset, position.y - d.hexSize * (1.36 - localProgress * 0.22));
      d.ctx.lineTo(position.x + laneOffset * 0.66, position.y - d.hexSize * (0.1 - localProgress * 0.1));
      d.ctx.strokeStyle = `rgba(${colors.stroke}, ${0.86 - localProgress * 0.54})`;
      d.ctx.lineWidth = 1.6 + (1 - localProgress) * 1.4;
      d.ctx.stroke();
    }

    for (let shardIndex = 0; shardIndex < 2; shardIndex += 1) {
      const shardOffset = (shardIndex === 0 ? -1 : 1) * d.hexSize * 0.18;
      d.ctx.beginPath();
      d.ctx.moveTo(position.x + shardOffset * 0.2, position.y - d.hexSize * 0.02);
      d.ctx.lineTo(position.x + shardOffset, position.y + d.hexSize * (0.3 + localProgress * 0.22));
      d.ctx.strokeStyle = `rgba(${colors.fill}, ${0.58 - localProgress * 0.34})`;
      d.ctx.lineWidth = 1.2 + (1 - localProgress) * 0.8;
      d.ctx.stroke();
    }
  }

  d.ctx.beginPath();
  d.ctx.arc(center.x, center.y, d.hexSize * (0.16 + d.progress * 0.42), 0, Math.PI * 2);
  d.ctx.fillStyle = `rgba(${colors.fill}, ${0.28 - d.progress * 0.16})`;
  d.ctx.fill();

  for (let streakIndex = 0; streakIndex < 4; streakIndex += 1) {
    const laneOffset = (streakIndex - 1.5) * d.hexSize * 0.22;
    d.ctx.beginPath();
    d.ctx.moveTo(center.x + laneOffset, center.y - d.hexSize * (1.7 - d.progress * 0.24));
    d.ctx.lineTo(center.x + laneOffset * 0.7, center.y - d.hexSize * (0.22 - d.progress * 0.1));
    d.ctx.strokeStyle = `rgba(${colors.stroke}, ${0.56 - d.progress * 0.3})`;
    d.ctx.lineWidth = 2.2 + (1 - d.progress) * 1.2;
    d.ctx.stroke();
  }

  d.ctx.fillStyle = `rgba(${colors.fill}, ${0.94 - d.progress * 0.56})`;
  d.ctx.font = `${clamp(d.hexSize * 0.36, 11, 16)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  d.ctx.textAlign = "center";
  d.ctx.textBaseline = "bottom";
  d.ctx.fillText(animation.label, center.x, center.y - d.hexSize * (1.2 + d.progress * 0.2));
}

function drawDeathBurstAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "death_burst" }>): void {
  const position = toPixel(animation.coord, d.originX, d.originY, d.hexSize);
  const hexAlpha = 0.8 - d.progress * 0.44;
  const fillAlpha = 0.22 - d.progress * 0.12;

  d.ctx.beginPath();
  drawHexOutline(d.ctx, position.x, position.y, d.hexSize * (0.42 + d.progress * 0.1));
  d.ctx.strokeStyle = `rgba(255, 170, 170, ${hexAlpha})`;
  d.ctx.lineWidth = 1.9;
  d.ctx.stroke();

  d.ctx.beginPath();
  d.ctx.arc(position.x, position.y, d.hexSize * (0.14 + d.progress * 0.2), 0, Math.PI * 2);
  d.ctx.fillStyle = `rgba(255, 225, 225, ${fillAlpha})`;
  d.ctx.fill();

  for (let streakIndex = 0; streakIndex < 4; streakIndex += 1) {
    const stagger = streakIndex * 0.05;
    const localProgress = clamp((d.progress - stagger) / (1 - stagger || 1), 0, 1);
    if (localProgress <= 0) {
      continue;
    }

    const offset = (streakIndex - 1.5) * d.hexSize * 0.18;
    d.ctx.beginPath();
    d.ctx.moveTo(position.x + offset, position.y - d.hexSize * (1.05 - localProgress * 0.18));
    d.ctx.lineTo(position.x + offset * 0.72, position.y - d.hexSize * (0.08 - localProgress * 0.08));
    d.ctx.strokeStyle = `rgba(255, 178, 178, ${0.88 - localProgress * 0.56})`;
    d.ctx.lineWidth = 1.6 + (1 - localProgress) * 1.2;
    d.ctx.stroke();
  }

  for (let shardIndex = 0; shardIndex < 3; shardIndex += 1) {
    const offset = (shardIndex - 1) * d.hexSize * 0.22;
    d.ctx.beginPath();
    d.ctx.moveTo(position.x + offset * 0.2, position.y - d.hexSize * 0.02);
    d.ctx.lineTo(position.x + offset, position.y + d.hexSize * (0.34 + d.progress * 0.26));
    d.ctx.strokeStyle = `rgba(255, 210, 210, ${0.64 - d.progress * 0.38})`;
    d.ctx.lineWidth = 1.2 + (1 - d.progress) * 0.9;
    d.ctx.stroke();
  }

  d.ctx.beginPath();
  d.ctx.moveTo(position.x - d.hexSize * 0.18, position.y - d.hexSize * 0.18);
  d.ctx.lineTo(position.x + d.hexSize * 0.18, position.y + d.hexSize * 0.18);
  d.ctx.moveTo(position.x + d.hexSize * 0.18, position.y - d.hexSize * 0.18);
  d.ctx.lineTo(position.x - d.hexSize * 0.18, position.y + d.hexSize * 0.18);
  d.ctx.strokeStyle = `rgba(${animation.playerId === "player_1" ? "154, 232, 255" : "255, 208, 183"}, ${0.82 - d.progress * 0.52})`;
  d.ctx.lineWidth = 1.9 - d.progress * 0.7;
  d.ctx.stroke();
}

function drawMatchIntroAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "match_intro" }>): void {
  const center = toPixel(animation.center, d.originX, d.originY, d.hexSize);
  const ringAlpha = 0.42 - d.progress * 0.18;
  const streakAlpha = 0.72 - d.progress * 0.42;
  const fadeIn = clamp(d.progress / 0.14, 0, 1);
  const shrinkProgress = clamp(d.progress, 0, 1);
  const titleAlpha = fadeIn * (1 - shrinkProgress * 0.86) * 0.96;
  const titleScale = 6.4 - shrinkProgress * 5.85;
  const titleY = center.y - d.hexSize * 0.24;
  const subtitleAlpha = Math.min(clamp((d.progress - 0.08) / 0.16, 0, 1), 1 - shrinkProgress * 0.82) * 0.74;

  for (let ringIndex = 0; ringIndex < 4; ringIndex += 1) {
    const ringProgress = clamp((d.progress - ringIndex * 0.08) / (1 - ringIndex * 0.08 || 1), 0, 1);
    if (ringProgress <= 0) {
      continue;
    }

    d.ctx.beginPath();
    drawHexOutline(d.ctx, center.x, center.y, d.hexSize * (0.9 + ringIndex * 0.28 + ringProgress * 1.18));
    d.ctx.strokeStyle = ringIndex % 2 === 0
      ? `rgba(108, 224, 255, ${ringAlpha - ringProgress * 0.12})`
      : `rgba(255, 176, 124, ${ringAlpha - ringProgress * 0.12})`;
    d.ctx.lineWidth = 2.8 - ringProgress * 1.1;
    d.ctx.stroke();
  }

  for (let beamIndex = 0; beamIndex < 7; beamIndex += 1) {
    const offset = (beamIndex - 3) * d.hexSize * 0.48;
    d.ctx.beginPath();
    d.ctx.moveTo(center.x + offset, center.y - d.hexSize * (4.2 - d.progress * 0.32));
    d.ctx.lineTo(center.x + offset * 0.72, center.y - d.hexSize * (0.36 - d.progress * 0.08));
    d.ctx.strokeStyle = beamIndex % 2 === 0
      ? `rgba(103, 219, 255, ${streakAlpha})`
      : `rgba(255, 162, 112, ${streakAlpha * 0.86})`;
    d.ctx.lineWidth = 1.8 + (1 - d.progress) * 1.8;
    d.ctx.stroke();
  }

  d.ctx.beginPath();
  d.ctx.arc(center.x, center.y, d.hexSize * (0.22 + d.progress * 0.48), 0, Math.PI * 2);
  d.ctx.fillStyle = `rgba(236, 245, 255, ${0.2 - d.progress * 0.08})`;
  d.ctx.fill();

  d.ctx.save();
  d.ctx.translate(center.x, titleY);
  d.ctx.scale(titleScale, titleScale * 0.94);
  d.ctx.textAlign = "center";
  d.ctx.textBaseline = "middle";
  d.ctx.strokeStyle = `rgba(112, 223, 255, ${titleAlpha * 0.34})`;
  d.ctx.lineWidth = 1.8 / titleScale;
  d.ctx.font = `${clamp(d.hexSize * 0.58, 18, 30)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  d.ctx.strokeText(animation.label, 0, 0);
  d.ctx.fillStyle = `rgba(239, 246, 255, ${titleAlpha})`;
  d.ctx.fillText(animation.label, 0, 0);
  d.ctx.restore();

  d.ctx.fillStyle = `rgba(182, 205, 255, ${subtitleAlpha})`;
  d.ctx.font = `${clamp(d.hexSize * 0.24, 9, 12)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  d.ctx.textAlign = "center";
  d.ctx.textBaseline = "top";
  d.ctx.fillText(animation.subtitle.toUpperCase(), center.x, center.y + d.hexSize * (0.98 - d.progress * 0.06));
}

function drawVictoryFanfareAnimation(d: AnimationDrawContext, animation: Extract<CanvasAnimation, { kind: "victory_fanfare" }>): void {
  const center = toPixel(animation.center, d.originX, d.originY, d.hexSize);
  const palette =
    animation.playerId === "player_1"
      ? { stroke: "108, 224, 255", fill: "210, 246, 255", glow: "155, 233, 255" }
      : { stroke: "255, 171, 120", fill: "255, 224, 201", glow: "255, 205, 174" };

  for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
    const ringProgress = clamp((d.progress - ringIndex * 0.1) / (1 - ringIndex * 0.1 || 1), 0, 1);
    if (ringProgress <= 0) {
      continue;
    }

    d.ctx.beginPath();
    drawHexOutline(d.ctx, center.x, center.y, d.hexSize * (0.84 + ringIndex * 0.26 + ringProgress * 0.86));
    d.ctx.strokeStyle = `rgba(${palette.stroke}, ${0.48 - ringProgress * 0.18})`;
    d.ctx.lineWidth = 3 - ringProgress * 1.1;
    d.ctx.stroke();
  }

  for (const [index, hex] of animation.hexes.entries()) {
    const position = toPixel(hex, d.originX, d.originY, d.hexSize);
    const stagger = (index % 8) * 0.03;
    const localProgress = clamp((d.progress - stagger) / (1 - stagger || 1), 0, 1);
    if (localProgress <= 0) {
      continue;
    }

    d.ctx.beginPath();
    drawHexOutline(d.ctx, position.x, position.y, d.hexSize * (0.38 + localProgress * 0.1));
    d.ctx.strokeStyle = `rgba(${palette.stroke}, ${0.72 - localProgress * 0.36})`;
    d.ctx.lineWidth = 1.6;
    d.ctx.stroke();

    for (let streakIndex = 0; streakIndex < 3; streakIndex += 1) {
      const laneOffset = (streakIndex - 1) * d.hexSize * 0.2;
      d.ctx.beginPath();
      d.ctx.moveTo(position.x + laneOffset, position.y - d.hexSize * (1.22 - localProgress * 0.18));
      d.ctx.lineTo(position.x + laneOffset * 0.68, position.y - d.hexSize * (0.12 - localProgress * 0.08));
      d.ctx.strokeStyle = `rgba(${palette.stroke}, ${0.84 - localProgress * 0.5})`;
      d.ctx.lineWidth = 1.5 + (1 - localProgress) * 1.1;
      d.ctx.stroke();
    }
  }

  for (let shardIndex = 0; shardIndex < 6; shardIndex += 1) {
    const angle = (-Math.PI / 2.8) + shardIndex * 0.34;
    const startX = center.x + Math.cos(angle) * d.hexSize * 0.24;
    const startY = center.y + Math.sin(angle) * d.hexSize * 0.18;
    const endX = center.x + Math.cos(angle) * d.hexSize * (1.2 + d.progress * 1.1);
    const endY = center.y + Math.sin(angle) * d.hexSize * (0.78 + d.progress * 0.52);
    d.ctx.beginPath();
    d.ctx.moveTo(startX, startY);
    d.ctx.lineTo(endX, endY);
    d.ctx.strokeStyle = `rgba(${palette.glow}, ${0.6 - d.progress * 0.28})`;
    d.ctx.lineWidth = 1.8 + (1 - d.progress) * 1.2;
    d.ctx.stroke();
  }

  d.ctx.beginPath();
  d.ctx.arc(center.x, center.y, d.hexSize * (0.24 + d.progress * 0.44), 0, Math.PI * 2);
  d.ctx.fillStyle = `rgba(${palette.fill}, ${0.24 - d.progress * 0.08})`;
  d.ctx.fill();

  d.ctx.fillStyle = `rgba(${palette.fill}, ${0.96 - d.progress * 0.42})`;
  d.ctx.font = `${clamp(d.hexSize * 0.56, 17, 28)}px "Avenir Next", "Trebuchet MS", sans-serif`;
  d.ctx.textAlign = "center";
  d.ctx.textBaseline = "bottom";
  d.ctx.fillText(animation.label, center.x, center.y - d.hexSize * (1.62 + d.progress * 0.12));
}

export function drawAnimations(context: CanvasRenderingContext2D, frame: GameFrame, originX: number, originY: number, hexSize: number): void {
  for (const animation of frame.transients.animations) {
    const d: AnimationDrawContext = {
      ctx: context,
      frame,
      originX,
      originY,
      hexSize,
      progress: Math.max(0, Math.min(1, animation.ageSeconds / animation.durationSeconds)),
    };

    switch (animation.kind) {
      case "move":
        drawMoveAnimation(d, animation);
        break;
      case "attack":
        drawAttackAnimation(d, animation);
        break;
      case "harvest":
        drawHarvestAnimation(d, animation);
        break;
      case "deploy":
        drawDeployAnimation(d, animation);
        break;
      case "base_hit":
        drawBaseHitAnimation(d, animation);
        break;
      case "stack_cast":
        drawStackCastAnimation(d, animation);
        break;
      case "stack_counter":
        drawStackCounterAnimation(d, animation);
        break;
      case "spell_resolve":
        drawSpellResolveAnimation(d, animation);
        break;
      case "hex_shower":
        drawHexShowerAnimation(d, animation);
        break;
      case "board_blast":
        drawBoardBlastAnimation(d, animation);
        break;
      case "death_burst":
        drawDeathBurstAnimation(d, animation);
        break;
      case "match_intro":
        drawMatchIntroAnimation(d, animation);
        break;
      case "victory_fanfare":
        drawVictoryFanfareAnimation(d, animation);
        break;
    }
  }
}
