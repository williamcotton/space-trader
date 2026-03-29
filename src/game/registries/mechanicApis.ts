import type { PlayerId, EntityId } from "../model/ids";
import type { GameState } from "../model/state";

export type BloomMechanicApi = {
  installCompatibilityShim(state: GameState): void;
  getBloomedUnitIdsThisTurn(state: GameState): EntityId[];
  getLastBloomSourceItemId(state: GameState): string | null;
  setLastBloomSourceItemId(state: GameState, itemId: string | null): void;
  getLastBloomedUnitIds(state: GameState): EntityId[];
  resetBloomResolutionState(state: GameState): void;
};

export type SalvageMechanicApi = {
  installCompatibilityShim(state: GameState): void;
  getSalvageTriggersThisTurn(state: GameState, playerId: PlayerId): number;
  incrementSalvageTriggersThisTurn(state: GameState, playerId: PlayerId): void;
};

export type SurgeMechanicApi = {
  installCompatibilityShim(state: GameState): void;
  getTacticsCastThisTurn(state: GameState, playerId: PlayerId): number;
  incrementTacticsCastThisTurn(state: GameState, playerId: PlayerId): void;
};

export type MechanicCompatibilityApi = {
  installCompatibilityShim?(state: GameState): void;
};

const mechanicApis = new Map<string, unknown>();

export function registerMechanicApi<T extends object>(mechanicId: string, api: T): void {
  mechanicApis.set(mechanicId, api);
}

export function getMechanicApi<T>(mechanicId: string): T | undefined {
  const api = mechanicApis.get(mechanicId);
  return api as T | undefined;
}

export function getRegisteredMechanicApis(): Array<[string, unknown]> {
  return [...mechanicApis.entries()];
}
