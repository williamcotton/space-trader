import { dispatchCommand } from "../../actions/reducers";
import type { GameCommand } from "../../actions/commands";
import type { GameState } from "../../model/state";
import { getAutoFlowCommand } from "../../turn/autoFlow";

const AUTO_FLOW_GUARD = 64;

export function cloneGameState(state: Readonly<GameState>): GameState {
  return structuredClone(state);
}

export function advanceToDecisionPoint(state: GameState): boolean {
  let guard = 0;

  while (guard < AUTO_FLOW_GUARD) {
    const command = getAutoFlowCommand(state);
    if (!command) {
      return true;
    }

    const result = dispatchCommand(state, command);
    if (!result.ok) {
      return false;
    }

    guard += 1;
  }

  return false;
}

export function applyCommandSequence(state: GameState, commands: readonly GameCommand[]): boolean {
  for (const command of commands) {
    const result = dispatchCommand(state, command);
    if (!result.ok) {
      return false;
    }
  }

  return advanceToDecisionPoint(state);
}
