import type { GameEvent } from "../actions/events";
import { getCardCascadeUnitBuffConfig, getCardDefinition, getResolvedCardPlayEffectConfigs, type CardAnimationAccent } from "../content/cards/catalog";
import { getStackEffectDefinition } from "../content/stackEffects";
import "../presentation";
import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, HexCoord } from "../model/state";
import type { CanvasAnimation } from "../types";
import { getCascadeAffectedHexes } from "../systems/cascade";
import { getMapAxialBounds, hexDistance, isWithinMapBounds } from "../model/hex";
import { getFactionAnimationAccent } from "../registries/presentation";
import { getStackResolveAnimationBuilder, registerStackResolveAnimationBuilder } from "../registries/stackResolveAnimations";

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

function getCardAnimationAccent(sourceCardId: string | null): CardAnimationAccent {
  const sourceCard = sourceCardId ? getCardDefinition(sourceCardId) : undefined;
  return getFactionAnimationAccent(sourceCard?.faction);
}

function getMapCenterHex(state: GameState): HexCoord {
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

function getAffectedUnitHexes(
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

function getLiveUnitHexes(
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

function getUniqueHexes(coords: readonly HexCoord[]): HexCoord[] {
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

function getDestroyedUnitHexes(
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

registerStackResolveAnimationBuilder("counter", ({ event, before, state, baseId, behavior }) => {
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
    returnToHand: behavior.destination === "hand",
  };
});

registerStackResolveAnimationBuilder("deploy_unit", ({ event, state, baseId }) => {
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
});

registerStackResolveAnimationBuilder("damage_entity", ({ event, before, state, baseId, behavior }) => {
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
    amount: behavior.amount,
    label: event.label,
  };
});

registerStackResolveAnimationBuilder("destroy_entity", ({ event, before, state, baseId }) => {
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
});

registerStackResolveAnimationBuilder("modify_unit_until_end_of_turn", ({ event, before, state, baseId, behavior }) => {
  const targetId = event.targetEntityId;
  if (!targetId) {
    return null;
  }
  const target = before.entities[targetId] ?? state.entities[targetId];
  if (!target) {
    return null;
  }

  const buffLabelParts: string[] = [];
  if (behavior.attackBonus !== 0) {
    buffLabelParts.push(`${behavior.attackBonus > 0 ? "+" : ""}${behavior.attackBonus} ATK`);
  }
  if (behavior.armorBonus !== 0) {
    buffLabelParts.push(`${behavior.armorBonus > 0 ? "+" : ""}${behavior.armorBonus} ARM`);
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
});

registerStackResolveAnimationBuilder("cascade_unit_buff", ({ event, state, baseId, sourceCard, behavior }) =>
  buildHexShowerAnimation(
    event,
    state,
    baseId,
    event.label,
    getCardCascadeUnitBuffConfig(sourceCard)?.waves ?? behavior.waves,
    getCardAnimationAccent(event.sourceCardId)
  )
);

registerStackResolveAnimationBuilder("hex_area_damage", ({ event, state, baseId, sourceCard }) => {
  if (!event.targetHex) {
    return null;
  }

  const effectConfigs = getResolvedCardPlayEffectConfigs(sourceCard, Boolean(event.surgeActive))
    .filter((effectConfig) => effectConfig.type === "hex_area_damage");
  if (effectConfigs.length === 0) {
    return null;
  }

  return {
    id: baseId,
    kind: "hex_shower",
    playerId: event.controllerId,
    ageSeconds: 0,
    durationSeconds: 1,
    origin: event.targetHex,
    hexes: getUniqueHexes(effectConfigs.flatMap((effectConfig) => getRadiusAffectedHexes(state, event.targetHex as HexCoord, effectConfig.radius))),
    label: event.label,
    accent: getCardAnimationAccent(event.sourceCardId),
  };
});

registerStackResolveAnimationBuilder("damage_enemy_base", ({ event, state, baseId, behavior }) => {
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
    damage: behavior.amount,
  };
});

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
  if (cardResolveAnimation?.kind === "board_blast") {
    const effectConfigs = getResolvedCardPlayEffectConfigs(sourceCard, Boolean(event.surgeActive));
    const controllerBase = state.entities[state.players[event.controllerId].baseEntityId];
    const affectedHexes = getUniqueHexes(effectConfigs.flatMap((effectConfig) =>
      effectConfig.type === "mass_damage"
        ? getAffectedUnitHexes(before, event.controllerId, effectConfig.relation)
        : effectConfig.type === "global_unit_buff"
          ? getLiveUnitHexes(state, event.controllerId, effectConfig.relation, effectConfig.roleFilter)
          : effectConfig.type === "destroy_damaged_units"
            ? getDestroyedUnitHexes(before, state, event.controllerId, effectConfig.relation)
            : effectConfig.type === "draw_and_gain_resources"
              ? controllerBase && controllerBase.kind === "base"
                ? [controllerBase.coord]
                : []
              : effectConfig.type === "resources_by_unit_count"
                ? getLiveUnitHexes(state, event.controllerId, effectConfig.relation, effectConfig.roleFilter)
                : []
    ));

    if (affectedHexes.length > 0) {
      return {
        id: baseId,
        kind: "board_blast",
        playerId: event.controllerId,
        ageSeconds: 0,
        durationSeconds: 1.15,
        center:
          effectConfigs.some((effectConfig) => effectConfig.type === "mass_damage" || effectConfig.type === "destroy_damaged_units")
            ? getMapCenterHex(state)
            : controllerBase && controllerBase.kind === "base"
              ? controllerBase.coord
              : getMapCenterHex(state),
        hexes: affectedHexes,
        label: cardResolveAnimation.label,
        accent: cardResolveAnimation.accent,
      };
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
