import type { GamePhase } from "../model/enums";
import type { GameState } from "../model/state";
import type { PlayerId } from "../model/ids";

const PHASE_SEQUENCE: GamePhase[] = ["start", "economy", "main", "tactical", "end"];

function getNextActivePlayer(playerId: PlayerId): PlayerId {
  return playerId === "player_1" ? "player_2" : "player_1";
}

export function getNextPhase(currentPhase: GamePhase): GamePhase {
  const phaseIndex = PHASE_SEQUENCE.indexOf(currentPhase);
  if (phaseIndex < 0 || phaseIndex === PHASE_SEQUENCE.length - 1) {
    return PHASE_SEQUENCE[0];
  }

  return PHASE_SEQUENCE[phaseIndex + 1];
}

export function advancePhase(state: GameState): void {
  const movingToNewTurn = state.phase === "end";
  const previousPhase = state.phase;

  if (movingToNewTurn) {
    state.turn += 1;
    state.activePlayerId = getNextActivePlayer(state.activePlayerId);
  }

  state.phase = getNextPhase(previousPhase);
  state.priorityPlayerId = state.activePlayerId;

  state.log.push({
    turn: state.turn,
    text: `Phase advanced to ${state.phase} (${state.activePlayerId}).`,
  });
}
