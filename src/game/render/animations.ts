import type { GameEvent } from "../actions/events";
import { getStackEffectDefinition } from "../content/stackEffects";
import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, HexCoord } from "../model/state";
import type { CanvasAnimation } from "../types";

type EntitySnapshot = {
  kind: EntityState["kind"];
  ownerId: PlayerId;
  coord: HexCoord;
};

export type AnimationCapture = {
  entities: Record<string, EntitySnapshot>;
};

export function captureAnimationSnapshot(state: GameState): AnimationCapture {
  const entities = Object.fromEntries(
    Object.values(state.entities).map((entity) => [
      entity.id,
      {
        kind: entity.kind,
        ownerId: entity.ownerId,
        coord: { ...entity.coord },
      } satisfies EntitySnapshot,
    ])
  );

  return { entities };
}

export function buildAnimationsFromEvents(events: GameEvent[], before: AnimationCapture, state: GameState): CanvasAnimation[] {
  const animations: CanvasAnimation[] = [];

  for (const [index, event] of events.entries()) {
    const baseId = `${event.type}_${state.turn}_${state.log.length}_${index}`;

    switch (event.type) {
      case "UNIT_MOVED":
        animations.push({
          id: baseId,
          kind: "move",
          playerId: event.playerId,
          ageSeconds: 0,
          durationSeconds: 0.36,
          from: event.from,
          to: event.to,
        });
        break;
      case "UNIT_ATTACK_DECLARED": {
        const attacker = before.entities[event.attackerId];
        const target = before.entities[event.targetId];
        if (!attacker || !target) {
          break;
        }

        animations.push({
          id: baseId,
          kind: "attack",
          playerId: event.playerId,
          ageSeconds: 0,
          durationSeconds: 0.42,
          from: attacker.coord,
          to: target.coord,
          damage: event.damageDealt,
          targetDestroyed: event.targetDestroyed,
        });
        break;
      }
      case "UNIT_HARVESTED_NODE": {
        const unit = before.entities[event.entityId] ?? state.entities[event.entityId];
        if (!unit) {
          break;
        }

        animations.push({
          id: baseId,
          kind: "harvest",
          playerId: event.playerId,
          ageSeconds: 0,
          durationSeconds: 0.6,
          coord: unit.coord,
          resourceType: event.resourceType,
        });
        break;
      }
      case "CARD_PLAYED_TO_BATTLEFIELD":
        animations.push({
          id: baseId,
          kind: "deploy",
          playerId: event.playerId,
          ageSeconds: 0,
          durationSeconds: 0.66,
          coord: event.spawnCoord,
        });
        break;
      case "STACK_ITEM_RESOLVED": {
        const definition = getStackEffectDefinition(event.effectId);
        if (definition?.resolution.type === "deploy_unit") {
          if (!event.pendingUnitEntityId) {
            break;
          }

          const resolvedUnit = state.entities[event.pendingUnitEntityId];
          if (!resolvedUnit || resolvedUnit.kind !== "unit") {
            break;
          }

          animations.push({
            id: baseId,
            kind: "deploy",
            playerId: resolvedUnit.ownerId,
            ageSeconds: 0,
            durationSeconds: 0.66,
            coord: resolvedUnit.coord,
          });
          break;
        }

        if (definition?.resolution.type !== "damage_enemy_base") {
          break;
        }

        const targetPlayerId = event.controllerId === "player_1" ? "player_2" : "player_1";
        const targetBase = state.entities[state.players[targetPlayerId].baseEntityId];
        if (!targetBase || targetBase.kind !== "base") {
          break;
        }

        animations.push({
          id: baseId,
          kind: "base_hit",
          playerId: targetPlayerId,
          ageSeconds: 0,
          durationSeconds: 0.7,
          coord: targetBase.coord,
          damage: definition.resolution.amount,
        });
        break;
      }
      default:
        break;
    }
  }

  return animations;
}

export function stepAnimations(animations: CanvasAnimation[], deltaSeconds: number): CanvasAnimation[] {
  return animations
    .map((animation) => ({
      ...animation,
      ageSeconds: animation.ageSeconds + deltaSeconds,
    }))
    .filter((animation) => animation.ageSeconds < animation.durationSeconds);
}
