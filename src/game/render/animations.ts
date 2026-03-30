import type { GameEvent } from "../actions/events";
import {
  getCardDefinition,
  type CardAnimationAccent,
} from "../content/cards/catalog";
import { getStackEffectDefinition } from "../content/stackEffects";
import "../presentation";
import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, HexCoord } from "../model/state";
import type { CanvasAnimation } from "../types";
import { getCascadeAffectedHexes } from "../systems/cascade";
import { getMapAxialBounds, hexDistance, isWithinMapBounds } from "../model/hex";
import { getFactionAnimationAccent } from "../registries/presentation";
import { getCardResolveAnimationBuilder } from "../registries/cardResolveAnimations";
import { getStackResolveAnimationBuilder } from "../registries/stackResolveAnimations";
import { buildRegisteredMechanicAnimations } from "../registries/mechanicAnimations";

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
  winner: PlayerId | null;
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

  return { entities, stackItems, winner: state.winner };
}

export function getStackAnimationVisual(effectId: string, sourceCardId: string | null): "unit" | "counter" | "tactic" | "generic" {
  const sourceCard = sourceCardId ? getCardDefinition(sourceCardId) : undefined;
  if (sourceCard?.kind === "unit") {
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

export function buildHexShowerAnimation(
  event: Extract<GameEvent, { type: "STACK_ITEM_RESOLVED" }>,
  state: GameState,
  baseId: string,
  label: string,
  waves: number,
  accent: string
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
    hexes: getCascadeAffectedHexes(state, event.controllerId, event.targetHex, waves, {
      excludeKeywordEffectIdPrefix: `ce_${event.itemId}_`,
    }),
    label,
    accent,
  };
}

function getRelationMatches(ownerId: PlayerId, controllerId: PlayerId, relation: "ally" | "enemy" | "any"): boolean {
  if (relation === "any") {
    return true;
  }

  return relation === "ally" ? ownerId === controllerId : ownerId !== controllerId;
}

export function getCardAnimationAccent(sourceCardId: string | null): CardAnimationAccent {
  const sourceCard = sourceCardId ? getCardDefinition(sourceCardId) : undefined;
  return getFactionAnimationAccent(sourceCard?.faction);
}

export function getMapCenterHex(state: GameState): HexCoord {
  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  const approximateCenter = {
    q: Math.round((qMin + qMax) / 2),
    r: Math.round((rMin + rMax) / 2),
  };

  if (isWithinMapBounds(approximateCenter, state.map)) {
    return approximateCenter;
  }

  let bestCoord: HexCoord | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let q = qMin; q <= qMax; q += 1) {
    for (let r = rMin; r <= rMax; r += 1) {
      const coord = { q, r };
      if (!isWithinMapBounds(coord, state.map)) {
        continue;
      }
      const distance = hexDistance(coord, approximateCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCoord = coord;
      }
    }
  }

  return bestCoord ?? approximateCenter;
}

