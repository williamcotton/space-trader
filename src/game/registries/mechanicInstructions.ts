import type { GameState } from "../model/state";

export type MechanicInstructionHandler = (
  state: GameState,
  operation: string,
  payload: Record<string, unknown>
) => void;

const mechanicInstructionHandlers = new Map<string, MechanicInstructionHandler>();

export function registerMechanicInstructionHandler(mechanicId: string, handler: MechanicInstructionHandler): void {
  mechanicInstructionHandlers.set(mechanicId, handler);
}

export function getMechanicInstructionHandler(mechanicId: string): MechanicInstructionHandler | undefined {
  return mechanicInstructionHandlers.get(mechanicId);
}
