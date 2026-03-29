import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import { registerMechanicStateInitializer, registerMechanicStateMigrator, registerMechanicTurnResetHook } from "../registries/mechanicState";
import { ensureMechanicStateNamespace } from "./stateAccess";

const SALVAGE_MECHANIC_ID = "salvage";

type SalvageTurnState = {
  triggersByPlayer: Record<PlayerId, number>;
};

function getSalvageTurnState(state: GameState): SalvageTurnState {
  return ensureMechanicStateNamespace(state, "turn", SALVAGE_MECHANIC_ID, () => ({
    triggersByPlayer: {
      player_1: 0,
      player_2: 0,
    },
  }));
}

export function getSalvageTriggersThisTurn(state: GameState, playerId: PlayerId): number {
  return getSalvageTurnState(state).triggersByPlayer[playerId];
}

export function incrementSalvageTriggersThisTurn(state: GameState, playerId: PlayerId): void {
  getSalvageTurnState(state).triggersByPlayer[playerId] += 1;
}

export function resetSalvageTurnState(state: GameState): void {
  getSalvageTurnState(state).triggersByPlayer.player_1 = 0;
  getSalvageTurnState(state).triggersByPlayer.player_2 = 0;
}

export function installSalvageCompatibilityShim(state: GameState): void {
  Object.defineProperty(state, "salvageTriggersThisTurn", {
    configurable: true,
    enumerable: true,
    get: () => getSalvageTurnState(state).triggersByPlayer,
    set: (value: Record<PlayerId, number>) => {
      getSalvageTurnState(state).triggersByPlayer = value;
    },
  });
}

registerMechanicStateInitializer(SALVAGE_MECHANIC_ID, (state) => {
  getSalvageTurnState(state);
});

registerMechanicStateMigrator(SALVAGE_MECHANIC_ID, (state) => {
  const legacy = (state as GameState & { salvageTriggersThisTurn?: Record<PlayerId, number> }).salvageTriggersThisTurn;
  const next = getSalvageTurnState(state).triggersByPlayer;
  next.player_1 = typeof legacy?.player_1 === "number" ? legacy.player_1 : 0;
  next.player_2 = typeof legacy?.player_2 === "number" ? legacy.player_2 : 0;
});

registerMechanicTurnResetHook(SALVAGE_MECHANIC_ID, resetSalvageTurnState);
