import type { GameEvent, StackItemPushedEvent } from "../actions/events";
import { getCardCascadeUnitBuffConfig, getCardDefinition } from "../content/cards/catalog";
import { getStackEffectDefinition, getStackEffectMagnitude } from "../content/stackEffects";
import type { GamePhase } from "../model/enums";
import type { PlayerId } from "../model/ids";
import type { GameState, UnitEntity } from "../model/state";
import { canTargetEntityDirectly } from "./keywords";
import { hexDistance } from "../model/hex";
import { getCascadeAffectedHexes } from "./cascade";
import { createStackItemId, getOpponentPlayer } from "../turn/stack";

// --- Trigger Condition Types ---

export type TriggerCondition =
  | { type: "on_owner_tactic_played" }
  | { type: "on_cascaded" }
  | { type: "on_enter_battlefield" }
  | { type: "on_death"; whose: "self" | "any_friendly" | "any_enemy" | "any" }
  | { type: "on_damage_dealt"; whose: "self" | "any_friendly" }
  | { type: "at_start_of_phase"; phase: GamePhase }
  | { type: "at_end_of_turn" };

export type AutoTargetStrategy = "weakest_enemy_unit" | "weakest_enemy_unit_in_range_2";

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
  switch (strategy) {
    case "weakest_enemy_unit": {
      const preferredTarget = preferredTargetId ? state.entities[preferredTargetId] : null;
      if (
        preferredTarget &&
        preferredTarget.kind === "unit" &&
        preferredTarget.ownerId !== controllerId &&
        canTargetEntityDirectly(state, controllerId, preferredTarget)
      ) {
        return preferredTarget.id;
      }

      const enemyUnits = Object.values(state.entities)
        .filter((entity): entity is UnitEntity =>
          entity.kind === "unit" &&
          entity.ownerId !== controllerId &&
          canTargetEntityDirectly(state, controllerId, entity)
        )
        .sort((a, b) => {
          const damagedDelta = Number(a.hp < a.maxHp) - Number(b.hp < b.maxHp);
          if (damagedDelta !== 0) return damagedDelta > 0 ? -1 : 1;
          if (a.hp !== b.hp) return a.hp - b.hp;
          return a.id.localeCompare(b.id);
        });

      return enemyUnits[0]?.id ?? null;
    }

    case "weakest_enemy_unit_in_range_2": {
      if (!sourceUnit) {
        return null;
      }

      const preferredTarget = preferredTargetId ? state.entities[preferredTargetId] : null;
      if (
        preferredTarget &&
        preferredTarget.kind === "unit" &&
        preferredTarget.ownerId !== controllerId &&
        canTargetEntityDirectly(state, controllerId, preferredTarget) &&
        hexDistance(sourceUnit.coord, preferredTarget.coord) <= 2
      ) {
        return preferredTarget.id;
      }

      const enemyUnits = Object.values(state.entities)
        .filter((entity): entity is UnitEntity =>
          entity.kind === "unit" &&
          entity.ownerId !== controllerId &&
          canTargetEntityDirectly(state, controllerId, entity) &&
          hexDistance(sourceUnit.coord, entity.coord) <= 2
        )
        .sort((a, b) => {
          const damagedDelta = Number(a.hp < a.maxHp) - Number(b.hp < b.maxHp);
          if (damagedDelta !== 0) return damagedDelta > 0 ? -1 : 1;
          if (a.hp !== b.hp) return a.hp - b.hp;
          return a.id.localeCompare(b.id);
        });

      return enemyUnits[0]?.id ?? null;
    }
  }
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
  switch (condition.type) {
    case "on_owner_tactic_played":
      if (event.type !== "CARD_PLAYED_TO_STACK" || event.playerId !== unit.ownerId) {
        return false;
      }
      return getCardDefinition(event.cardId)?.kind === "tactic";

    case "on_cascaded": {
      if (event.type !== "STACK_ITEM_RESOLVED" || event.controllerId !== unit.ownerId || !event.targetHex || !event.sourceCardId) {
        return false;
      }

      const sourceCard = getCardDefinition(event.sourceCardId);
      const cascadeConfig = getCardCascadeUnitBuffConfig(sourceCard);
      if (!cascadeConfig) {
        return false;
      }

      const affectedHexes = getCascadeAffectedHexes(state, event.controllerId, event.targetHex, cascadeConfig.waves, {
        excludeKeywordEffectIdPrefix: `ce_${event.itemId}_`,
      });
      return affectedHexes.some((coord) => coord.q === unit.coord.q && coord.r === unit.coord.r);
    }

    case "on_enter_battlefield":
      return event.type === "CARD_PLAYED_TO_BATTLEFIELD";

    case "on_death":
      // Will be triggered by future ENTITY_DESTROYED events
      return false;

    case "on_damage_dealt":
      return false;

    case "at_start_of_phase":
      return event.type === "PHASE_ADVANCED" && event.phase === condition.phase;

    case "at_end_of_turn":
      return false;

    default:
      return false;
  }
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
        surgeActive: false,
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
