import type { GameCommand } from "./commands";
import type { GameEvent } from "./events";
import { validateCommand } from "../rules/validators";
import { syncPlayerZoneCounts, type GameState } from "../model/state";
import { resolveBaseHpVictory } from "../systems/victory";
import { evaluateTriggersFromEvent, resetTriggerDepth, incrementTriggerDepth, decrementTriggerDepth } from "../systems/triggerEngine";
import { handleAdvancePhase, handlePassPriority, reducePhaseAdvanced, reducePriorityPassed } from "./handlers/phase";
import { handleSelectEntity, handleClearSelection, reduceEntitySelected, reduceSelectionCleared } from "./handlers/selection";
import { handleMoveUnit, handleAttackUnit, handleHarvestNode, reduceUnitMoved, reduceUnitAttackDeclared, reduceUnitHarvestedNode } from "./handlers/combat";
import {
  handleRespondStack, handlePlayCard, handleDiscardCard,
  reduceCardPlayedToStack, reduceCardPlayedToBattlefield, reduceCardDiscarded, reduceStackItemPushed, reduceStackItemResolved,
} from "./handlers/cards";

export type DispatchResult =
  | {
      ok: true;
      events: GameEvent[];
    }
  | {
      ok: false;
      reason: string;
      events: [];
    };

function createEventsFromCommand(state: GameState, command: GameCommand): GameEvent[] {
  switch (command.type) {
    case "ADVANCE_PHASE":
      return handleAdvancePhase(state, command);
    case "END_PHASE":
    case "PASS_PRIORITY":
      return handlePassPriority(state, command);
    case "RESPOND_STACK":
      return handleRespondStack(state, command);
    case "SELECT_ENTITY":
      return handleSelectEntity(state, command);
    case "CLEAR_SELECTION":
      return handleClearSelection(state, command);
    case "MOVE_UNIT":
      return handleMoveUnit(state, command);
    case "ATTACK_UNIT":
      return handleAttackUnit(state, command);
    case "HARVEST_NODE":
      return handleHarvestNode(state, command);
    case "PLAY_CARD":
      return handlePlayCard(state, command);
    case "DISCARD_CARD":
      return handleDiscardCard(state, command);
    default:
      return [];
  }
}

function reduceEvent(state: GameState, event: GameEvent): void {
  switch (event.type) {
    case "PHASE_ADVANCED":
      return reducePhaseAdvanced(state, event);
    case "ENTITY_SELECTED":
      return reduceEntitySelected(state, event);
    case "SELECTION_CLEARED":
      return reduceSelectionCleared(state, event);
    case "PRIORITY_PASSED":
      return reducePriorityPassed(state, event);
    case "STACK_ITEM_PUSHED":
      return reduceStackItemPushed(state, event);
    case "STACK_ITEM_RESOLVED":
      return reduceStackItemResolved(state, event);
    case "CARD_PLAYED_TO_STACK":
      return reduceCardPlayedToStack(state, event);
    case "CARD_PLAYED_TO_BATTLEFIELD":
      return reduceCardPlayedToBattlefield(state, event);
    case "CARD_DISCARDED":
      return reduceCardDiscarded(state, event);
    case "UNIT_MOVED":
      return reduceUnitMoved(state, event);
    case "UNIT_ATTACK_DECLARED":
      return reduceUnitAttackDeclared(state, event);
    case "UNIT_HARVESTED_NODE":
      return reduceUnitHarvestedNode(state, event);
    default:
      return;
  }
}

export function dispatchCommand(state: GameState, command: GameCommand): DispatchResult {
  const validation = validateCommand(state, command);
  if (!validation.ok) {
    const reason = validation.reason ?? "Command rejected.";
    state.lastRejectedReason = reason;
    state.log.push({
      turn: state.turn,
      text: `Rejected ${command.type}: ${reason}`,
    });
    return {
      ok: false,
      reason,
      events: [],
    };
  }

  const events = createEventsFromCommand(state, command);
  const allEvents: GameEvent[] = [];

  resetTriggerDepth();
  for (const event of events) {
    reduceEvent(state, event);
    allEvents.push(event);

    // After each event, check for triggers
    incrementTriggerDepth();
    const triggeredEvents = evaluateTriggersFromEvent(state, event);
    for (const triggered of triggeredEvents) {
      reduceEvent(state, triggered);
      allEvents.push(triggered);
    }
    decrementTriggerDepth();
  }

  resolveBaseHpVictory(state);
  syncPlayerZoneCounts(state);
  state.lastRejectedReason = null;

  return {
    ok: true,
    events: allEvents,
  };
}