export function getRadiusAffectedHexes(state: GameState, origin: HexCoord, radius: number): HexCoord[] {
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

export function getAffectedUnitHexes(
  before: AnimationCapture,
  controllerId: PlayerId,
  relation: "ally" | "enemy" | "any"
): HexCoord[] {
  const seen = new Set<string>();
  const hexes: HexCoord[] = [];
  for (const entity of Object.values(before.entities)) {
    if (entity.kind !== "unit" || !getRelationMatches(entity.ownerId, controllerId, relation)) {
      continue;
    }

    const key = `${entity.coord.q},${entity.coord.r}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hexes.push(entity.coord);
  }
  return hexes;
}

export function getLiveUnitHexes(
  state: GameState,
  controllerId: PlayerId,
  relation: "ally" | "enemy" | "any",
  roleFilter?: "combat" | "resource" | "utility"
): HexCoord[] {
  const seen = new Set<string>();
  const hexes: HexCoord[] = [];
  for (const entity of Object.values(state.entities)) {
    if (
      entity.kind !== "unit" ||
      !getRelationMatches(entity.ownerId, controllerId, relation) ||
      (roleFilter && entity.role !== roleFilter)
    ) {
      continue;
    }

    const key = `${entity.coord.q},${entity.coord.r}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hexes.push(entity.coord);
  }
  return hexes;
}

export function getUniqueHexes(coords: readonly HexCoord[]): HexCoord[] {
  const seen = new Set<string>();
  const unique: HexCoord[] = [];
  for (const coord of coords) {
    const key = `${coord.q},${coord.r}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(coord);
  }
  return unique;
}

function getVictoryHexes(state: GameState, winner: PlayerId): HexCoord[] {
  const winnerBaseId = state.players[winner].baseEntityId;
  const winnerBase = state.entities[winnerBaseId];
  const center = winnerBase && winnerBase.kind === "base" ? winnerBase.coord : getMapCenterHex(state);
  const highlighted = [
    ...getRadiusAffectedHexes(state, center, 3),
    ...Object.values(state.entities)
      .filter((entity) => entity.kind === "unit")
      .map((entity) => entity.coord),
  ];
  return getUniqueHexes(highlighted);
}

export function buildMatchIntroAnimation(state: GameState): CanvasAnimation {
  return {
    id: `MATCH_INTRO_${state.matchId}`,
    kind: "match_intro",
    playerId: state.activePlayerId,
    ageSeconds: 0,
    durationSeconds: 1.8,
    center: getMapCenterHex(state),
    label: state.map.name,
    subtitle: "Engage",
  };
}

export function buildVictoryAnimation(state: GameState, winner: PlayerId): CanvasAnimation {
  const winnerBaseId = state.players[winner].baseEntityId;
  const winnerBase = state.entities[winnerBaseId];
  const effectCenter = winnerBase && winnerBase.kind === "base" ? winnerBase.coord : getMapCenterHex(state);
  return {
    id: `VICTORY_${state.matchId}_${state.turn}_${winner}`,
    kind: "victory_fanfare",
    playerId: winner,
    ageSeconds: 0,
    durationSeconds: 2.2,
    center: effectCenter,
    textCenter: getMapCenterHex(state),
    hexes: getVictoryHexes(state, winner),
    label: winner === "player_1" ? "Player 1 Wins!" : "Player 2 Wins!",
  };
}

export function getDestroyedUnitHexes(
  before: AnimationCapture,
  state: GameState,
  controllerId: PlayerId,
  relation: "ally" | "enemy" | "any"
): HexCoord[] {
  const seen = new Set<string>();
  const hexes: HexCoord[] = [];
  for (const [entityId, entity] of Object.entries(before.entities)) {
    if (entity.kind !== "unit" || state.entities[entityId] || !getRelationMatches(entity.ownerId, controllerId, relation)) {
      continue;
    }

    const key = `${entity.coord.q},${entity.coord.r}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hexes.push(entity.coord);
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
  if (sourceCard && cardResolveAnimation) {
    const animationBuilder = getCardResolveAnimationBuilder(cardResolveAnimation.kind);
    const customAnimation = animationBuilder?.({
      event,
      before,
      state,
      baseId,
      sourceCard,
      profile: cardResolveAnimation,
    });
    if (customAnimation) {
      return customAnimation;
    }
  }

  const definition = getStackEffectDefinition(event.effectId);
  const builder = definition ? getStackResolveAnimationBuilder(definition.behavior.type) : null;
  return builder
    ? builder({
        event,
        before,
        state,
        baseId,
        sourceCard,
        behavior: definition!.behavior as never,
      })
    : null;
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

  const destroyedUnits = Object.entries(before.entities)
    .filter(([, entity]) => entity.kind === "unit")
    .filter(([entityId]) => !state.entities[entityId]);

  for (const [index, [, entity]] of destroyedUnits.entries()) {
    animations.push({
      id: `UNIT_DESTROYED_${state.turn}_${state.log.length}_${index}`,
      kind: "death_burst",
      playerId: entity.ownerId,
      ageSeconds: 0,
      durationSeconds: 0.72,
      coord: entity.coord,
    });
  }

  if (!before.winner && state.winner) {
    animations.push(buildVictoryAnimation(state, state.winner));
  }

  animations.push(...buildRegisteredMechanicAnimations(events, before, state));

  return animations;
}

export function stepAnimations(animations: CanvasAnimation[], deltaSeconds: number): CanvasAnimation[] {
  const result: CanvasAnimation[] = [];
  for (let i = 0; i < animations.length; i++) {
    const animation = animations[i];
    animation.ageSeconds += deltaSeconds;
    if (animation.ageSeconds < animation.durationSeconds) {
      result.push(animation);
    }
  }
  return result;
}
