import type { GameState } from "../model/state";

export type DebugStackResponseDefinition = {
  id: string;
  label: string;
  effectId: string;
  getTargetStackItemId?: (state: Readonly<GameState>) => string | null;
};

const debugStackResponses = new Map<string, DebugStackResponseDefinition>();

export function registerDebugStackResponse(definition: DebugStackResponseDefinition): void {
  debugStackResponses.set(definition.id, definition);
}

export function getDebugStackResponse(id: string): DebugStackResponseDefinition | undefined {
  return debugStackResponses.get(id);
}

export function resetDebugStackResponseRegistry(): void {
  debugStackResponses.clear();
}
