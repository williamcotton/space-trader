import type { GameState } from "../model/state";

export type MechanicStateScope = keyof GameState["mechanicState"];

export function ensureMechanicStateNamespace<T>(
  state: GameState,
  scope: MechanicStateScope,
  mechanicId: string,
  createDefault: () => T
): T {
  const existing = state.mechanicState[scope][mechanicId];
  if (existing) {
    return existing as T;
  }

  const created = createDefault();
  state.mechanicState[scope][mechanicId] = created;
  return created;
}
