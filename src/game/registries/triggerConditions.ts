import type { GameEvent } from "../actions/events";
import type { GameState, UnitEntity } from "../model/state";
import type { TriggerCondition } from "../systems/triggerEngine";

export type TriggerConditionEvaluator<K extends TriggerCondition["type"] = TriggerCondition["type"]> = (
  state: GameState,
  event: GameEvent,
  condition: Extract<TriggerCondition, { type: K }>,
  unit: UnitEntity
) => boolean;

const triggerConditionEvaluators = new Map<TriggerCondition["type"], TriggerConditionEvaluator>();

export function registerTriggerConditionEvaluator<K extends TriggerCondition["type"]>(
  type: K,
  evaluator: TriggerConditionEvaluator<K>
): void {
  triggerConditionEvaluators.set(type, evaluator as unknown as TriggerConditionEvaluator);
}

export function getTriggerConditionEvaluator(
  type: TriggerCondition["type"]
): TriggerConditionEvaluator | undefined {
  return triggerConditionEvaluators.get(type);
}
