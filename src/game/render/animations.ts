import type { GameEvent } from "../actions/events";
import { getCardCascadeUnitBuffConfig, getCardDefinition, getCardPlayEffectConfig, type CardAnimationAccent } from "../content/cards/catalog";
import { getStackEffectDefinition } from "../content/stackEffects";
import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, HexCoord } from "../model/state";
import type { CanvasAnimation } from "../types";
import { getCascadeAffectedHexes } from "../systems/cascade";
import { getMapAxialBounds, hexDistance, isWithinMapBounds } from "../model/hex";

type EntitySnapshot = {
  kind: EntityState["kind"];
  ownerId: PlayerId;
  coord: HexCoord;
};

type StackItemSnapshot = {
  id: string;
  label: string;
  controllerId: PlayerId;
  effectId: string;
  sourceCardId: string | null;
  targetStackItemId: string | null;
};

export type AnimationCapture = {
  entities: Record<string, EntitySnapshot>;
  stackItems: Record<string, StackItemSnapshot>;
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

  const stackItems = Object.fromEntries(
    state.stack.map((item) => [
      item.id,
      {
        id: item.id,
        label: item.label,
        controllerId: item.controllerId,
          effectId: item.effectId,
          sourceCardId: item.sourceCardId,
          targetStackItemId: item.targetStackItemId,
        } satisfies StackItemSnapshot,
    ])
  );

  return { entities, stackItems };
}

function getStackAnimationVisual(effectId: string, sourceCardId: string | null): "unit" | "counter" | "tactic" | "generic" {
  const sourceCard = sourceCardId ? getCardDefinition(sourceCardId) : undefined;
  if (sourceCard?.kind === "unit" || effectId === "deploy_unit_card") {
    return "unit";
  }

  const effect = getStackEffectDefinition(effectId);
  if (effect?.behavior.type === "counter") {
    return "counter";
  }

  if (sourceCard?.kind === "tactic" || effect?.object.kind === "spell") {
    return "tactic";
  }

  return "generic";
}

function buildHexShowerAnimation(
  event: Extract<GameEvent, { type: "STACK_ITEM_RESOLVED" }>,
  state: GameState,
  baseId: string,
  label: string,
  waves: number,
  accent: "alloy" | "flux" | "biomass" | "neutral"
): CanvasAnimation | null {
  if (!event.targetHex) {
    return null;
  }

  return {
    id: baseId,
    kind: "hex_shower",
    playerId: event.controllerId,
    ageSeconds: 0,
    durationSeconds: 1.05,
    origin: event.targetHex,
    hexes: getCascadeAffectedHexes(state, event.controllerId, event.targetHex, waves),
    label,
    accent,
  };
}

function getCardAnimationAccent(sourceCardId: string | null): CardAnimationAccent {
  const sourceCard = sourceCardId ? getCardDefinition(sourceCardId) : undefined;
  switch (sourceCard?.faction) {
    case "alloy_clan":
      return "alloy";
    case "flux_collective":
      return "flux";
    case "biomass_swarm":
      return "biomass";
    default:
      return "neutral";
  }
}

function getRadiusAffectedHexes(state: GameState, origin: HexCoord, radius: number): HexCoord[] {
  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  const hexes: HexCoord[] = [];
  for (let q = qMin; q <= qMax; q += 1) {
    for (let r = rMin; r <= rMax; r += 1) {
      const coord = { q, r };
      if (isWithinMapBounds(coord, state.map) && hexDistance(coord, origin) <= radius) {
        hexes.push(coord);
      }
    }
  }
  return hexes;
}

