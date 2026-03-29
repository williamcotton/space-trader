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

type MechanicApiRegistry = {
  bloom: BloomMechanicApi;
  salvage: SalvageMechanicApi;
  surge: SurgeMechanicApi;
};

const mechanicApis = new Map<string, unknown>();

export function registerMechanicApi<K extends keyof MechanicApiRegistry>(mechanicId: K, api: MechanicApiRegistry[K]): void {
  mechanicApis.set(mechanicId, api);
}

export function getMechanicApi<K extends keyof MechanicApiRegistry>(mechanicId: K): MechanicApiRegistry[K] | undefined {
  const api = mechanicApis.get(mechanicId);
  return api as MechanicApiRegistry[K] | undefined;
}
