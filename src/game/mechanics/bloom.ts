import type { EntityId } from "../model/ids";
import type { GameState } from "../model/state";
import { registerMechanicStateInitializer, registerMechanicStateMigrator, registerMechanicTurnResetHook } from "../registries/mechanicState";
import { ensureMechanicStateNamespace } from "./stateAccess";

const BLOOM_MECHANIC_ID = "bloom";

type BloomTurnState = {
  bloomedUnitIdsThisTurn: EntityId[];
};

type BloomResolutionState = {
  lastSourceItemId: string | null;
  lastBloomedUnitIds: EntityId[];
};

function getBloomTurnState(state: GameState): BloomTurnState {
  return ensureMechanicStateNamespace(state, "turn", BLOOM_MECHANIC_ID, () => ({
    bloomedUnitIdsThisTurn: [],
  }));
}

function getBloomResolutionState(state: GameState): BloomResolutionState {
  return ensureMechanicStateNamespace(state, "resolution", BLOOM_MECHANIC_ID, () => ({
    lastSourceItemId: null,
    lastBloomedUnitIds: [],
  }));
}

export function getBloomedUnitIdsThisTurn(state: GameState): EntityId[] {
  return getBloomTurnState(state).bloomedUnitIdsThisTurn;
}

export function getLastBloomSourceItemId(state: GameState): string | null {
  return getBloomResolutionState(state).lastSourceItemId;
}

export function setLastBloomSourceItemId(state: GameState, itemId: string | null): void {
  getBloomResolutionState(state).lastSourceItemId = itemId;
}

export function getLastBloomedUnitIds(state: GameState): EntityId[] {
  return getBloomResolutionState(state).lastBloomedUnitIds;
}

export function resetBloomResolutionState(state: GameState): void {
  setLastBloomSourceItemId(state, null);
  getLastBloomedUnitIds(state).length = 0;
}

export function resetBloomTurnState(state: GameState): void {
  getBloomedUnitIdsThisTurn(state).length = 0;
  resetBloomResolutionState(state);
}

export function installBloomCompatibilityShims(state: GameState): void {
  Object.defineProperty(state, "bloomedUnitIdsThisTurn", {
    configurable: true,
    enumerable: true,
    get: () => getBloomedUnitIdsThisTurn(state),
    set: (value: EntityId[]) => {
      getBloomTurnState(state).bloomedUnitIdsThisTurn = value;
    },
  });
  Object.defineProperty(state, "lastBloomSourceItemId", {
    configurable: true,
    enumerable: true,
    get: () => getLastBloomSourceItemId(state),
    set: (value: string | null) => {
      setLastBloomSourceItemId(state, value);
    },
  });
  Object.defineProperty(state, "lastBloomedUnitIds", {
    configurable: true,
    enumerable: true,
    get: () => getLastBloomedUnitIds(state),
    set: (value: EntityId[]) => {
      getBloomResolutionState(state).lastBloomedUnitIds = value;
    },
  });
}

registerMechanicStateInitializer(BLOOM_MECHANIC_ID, (state) => {
  getBloomTurnState(state);
  getBloomResolutionState(state);
});

registerMechanicStateMigrator(BLOOM_MECHANIC_ID, (state) => {
  const legacyState = state as GameState & {
    bloomedUnitIdsThisTurn?: EntityId[];
    lastBloomSourceItemId?: string | null;
    lastBloomedUnitIds?: EntityId[];
  };

  getBloomTurnState(state).bloomedUnitIdsThisTurn = Array.isArray(legacyState.bloomedUnitIdsThisTurn)
    ? legacyState.bloomedUnitIdsThisTurn
    : [];
  getBloomResolutionState(state).lastSourceItemId =
    typeof legacyState.lastBloomSourceItemId === "undefined" ? null : legacyState.lastBloomSourceItemId;
  getBloomResolutionState(state).lastBloomedUnitIds = Array.isArray(legacyState.lastBloomedUnitIds)
    ? legacyState.lastBloomedUnitIds
    : [];
});

registerMechanicTurnResetHook(BLOOM_MECHANIC_ID, resetBloomTurnState);
