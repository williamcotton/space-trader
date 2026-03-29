import type { GameEvent } from "../actions/events";
import type { GameState, UnitEntity } from "../model/state";
import type { TriggerCondition } from "../systems/triggerEngine";

export type TriggerConditionEvaluator = (
  state: GameState,
  event: GameEvent,
  condition: TriggerCondition,
  unit: UnitEntity
) => boolean;

const triggerConditionEvaluators = new Map<string, TriggerConditionEvaluator>();

export function registerTriggerConditionEvaluator(
  type: string,
  evaluator: TriggerConditionEvaluator
): void {
  triggerConditionEvaluators.set(type, evaluator);
}

export function getTriggerConditionEvaluator(
  type: string
): TriggerConditionEvaluator | undefined {
  return triggerConditionEvaluators.get(type);
}
