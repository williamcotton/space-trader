import { renderGame, updateGame } from "./systems";
import type { GameFrame, GameState, GameViewport, RenderSystem, UpdateSystem } from "./types";

const INITIAL_VIEWPORT: GameViewport = {
  width: 1024,
  height: 768,
};

function createInitialGameState(): GameState {
  return {
    message: "hello, world!",
    x: 80,
    y: 120,
    dx: 280,
    dy: 200,
    fontSize: 32,
    fontFamily: "monospace",
    backgroundColor: "#0a0a2e",
    textColor: "#00ff88",
  };
}

class GameRuntime {
  private viewport: GameViewport = { ...INITIAL_VIEWPORT };
  private updateSystem: UpdateSystem = updateGame;
  private renderSystem: RenderSystem = renderGame;
  readonly state: GameState;

  constructor(state: GameState = createInitialGameState()) {
    this.state = state;
  }

  setViewport(width: number, height: number): void {
    this.viewport.width = width;
    this.viewport.height = height;
  }

  setMessage(message: string): void {
    this.state.message = message;
  }

  replaceSystems(update: UpdateSystem, render: RenderSystem): void {
    this.updateSystem = update;
    this.renderSystem = render;
  }

  step(context: CanvasRenderingContext2D, deltaSeconds: number): void {
    const frame: GameFrame = {
      context,
      viewport: this.viewport,
      deltaSeconds,
    };

    this.updateSystem(this.state, frame);
    this.renderSystem(this.state, frame);
  }
}

type RuntimeHotData = {
  runtime?: GameRuntime;
};

const hotData = (import.meta.hot?.data ?? {}) as RuntimeHotData;
const runtime = hotData.runtime ?? new GameRuntime();

runtime.replaceSystems(updateGame, renderGame);

export function getGameRuntime(): GameRuntime {
  return runtime;
}

if (import.meta.hot) {
  import.meta.hot.accept("./systems", (module) => {
    const next = module as typeof import("./systems") | undefined;
    if (!next) {
      return;
    }
    runtime.replaceSystems(next.updateGame, next.renderGame);
  });

  import.meta.hot.dispose((data: RuntimeHotData) => {
    data.runtime = runtime;
  });
}
