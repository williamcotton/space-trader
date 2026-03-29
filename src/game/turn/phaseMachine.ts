import type { GamePhase } from "../model/enums";
import { MAX_HAND_SIZE, type GameState } from "../model/state";
import type { PlayerId } from "../model/ids";
import { clearTemporaryUnitModifiers } from "../systems/unitStats";
import { resetTurnMechanicState } from "../mechanics";

const PHASE_SEQUENCE: GamePhase[] = ["start", "economy", "main", "tactical", "end", "discard"];

function getNextActivePlayer(playerId: PlayerId): PlayerId {
  return playerId === "player_1" ? "player_2" : "player_1";
}

function resetUnitActionBudgetsForPlayer(state: GameState, playerId: PlayerId): void {
  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "unit") {
      continue;
    }

    if (entity.ownerId !== playerId) {
      continue;
    }

    entity.movesRemaining = entity.moveRange;
    entity.attacksRemaining = entity.attackActionsPerTurn;
    entity.hasSummoningSickness = false;
  }
}

export function getNextPhase(currentPhase: GamePhase): GamePhase {
  const phaseIndex = PHASE_SEQUENCE.indexOf(currentPhase);
  if (phaseIndex < 0 || phaseIndex === PHASE_SEQUENCE.length - 1) {
    return PHASE_SEQUENCE[0];
  }

  return PHASE_SEQUENCE[phaseIndex + 1];
}

export function advancePhase(state: GameState): void {
  const previousPhase = state.phase;
  const requiresDiscard = previousPhase === "end" && state.zones[state.activePlayerId].hand.length > MAX_HAND_SIZE;
  const movingToNewTurn = previousPhase === "discard" || (previousPhase === "end" && !requiresDiscard);

  if (movingToNewTurn) {
    clearTemporaryUnitModifiers(state);
    state.turn += 1;
    state.activePlayerId = getNextActivePlayer(state.activePlayerId);
    resetTurnMechanicState(state);
    clearTemporaryUnitModifiers(state);
    resetUnitActionBudgetsForPlayer(state, state.activePlayerId);
  }

  if (requiresDiscard) {
    state.phase = "discard";
  } else if (movingToNewTurn) {
    state.phase = "start";
  } else {
    state.phase = getNextPhase(previousPhase);
  }
  state.priorityPlayerId = state.activePlayerId;
  state.consecutivePriorityPasses = 0;
  state.tacticalHarvestEligibleUnitIds = [];
  state.tacticalHarvestedUnitIds = [];

  state.log.push({
    turn: state.turn,
    text: `Phase advanced to ${state.phase} (${state.activePlayerId}).`,
  });
}
