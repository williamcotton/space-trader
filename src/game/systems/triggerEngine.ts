import type { GameEvent, StackItemPushedEvent } from "../actions/events";
import { getCardDefinition } from "../content/cards/catalog";
import { getStackEffectDefinition, getStackEffectMagnitude } from "../content/stackEffects";
import type { PlayerId } from "../model/ids";
import type { GameState, UnitEntity } from "../model/state";
import { createStackItemId, getOpponentPlayer } from "../turn/stack";
import { getAutoTargetResolver } from "../registries/autoTargets";
import { getTriggerConditionEvaluator } from "../registries/triggerConditions";

// --- Trigger Condition Types ---

export type TriggerCondition = {
  type: string;
  [key: string]: unknown;
};

export type AutoTargetStrategy = string;

export type CardTrigger = {
  condition: TriggerCondition;
  effectId: string;
  autoTarget?: AutoTargetStrategy;
  labelSuffix: string;
};

// --- Auto-target resolution ---

function resolveAutoTarget(
  state: GameState,
  controllerId: PlayerId,
  strategy: AutoTargetStrategy,
  preferredTargetId: string | null,
  sourceUnit?: UnitEntity
): string | null {
  const resolver = getAutoTargetResolver(strategy);
  return resolver ? resolver(state, controllerId, preferredTargetId, sourceUnit) : null;
}

// --- Event matching ---

function getTriggersForUnit(unit: UnitEntity): CardTrigger[] {
  if (!unit.sourceCardId) return [];
  const card = getCardDefinition(unit.sourceCardId);
  if (!card || card.kind !== "unit") return [];

  // New triggers array takes priority
  if (card.triggers && card.triggers.length > 0) {
    return card.triggers;
  }

  // Legacy singular trigger fallback
  if (card.trigger) {
    return [{
      condition: { type: card.trigger.event },
      effectId: card.trigger.effectId,
      autoTarget: card.trigger.autoTarget,
      labelSuffix: card.trigger.labelSuffix,
    }];
  }

  return [];
}

function doesEventMatchCondition(
  state: GameState,
  event: GameEvent,
  condition: TriggerCondition,
  unit: UnitEntity
): boolean {
  const evaluator = getTriggerConditionEvaluator(condition.type);
  return evaluator ? evaluator(state, event, condition, unit) : false;
}

function getPreferredTargetFromEvent(event: GameEvent): string | null {
  if (event.type === "CARD_PLAYED_TO_STACK") {
    return event.targetEntityId;
  }
  return null;
}

// --- Main trigger evaluation ---

const MAX_TRIGGER_DEPTH = 10;
let triggerDepth = 0;

export function evaluateTriggersFromEvent(
  state: GameState,
  event: GameEvent
): StackItemPushedEvent[] {
  if (triggerDepth >= MAX_TRIGGER_DEPTH) {
    state.log.push({
      turn: state.turn,
      text: "Trigger depth limit reached — suppressing further triggers.",
    });
    return [];
  }

  const triggeredEvents: StackItemPushedEvent[] = [];
  const preferredTargetId = getPreferredTargetFromEvent(event);

  const units = Object.values(state.entities)
    .filter((entity): entity is UnitEntity => entity.kind === "unit")
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const unit of units) {
      const triggers = getTriggersForUnit(unit);

    for (const trigger of triggers) {
      if (!doesEventMatchCondition(state, event, trigger.condition, unit)) {
        continue;
      }

      const effectDefinition = getStackEffectDefinition(trigger.effectId);
      if (!effectDefinition) continue;

      const targetEntityId = trigger.autoTarget
        ? resolveAutoTarget(state, unit.ownerId, trigger.autoTarget, preferredTargetId, unit)
        : null;

      if (trigger.autoTarget && !targetEntityId) {
        continue;
      }

      triggeredEvents.push({
        type: "STACK_ITEM_PUSHED",
        playerId: unit.ownerId,
        itemId: createStackItemId(state.turn, state.log.length + triggeredEvents.length),
        label: `${unit.name} ${trigger.labelSuffix}`,
        controllerId: unit.ownerId,
        ownerId: unit.ownerId,
        effectId: trigger.effectId,
        effectMagnitude: getStackEffectMagnitude(trigger.effectId),
        activeModifierIds: [],
        targetStackItemId: null,
        targetEntityId,
        objectKind: effectDefinition.object.kind,
        counterable: effectDefinition.object.counterable,
        defaultCounterDestination: effectDefinition.object.defaultCounterDestination,
        sourceCardInstanceId: null,
        sourceCardId: null,
        sourceCardOwnerId: null,
        nextPriorityPlayerId: getOpponentPlayer(unit.ownerId),
        pendingUnitEntityId: null,
      });
    }
  }

  return triggeredEvents;
}

export function resetTriggerDepth(): void {
  triggerDepth = 0;
}

export function incrementTriggerDepth(): void {
  triggerDepth++;
}

export function decrementTriggerDepth(): void {
  triggerDepth = Math.max(0, triggerDepth - 1);
}
