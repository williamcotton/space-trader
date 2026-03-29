import type { GameState } from "../model/state";

export type MechanicStateInitializer = (state: GameState) => void;
export type MechanicStateMigrator = (state: GameState) => void;
export type MechanicTurnResetHook = (state: GameState) => void;

const mechanicStateInitializers = new Map<string, MechanicStateInitializer>();
const mechanicStateMigrators = new Map<string, MechanicStateMigrator>();
const mechanicTurnResetHooks = new Map<string, MechanicTurnResetHook>();

export function registerMechanicStateInitializer(id: string, initializer: MechanicStateInitializer): void {
  mechanicStateInitializers.set(id, initializer);
}

export function registerMechanicStateMigrator(id: string, migrator: MechanicStateMigrator): void {
  mechanicStateMigrators.set(id, migrator);
}

export function registerMechanicTurnResetHook(id: string, hook: MechanicTurnResetHook): void {
  mechanicTurnResetHooks.set(id, hook);
}

export function initializeRegisteredMechanicState(state: GameState): void {
  for (const initializer of mechanicStateInitializers.values()) {
    initializer(state);
  }
}

export function migrateRegisteredMechanicState(state: GameState): void {
  for (const migrator of mechanicStateMigrators.values()) {
    migrator(state);
  }
}

export function resetRegisteredTurnMechanicState(state: GameState): void {
  for (const hook of mechanicTurnResetHooks.values()) {
    hook(state);
  }
}
