import type { GameFrame } from "./types";
import type { GameState } from "./model/state";
import { getHexMetrics } from "./render/layout";
import { drawMoveRangeOverlay, drawResourceNodeControlOverlays, drawStaticBoardLayer } from "./render/grid";
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

  drawStaticBoardLayer(state, frame, context, originX, originY, hexSize);
  drawResourceNodeControlOverlays(state, context, originX, originY, hexSize);
  drawMoveRangeOverlay(frame, context, originX, originY, hexSize);
  drawHoverHexAndTargetPreview(state, frame, context, originX, originY, hexSize);
  const stackActivityLevel = frame.transients.animations.some((animation) => {
    return animation.kind === "stack_cast" || animation.kind === "stack_counter" || animation.kind === "spell_resolve" || animation.kind === "hex_shower";
  })
    ? 1
    : 0;
  if (state.stack.length > 0 || stackActivityLevel > 0) {
    drawStackAnchor(context, frame, state.stack.length, stackActivityLevel);
  }
  drawAnimations(context, frame, originX, originY, hexSize, "base");

  const entities = Object.values(state.entities);
  for (let i = 0; i < entities.length; i++) {
    drawBase(entities[i], context, originX, originY, hexSize);
  }

  for (let i = 0; i < entities.length; i++) {
    drawUnit(state, entities[i], context, originX, originY, hexSize, frame.transients.timeSeconds);
  }

  drawAnimations(context, frame, originX, originY, hexSize, "foreground");
  drawMapFrame(context, frame);
}
