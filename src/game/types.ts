export type GameViewport = {
  width: number;
  height: number;
};

export type GameState = {
  message: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  fontSize: number;
  fontFamily: string;
  backgroundColor: string;
  textColor: string;
};

export type GameFrame = {
  context: CanvasRenderingContext2D;
  viewport: GameViewport;
  deltaSeconds: number;
};

export type UpdateSystem = (state: GameState, frame: GameFrame) => void;
export type RenderSystem = (state: GameState, frame: GameFrame) => void;
