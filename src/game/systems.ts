import type { GameFrame, GameState } from "./types";

function getFont(state: GameState): string {
  return `${state.fontSize}px ${state.fontFamily}`;
}

export function updateGame(state: GameState, frame: GameFrame): void {
  const { context, viewport, deltaSeconds } = frame;
  const font = getFont(state);
  context.font = font;
  const textWidth = context.measureText(state.message).width;
  const textHeight = state.fontSize;

  state.x += state.dx * deltaSeconds;
  state.y += state.dy * deltaSeconds;

  if (state.x <= 0) {
    state.x = 0;
    state.dx = Math.abs(state.dx);
  }

  if (state.x + textWidth >= viewport.width) {
    state.x = viewport.width - textWidth;
    state.dx = -Math.abs(state.dx);
  }

  if (state.y - textHeight <= 0) {
    state.y = textHeight;
    state.dy = Math.abs(state.dy);
  }

  if (state.y >= viewport.height) {
    state.y = viewport.height;
    state.dy = -Math.abs(state.dy);
  }
}

export function renderGame(state: GameState, frame: GameFrame): void {
  const { context, viewport } = frame;
  context.fillStyle = state.backgroundColor;
  context.fillRect(0, 0, viewport.width, viewport.height);

  context.font = getFont(state);
  context.fillStyle = state.textColor;
  context.textBaseline = "alphabetic";
  context.fillText(state.message, state.x, state.y);
}
