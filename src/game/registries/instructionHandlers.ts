import type { GameInstruction } from "../actions/instructions";
import type { GameState } from "../model/state";

export type InstructionHandler<K extends GameInstruction["type"] = GameInstruction["type"]> = (
  state: GameState,
  instruction: Extract<GameInstruction, { type: K }>
) => void;

const instructionHandlers = new Map<GameInstruction["type"], InstructionHandler>();

export function registerInstructionHandler<K extends GameInstruction["type"]>(
  type: K,
  handler: InstructionHandler<K>
): void {
  instructionHandlers.set(type, handler as unknown as InstructionHandler);
}

export function getInstructionHandler(type: GameInstruction["type"]): InstructionHandler | undefined {
  return instructionHandlers.get(type);
}
