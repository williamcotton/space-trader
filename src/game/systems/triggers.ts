import type { GameEvent } from "../actions/events";
import { getCardDefinition, type AutoTargetStrategy, type UnitCardDefinition, type UnitTrigger } from "../content/cards/catalog";
import { getStackEffectDefinition, getStackEffectMagnitude } from "../content/stackEffects";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import { createStackItemId, getOpponentPlayer } from "../turn/stack";

function resolveAutoTarget(
  state: GameState,
  controllerId: PlayerId,
  strategy: AutoTargetStrategy,
  preferredTargetId: string | null
): string | null {
  switch (strategy) {
    case "weakest_enemy_unit": {
      const preferredTarget = preferredTargetId ? state.entities[preferredTargetId] : null;
      if (preferredTarget && preferredTarget.kind === "unit" && preferredTarget.ownerId !== controllerId) {
        return preferredTarget.id;
      }

      const enemyUnits = Object.values(state.entities)
        .filter((entity): entity is Extract<GameState["entities"][string], { kind: "unit" }> => entity.kind === "unit" && entity.ownerId !== controllerId)
        .sort((a, b) => {
          const damagedDelta = Number(a.hp < a.maxHp) - Number(b.hp < b.maxHp);
          if (damagedDelta !== 0) {
            return damagedDelta > 0 ? -1 : 1;
          }
          if (a.hp !== b.hp) {
            return a.hp - b.hp;
          }
          return a.id.localeCompare(b.id);
        });

      return enemyUnits[0]?.id ?? null;
    }
  }
}

export type TriggerContext = {
  preferredTargetId: string | null;
  idOffset: number;
};

export function evaluateTriggers(
  state: GameState,
  playerId: PlayerId,
  triggerEvent: UnitTrigger["event"],
  context: TriggerContext
): GameEvent[] {
  const triggeredUnits = Object.values(state.entities)
    .filter((entity): entity is Extract<GameState["entities"][string], { kind: "unit" }> => {
      if (entity.kind !== "unit" || entity.ownerId !== playerId || !entity.sourceCardId) {
        return false;
      }
      const card = getCardDefinition(entity.sourceCardId);
      return card?.kind === "unit" && card.trigger?.event === triggerEvent;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const events: GameEvent[] = [];
  for (const [index, unit] of triggeredUnits.entries()) {
    const card = getCardDefinition(unit.sourceCardId!) as UnitCardDefinition;
    const trigger = card.trigger!;
    const effectDefinition = getStackEffectDefinition(trigger.effectId);
    if (!effectDefinition) {
      continue;
    }

    const targetEntityId = resolveAutoTarget(state, playerId, trigger.autoTarget, context.preferredTargetId);
    if (!targetEntityId) {
      continue;
    }

    events.push({
      type: "STACK_ITEM_PUSHED",
      playerId,
      itemId: createStackItemId(state.turn, state.log.length + context.idOffset + index),
      label: `${unit.name} ${trigger.labelSuffix}`,
      controllerId: playerId,
      ownerId: playerId,
      effectId: trigger.effectId,
      effectMagnitude: getStackEffectMagnitude(trigger.effectId),
      targetStackItemId: null,
      targetEntityId,
      objectKind: effectDefinition.object.kind,
      counterable: effectDefinition.object.counterable,
      defaultCounterDestination: effectDefinition.object.defaultCounterDestination,
      sourceCardInstanceId: null,
      sourceCardId: null,
      sourceCardOwnerId: null,
      nextPriorityPlayerId: getOpponentPlayer(playerId),
      pendingUnitEntityId: null,
    });
  }

  return events;
}