function buildStackResolutionAnimation(
  event: Extract<GameEvent, { type: "STACK_ITEM_RESOLVED" }>,
  before: AnimationCapture,
  state: GameState,
  baseId: string
): CanvasAnimation | null {
  const sourceCard = event.sourceCardId ? getCardDefinition(event.sourceCardId) : undefined;
  const cardResolveAnimation = sourceCard?.animation?.resolve;
  if (cardResolveAnimation?.kind === "hex_shower") {
    const customAnimation = buildHexShowerAnimation(
      event,
      state,
      baseId,
      cardResolveAnimation.label,
      cardResolveAnimation.waves,
      cardResolveAnimation.accent
    );
    if (customAnimation) {
      return customAnimation;
    }
  }

  const definition = getStackEffectDefinition(event.effectId);

  if (definition?.behavior.type === "counter") {
    const sourceBase = state.entities[state.players[event.controllerId].baseEntityId];
    const targetItem = event.targetStackItemId ? before.stackItems[event.targetStackItemId] : undefined;
    if (!sourceBase || sourceBase.kind !== "base" || !targetItem) {
      return null;
    }

    return {
      id: baseId,
      kind: "stack_counter",
      playerId: event.controllerId,
      ageSeconds: 0,
      durationSeconds: 0.88,
      from: sourceBase.coord,
      label: event.label,
      targetLabel: targetItem.label,
      targetVisual: getStackAnimationVisual(targetItem.effectId, targetItem.sourceCardId),
      returnToHand: definition.behavior.destination === "hand",
    };
  }

  if (definition?.behavior.type === "deploy_unit") {
    if (!event.pendingUnitEntityId) {
      return null;
    }

    const resolvedUnit = state.entities[event.pendingUnitEntityId];
    if (!resolvedUnit || resolvedUnit.kind !== "unit") {
      return null;
    }

    return {
      id: baseId,
      kind: "deploy",
      playerId: resolvedUnit.ownerId,
      ageSeconds: 0,
      durationSeconds: 0.66,
      coord: resolvedUnit.coord,
    };
  }

  if (definition?.behavior.type === "damage_entity") {
    const targetId = event.targetEntityId;
    if (!targetId) {
      return null;
    }
    const target = before.entities[targetId] ?? state.entities[targetId];
    if (!target) {
      return null;
    }

    return {
      id: baseId,
      kind: "spell_resolve",
      playerId: event.controllerId,
      ageSeconds: 0,
      durationSeconds: 0.78,
      coord: target.coord,
      visual: target.kind === "base" ? "base_damage" : "damage",
      amount: definition.behavior.amount,
      label: event.label,
    };
  }

  if (definition?.behavior.type === "destroy_entity") {
    const targetId = event.targetEntityId;
    if (!targetId) {
      return null;
    }
    const target = before.entities[targetId] ?? state.entities[targetId];
    if (!target) {
      return null;
    }

    return {
      id: baseId,
      kind: "spell_resolve",
      playerId: event.controllerId,
      ageSeconds: 0,
      durationSeconds: 0.84,
      coord: target.coord,
      visual: "destroy",
      label: event.label,
    };
  }

  if (definition?.behavior.type === "modify_unit_until_end_of_turn") {
    const targetId = event.targetEntityId;
    if (!targetId) {
      return null;
    }
    const target = before.entities[targetId] ?? state.entities[targetId];
    if (!target) {
      return null;
    }

    const buffLabelParts: string[] = [];
    if (definition.behavior.attackBonus !== 0) {
      buffLabelParts.push(`${definition.behavior.attackBonus > 0 ? "+" : ""}${definition.behavior.attackBonus} ATK`);
    }
    if (definition.behavior.armorBonus !== 0) {
      buffLabelParts.push(`${definition.behavior.armorBonus > 0 ? "+" : ""}${definition.behavior.armorBonus} ARM`);
    }

    return {
      id: baseId,
      kind: "spell_resolve",
      playerId: event.controllerId,
      ageSeconds: 0,
      durationSeconds: 0.86,
      coord: target.coord,
      visual: "buff",
      label: buffLabelParts.join(" · ") || event.label,
    };
  }

  if (definition?.behavior.type === "cascade_unit_buff") {
    const cascadeConfig = getCardCascadeUnitBuffConfig(sourceCard);
    return buildHexShowerAnimation(
      event,
      state,
      baseId,
      event.label,
      cascadeConfig?.waves ?? definition.behavior.waves,
      getCardAnimationAccent(event.sourceCardId)
    );
  }

  if (definition?.behavior.type === "hex_area_damage" && event.targetHex) {
    const effectConfig = getCardPlayEffectConfig(sourceCard);
    if (effectConfig?.type !== "hex_area_damage") {
      return null;
    }

    return {
      id: baseId,
      kind: "hex_shower",
      playerId: event.controllerId,
      ageSeconds: 0,
      durationSeconds: 1,
      origin: event.targetHex,
      hexes: getRadiusAffectedHexes(state, event.targetHex, effectConfig.radius),
      label: event.label,
      accent: getCardAnimationAccent(event.sourceCardId),
    };
  }

  if (definition?.behavior.type === "damage_enemy_base") {
    const targetPlayerId = event.controllerId === "player_1" ? "player_2" : "player_1";
    const targetBase = state.entities[state.players[targetPlayerId].baseEntityId];
    if (!targetBase || targetBase.kind !== "base") {
      return null;
    }

    return {
      id: baseId,
      kind: "base_hit",
      playerId: targetPlayerId,
      ageSeconds: 0,
      durationSeconds: 0.7,
      coord: targetBase.coord,
      damage: definition.behavior.amount,
    };
  }

  return null;
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
      case "STACK_ITEM_PUSHED": {
        const sourceBase = state.entities[state.players[event.playerId].baseEntityId];
        if (!sourceBase || sourceBase.kind !== "base") {
          break;
        }

        animations.push({
          id: baseId,
          kind: "stack_cast",
          playerId: event.playerId,
          ageSeconds: 0,
          durationSeconds: 0.72,
          from: sourceBase.coord,
          label: event.label,
          visual: getStackAnimationVisual(event.effectId, event.sourceCardId),
        });
        break;
      }
      case "CARD_PLAYED_TO_STACK": {
        const sourceBase = state.entities[state.players[event.playerId].baseEntityId];
        if (!sourceBase || sourceBase.kind !== "base") {
          break;
        }

        animations.push({
          id: baseId,
          kind: "stack_cast",
          playerId: event.playerId,
          ageSeconds: 0,
          durationSeconds: 0.72,
          from: sourceBase.coord,
          label: event.cardName,
          visual: getStackAnimationVisual(event.effectId, event.cardId),
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
        const animation = buildStackResolutionAnimation(event, before, state, baseId);
        if (animation) {
          animations.push(animation);
        }
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
