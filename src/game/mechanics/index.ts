import type { GameState } from "../model/state";
import { ensureBaseContentLoaded } from "../content/loader";
import {
  initializeRegisteredMechanicState,
  migrateRegisteredMechanicState,
  resetRegisteredResolutionMechanicState,
  resetRegisteredTurnMechanicState,
} from "../registries/mechanicState";

function ensureMechanicStateRoot(state: GameState): void {
  if (!state.mechanicState) {
    state.mechanicState = {
      match: {},
      turn: {},
      resolution: {},
    };
  }
}

export function initializeMechanicState(state: GameState): void {
  ensureBaseContentLoaded();
  ensureMechanicStateRoot(state);
  initializeRegisteredMechanicState(state);
}

export function migrateMechanicState(state: GameState): void {
  ensureBaseContentLoaded();
  ensureMechanicStateRoot(state);
  migrateRegisteredMechanicState(state);
}

export function resetTurnMechanicState(state: GameState): void {
  ensureBaseContentLoaded();
  resetRegisteredTurnMechanicState(state);
}

export function resetResolutionMechanicState(state: GameState): void {
  ensureBaseContentLoaded();
  resetRegisteredResolutionMechanicState(state);
}
