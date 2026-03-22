import type { GameFrame } from "./types";
import type { GameState } from "./model/state";
import { getHexMetrics } from "./render/layout";
import { drawBackdrop, drawHexGrid, drawPlayerTerritory, drawMoveRangeOverlay, drawResourceNodes } from "./render/grid";
import { drawBase, drawUnit } from "./render/entities";
import { drawStackAnchor, drawHoverHexAndTargetPreview, drawMapFrame } from "./render/overlays";
import { drawAnimations } from "./render/animationDrawing";

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
    return animation.kind === "stack_cast" || animation.kind === "stack_counter" || animation.kind === "spell_resolve" || animation.kind === "hex_shower";
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
