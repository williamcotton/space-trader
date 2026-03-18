import type { GameCommand } from "./actions/commands";
import { dispatchCommand, type DispatchResult } from "./actions/reducers";
import { FRONTIER_BELT_MAP } from "./content/maps/frontierBelt";
import { hexDistance } from "./model/hex";
import { createInitialGameState } from "./model/state";
import { renderGame, updateGame } from "./systems";
import type { GameState } from "./model/state";
import type { GameFrame, GameViewport, RenderSystem, UpdateSystem } from "./types";

const INITIAL_VIEWPORT: GameViewport = {
  width: 1024,
  height: 768,
};

class GameRuntime {
  private viewport: GameViewport = { ...INITIAL_VIEWPORT };
  private updateSystem: UpdateSystem = updateGame;
  private renderSystem: RenderSystem = renderGame;
  readonly state: GameState;

  constructor(state: GameState = createInitialGameState({ map: FRONTIER_BELT_MAP })) {
    this.state = state;
  }

  setViewport(width: number, height: number): void {
    this.viewport.width = width;
    this.viewport.height = height;
  }

  dispatch(command: GameCommand): DispatchResult {
    return dispatchCommand(this.state, command);
  }

  debugAdvancePhase(): void {
    void this.dispatch({
      type: "END_PHASE",
      playerId: this.state.activePlayerId,
    });
  }

  debugSelectFirstActiveUnit(): void {
    const activePlayerId = this.state.activePlayerId;
    const firstUnit = Object.values(this.state.entities).find(
      (entity) => entity.kind === "unit" && entity.ownerId === activePlayerId
    );

    if (!firstUnit) {
      return;
    }

    void this.dispatch({
      type: "SELECT_ENTITY",
      playerId: activePlayerId,
      entityId: firstUnit.id,
    });
  }

  debugMoveSelectedUnit(deltaQ: number, deltaR: number): void {
    const activePlayerId = this.state.activePlayerId;
    const selectedId = this.state.selectedEntityId;
    if (!selectedId) {
      return;
    }

    const selected = this.state.entities[selectedId];
    if (!selected || selected.kind !== "unit") {
      return;
    }

    void this.dispatch({
      type: "MOVE_UNIT",
      playerId: activePlayerId,
      entityId: selected.id,
      to: {
        q: selected.coord.q + deltaQ,
        r: selected.coord.r + deltaR,
      },
    });
  }

  debugAttackFirstTargetInRange(): void {
    const activePlayerId = this.state.activePlayerId;
    const selectedId = this.state.selectedEntityId;
    if (!selectedId) {
      return;
    }

    const attacker = this.state.entities[selectedId];
    if (!attacker || attacker.kind !== "unit") {
      return;
    }

    const target = Object.values(this.state.entities).find((entity) => {
      if (entity.ownerId === activePlayerId) {
        return false;
      }
      return hexDistance(attacker.coord, entity.coord) <= attacker.attackRange;
    });

    if (!target) {
      return;
    }

    void this.dispatch({
      type: "ATTACK_UNIT",
      playerId: activePlayerId,
      attackerId: attacker.id,
      targetId: target.id,
    });
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
