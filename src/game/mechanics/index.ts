import type { GameState } from "../model/state";
import { initializeRegisteredMechanicState, migrateRegisteredMechanicState, resetRegisteredTurnMechanicState } from "../registries/mechanicState";
import { installBloomCompatibilityShims } from "./bloom";
import { installSalvageCompatibilityShim } from "./salvage";
import { installSurgeCompatibilityShim } from "./surge";

import "./surge";
import "./bloom";
import "./salvage";

export { getBloomedUnitIdsThisTurn, getLastBloomSourceItemId, getLastBloomedUnitIds, resetBloomResolutionState, setLastBloomSourceItemId } from "./bloom";
export { getSalvageTriggersThisTurn, incrementSalvageTriggersThisTurn } from "./salvage";
export { getTacticsCastThisTurn, incrementTacticsCastThisTurn } from "./surge";

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
  installSurgeCompatibilityShim(state);
  installBloomCompatibilityShims(state);
  installSalvageCompatibilityShim(state);
}

export function initializeMechanicState(state: GameState): void {
  ensureMechanicStateRoot(state);
  initializeRegisteredMechanicState(state);
  installMechanicCompatibilityShims(state);
}

export function migrateMechanicState(state: GameState): void {
  ensureMechanicStateRoot(state);
  migrateRegisteredMechanicState(state);
  installMechanicCompatibilityShims(state);
}

export function resetTurnMechanicState(state: GameState): void {
  resetRegisteredTurnMechanicState(state);
}
