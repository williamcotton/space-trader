import type { GameState } from "../model/state";
import { ensureDefaultContentLoaded } from "../content/loader";
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
  ensureDefaultContentLoaded();
  ensureMechanicStateRoot(state);
  initializeRegisteredMechanicState(state);
}

export function migrateMechanicState(state: GameState): void {
  ensureDefaultContentLoaded();
  ensureMechanicStateRoot(state);
  migrateRegisteredMechanicState(state);
}

export function resetTurnMechanicState(state: GameState): void {
  ensureDefaultContentLoaded();
  resetRegisteredTurnMechanicState(state);
}

export function resetResolutionMechanicState(state: GameState): void {
  ensureDefaultContentLoaded();
  resetRegisteredResolutionMechanicState(state);
}
