import type { GameState } from "./model/state";

export type GameViewport = {
  width: number;
  height: number;
};

export type GameFrame = {
  context: CanvasRenderingContext2D;
  viewport: GameViewport;
  deltaSeconds: number;
};

export type UpdateSystem = (state: GameState, frame: GameFrame) => void;
export type RenderSystem = (state: GameState, frame: GameFrame) => void;
