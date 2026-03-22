import type { GameCommand } from "../commands";
import type { GameEvent } from "../events";
import type { GameState } from "../../model/state";

export function handleSelectEntity(
  _state: GameState,
  command: Extract<GameCommand, { type: "SELECT_ENTITY" }>
): GameEvent[] {
  return [
    {
      type: "ENTITY_SELECTED",
      playerId: command.playerId,
      entityId: command.entityId,
    },
  ];
}

export function handleClearSelection(
  state: GameState,
  command: Extract<GameCommand, { type: "CLEAR_SELECTION" }>
): GameEvent[] {
  return [
    {
      type: "SELECTION_CLEARED",
      playerId: command.playerId,
      previousEntityId: state.selectedEntityId,
      reason: command.reason,
    },
  ];
}

export function reduceEntitySelected(
  state: GameState,
  event: Extract<GameEvent, { type: "ENTITY_SELECTED" }>
): void {
  state.selectedEntityId = event.entityId;
  state.log.push({
    turn: state.turn,
    text: `${event.playerId} selected ${event.entityId}.`,
  });
}

export function reduceSelectionCleared(
  state: GameState,
  event: Extract<GameEvent, { type: "SELECTION_CLEARED" }>
): void {
  state.selectedEntityId = null;
  state.log.push({
    turn: state.turn,
    text: `${event.playerId} cleared selection (${event.reason}) from ${event.previousEntityId ?? "none"}.`,
  });
}
