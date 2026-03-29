import type { GameState } from "../model/state";
import { ensureBaseContentLoaded } from "../content/loader";
import {
  initializeRegisteredMechanicState,
  migrateRegisteredMechanicState,
  resetRegisteredResolutionMechanicState,
  resetRegisteredTurnMechanicState,
} from "../registries/mechanicState";
import { getMechanicApi, type BloomMechanicApi, type SalvageMechanicApi, type SurgeMechanicApi } from "../registries/mechanicApis";

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
  getMechanicApi("surge")?.installCompatibilityShim(state);
  getMechanicApi("bloom")?.installCompatibilityShim(state);
  getMechanicApi("salvage")?.installCompatibilityShim(state);
}

function requireMechanicApi<T>(mechanicId: "bloom" | "salvage" | "surge"): T {
  ensureBaseContentLoaded();
  const api = getMechanicApi(mechanicId) as T | undefined;
  if (!api) {
    throw new Error(`Missing registered mechanic API for ${mechanicId}.`);
  }
  return api;
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

export function getBloomedUnitIdsThisTurn(state: GameState) {
  return requireMechanicApi<BloomMechanicApi>("bloom").getBloomedUnitIdsThisTurn(state);
}

export function getLastBloomSourceItemId(state: GameState) {
  return requireMechanicApi<BloomMechanicApi>("bloom").getLastBloomSourceItemId(state);
}

export function setLastBloomSourceItemId(state: GameState, itemId: string | null): void {
  requireMechanicApi<BloomMechanicApi>("bloom").setLastBloomSourceItemId(state, itemId);
}

export function getLastBloomedUnitIds(state: GameState) {
  return requireMechanicApi<BloomMechanicApi>("bloom").getLastBloomedUnitIds(state);
}

export function resetBloomResolutionState(state: GameState): void {
  requireMechanicApi<BloomMechanicApi>("bloom").resetBloomResolutionState(state);
}

export function getSalvageTriggersThisTurn(state: GameState, playerId: "player_1" | "player_2"): number {
  return requireMechanicApi<SalvageMechanicApi>("salvage").getSalvageTriggersThisTurn(state, playerId);
}

export function incrementSalvageTriggersThisTurn(state: GameState, playerId: "player_1" | "player_2"): void {
  requireMechanicApi<SalvageMechanicApi>("salvage").incrementSalvageTriggersThisTurn(state, playerId);
}

export function getTacticsCastThisTurn(state: GameState, playerId: "player_1" | "player_2"): number {
  return requireMechanicApi<SurgeMechanicApi>("surge").getTacticsCastThisTurn(state, playerId);
}

export function incrementTacticsCastThisTurn(state: GameState, playerId: "player_1" | "player_2"): void {
  requireMechanicApi<SurgeMechanicApi>("surge").incrementTacticsCastThisTurn(state, playerId);
}
