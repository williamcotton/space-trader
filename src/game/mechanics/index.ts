import type { GameState } from "../model/state";
import { ensureBaseContentLoaded } from "../content/loader";
import {
  initializeRegisteredMechanicState,
  migrateRegisteredMechanicState,
  resetRegisteredResolutionMechanicState,
  resetRegisteredTurnMechanicState,
} from "../registries/mechanicState";
import { getRegisteredMechanicApis, type MechanicCompatibilityApi } from "../registries/mechanicApis";

function ensureMechanicStateRoot(state: GameState): void {
  if (!state.mechanicState) {
    state.mechanicState = {
      match: {},
      turn: {},
      resolution: {},
    };
  }
}

function installMechanicCompatibilityShims(state: GameState): void {
  for (const [, api] of getRegisteredMechanicApis()) {
    const compatibilityApi = api as MechanicCompatibilityApi;
    if (typeof compatibilityApi.installCompatibilityShim === "function") {
      compatibilityApi.installCompatibilityShim(state);
    }
  }
}

export function initializeMechanicState(state: GameState): void {
  ensureBaseContentLoaded();
  ensureMechanicStateRoot(state);
  initializeRegisteredMechanicState(state);
  installMechanicCompatibilityShims(state);
}

export function migrateMechanicState(state: GameState): void {
  ensureBaseContentLoaded();
  ensureMechanicStateRoot(state);
  migrateRegisteredMechanicState(state);
  installMechanicCompatibilityShims(state);
}

export function resetTurnMechanicState(state: GameState): void {
  ensureBaseContentLoaded();
  resetRegisteredTurnMechanicState(state);
}

export function resetResolutionMechanicState(state: GameState): void {
  ensureBaseContentLoaded();
  resetRegisteredResolutionMechanicState(state);
}
