import type { GameCommand } from "../commands";
import type { GameEvent } from "../events";
import type { GameState } from "../../model/state";
import type { PlayerId } from "../../model/ids";
import { getOpponentPlayer, peekTopStackItem } from "../../turn/stack";
import { advancePhase } from "../../turn/phaseMachine";
import { resolveEconomyDeposits } from "../../systems/harvesting";
import { resolveEndPhaseNodeControl } from "../../systems/nodeControl";
import { trackTacticalHarvestOpportunity } from "./combat";
import { drawCardForPlayer } from "./cards";

function seedTacticalHarvestOpportunities(state: GameState, playerId: PlayerId): void {
  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "unit" || entity.ownerId !== playerId) {
      continue;
    }
    trackTacticalHarvestOpportunity(state, entity.id);
  }
}

export function handleAdvancePhase(
  state: GameState,
  _command: Extract<GameCommand, { type: "ADVANCE_PHASE" }> | Extract<GameCommand, { type: "END_PHASE" }>
): GameEvent[] {
  return [
    {
      type: "PHASE_ADVANCED",
      activePlayerId: state.activePlayerId,
      turn: state.turn,
      phase: state.phase,
    },
  ];
}

export function handlePassPriority(
  state: GameState,
  command: Extract<GameCommand, { type: "PASS_PRIORITY" }>
): GameEvent[] {
  const nextPasses = state.consecutivePriorityPasses + 1;
  if (nextPasses < 2) {
    return [
      {
        type: "PRIORITY_PASSED",
        playerId: command.playerId,
        nextPriorityPlayerId: getOpponentPlayer(command.playerId),
        consecutivePasses: nextPasses,
      },
    ];
  }

  const events: GameEvent[] = [
    {
      type: "PRIORITY_PASSED",
      playerId: command.playerId,
      nextPriorityPlayerId: state.activePlayerId,
      consecutivePasses: 0,
    },
  ];

  const topItem = peekTopStackItem(state.stack);
  if (topItem) {
    events.push({
      type: "STACK_ITEM_RESOLVED",
      itemId: topItem.id,
      label: topItem.label,
      controllerId: topItem.controllerId,
      ownerId: topItem.ownerId,
      effectId: topItem.effectId,
      effectMagnitude: topItem.effectMagnitude,
      targetStackItemId: topItem.targetStackItemId,
      targetEntityId: topItem.targetEntityId,
      objectKind: topItem.objectKind,
      counterable: topItem.counterable,
      defaultCounterDestination: topItem.defaultCounterDestination,
      sourceCardInstanceId: topItem.sourceCardInstanceId,
      sourceCardId: topItem.sourceCardId,
      sourceCardOwnerId: topItem.sourceCardOwnerId,
      pendingUnitEntityId: topItem.pendingUnitEntityId,
    });
  }

  return events;
}

export function reducePhaseAdvanced(
  state: GameState,
  _event: Extract<GameEvent, { type: "PHASE_ADVANCED" }>
): void {
  const previousPhase = state.phase;
  const previousActivePlayer = state.activePlayerId;
  if (previousPhase === "start") {
    resolveEconomyDeposits(state, previousActivePlayer);
  }
  if (previousPhase === "end") {
    resolveEndPhaseNodeControl(state, previousActivePlayer);
  }
  advancePhase(state);
  if (state.phase === "start") {
    drawCardForPlayer(state, state.activePlayerId, "start_phase_draw");
  } else if (state.phase === "tactical") {
    seedTacticalHarvestOpportunities(state, state.activePlayerId);
  }
}

export function reducePriorityPassed(
  state: GameState,
  event: Extract<GameEvent, { type: "PRIORITY_PASSED" }>
): void {
  state.consecutivePriorityPasses = event.consecutivePasses;
  state.priorityPlayerId = event.nextPriorityPlayerId;
  state.log.push({
    turn: state.turn,
    text: `${event.playerId} passed priority.`,
  });
}
