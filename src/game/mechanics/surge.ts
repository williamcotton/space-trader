import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import { registerMechanicStateInitializer, registerMechanicStateMigrator, registerMechanicTurnResetHook } from "../registries/mechanicState";
import { ensureMechanicStateNamespace } from "./stateAccess";

const SURGE_MECHANIC_ID = "surge";

type SurgeTurnState = {
  tacticsCastByPlayer: Record<PlayerId, number>;
};

function createSurgeTurnState(): SurgeTurnState {
  return {
    tacticsCastByPlayer: {
      player_1: 0,
      player_2: 0,
    },
  };
}

function getSurgeTurnState(state: GameState): SurgeTurnState {
  return ensureMechanicStateNamespace(state, "turn", SURGE_MECHANIC_ID, createSurgeTurnState);
}

export function getTacticsCastThisTurn(state: GameState, playerId: PlayerId): number {
  return getSurgeTurnState(state).tacticsCastByPlayer[playerId];
}

export function incrementTacticsCastThisTurn(state: GameState, playerId: PlayerId): void {
  getSurgeTurnState(state).tacticsCastByPlayer[playerId] += 1;
}

export function resetSurgeTurnState(state: GameState): void {
  getSurgeTurnState(state).tacticsCastByPlayer.player_1 = 0;
  getSurgeTurnState(state).tacticsCastByPlayer.player_2 = 0;
}

export function installSurgeCompatibilityShim(state: GameState): void {
  Object.defineProperty(state, "tacticsCastThisTurn", {
    configurable: true,
    enumerable: true,
    get: () => getSurgeTurnState(state).tacticsCastByPlayer,
    set: (value: Record<PlayerId, number>) => {
      getSurgeTurnState(state).tacticsCastByPlayer = value;
    },
  });
}

registerMechanicStateInitializer(SURGE_MECHANIC_ID, (state) => {
  getSurgeTurnState(state);
});

registerMechanicStateMigrator(SURGE_MECHANIC_ID, (state) => {
  const legacy = (state as GameState & { tacticsCastThisTurn?: Record<PlayerId, number> }).tacticsCastThisTurn;
  const next = getSurgeTurnState(state).tacticsCastByPlayer;
  next.player_1 = typeof legacy?.player_1 === "number" ? legacy.player_1 : 0;
  next.player_2 = typeof legacy?.player_2 === "number" ? legacy.player_2 : 0;
});

registerMechanicTurnResetHook(SURGE_MECHANIC_ID, resetSurgeTurnState);
