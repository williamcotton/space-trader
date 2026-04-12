import type { EntityId, PlayerId } from "../model/ids";
import type { UnitRole } from "../model/enums";
import type { GameState, UnitEntity } from "../model/state";
import type { ReplacementEffectPayload } from "./replacementEngine";
import {
  buildResolvedUnitSnapshot,
  doesEffectApplyToEntity,
  type ContinuousEffectSnapshot,
  type EffectResolver,
  type UnitStatName,
} from "./effectPipeline";

// --- Layer constants (MTG-inspired ordering) ---

export const LAYER = {
  BASE: 0,
  TYPE: 1,
  ABILITY: 2,
  STATIC: 3,
  TEMPORARY: 4,
  COUNTER: 5,
} as const;

// --- Effect payload types ---

export type StatModifier = {
  type: "stat_modifier";
  stat: UnitStatName;
  amount: number;
};

export type StatSetter = {
  type: "stat_set";
  stat: UnitStatName;
  value: number;
};

export type KeywordGrant = {
  type: "keyword_grant";
  keyword: string;
};

export type ContinuousEffectPayload = StatModifier | StatSetter | KeywordGrant | ReplacementEffectPayload;

// --- Expiry conditions (all serializable) ---

export type EffectExpiry =
  | { type: "end_of_turn"; turn: number }
  | { type: "start_of_turn"; turn: number }
  | { type: "while_source_alive"; sourceEntityId: EntityId }
  | { type: "permanent" }
  | { type: "until_used"; usesRemaining: number };

// --- Target filters ---

export type EffectTargetFilter =
  | { type: "specific_entity"; entityId: EntityId }
  | { type: "adjacent_allies"; sourceEntityId: EntityId; roleFilter?: UnitRole }
  | { type: "all_friendly_units"; ownerId: PlayerId }
  | { type: "all_enemy_units"; ownerId: PlayerId };

// --- ContinuousEffect ---

export type ContinuousEffect = {
  id: string;
  sourceEntityId: EntityId | null;
  sourceCardId: string | null;
  controllerId: PlayerId;
  payload: ContinuousEffectPayload;
  target: EffectTargetFilter;
  expiry: EffectExpiry;
  layer: number;
  timestamp: number;
};

// --- ID generation ---

export function createContinuousEffectId(state: GameState, suffix: string): string {
  const id = `ce_${state.effectTimestampCounter}_${suffix}`;
  return id;
}

export function nextEffectTimestamp(state: GameState): number {
  state.effectTimestampCounter += 1;
  return state.effectTimestampCounter;
}

// --- Selectors ---

export { doesEffectApplyToEntity } from "./effectPipeline";

export function getActiveEffectsForEntity(
  state: Readonly<GameState>,
  entityId: EntityId
): ContinuousEffect[] {
  return state.continuousEffects.filter((effect) =>
    doesEffectApplyToEntity(state, effect, entityId)
  );
}

export function getEffectiveKeywordsForUnit(
  state: Readonly<GameState>,
  unit: UnitEntity,
  options?: {
    excludeEffectIdPrefix?: string;
    resolver?: EffectResolver;
  }
): string[] {
  if (options?.resolver) {
    return [...options.resolver.getKeywords(unit, { excludeEffectIdPrefix: options.excludeEffectIdPrefix })];
  }

  return [
    ...buildResolvedUnitSnapshot(state, unit, {
      excludeEffectIdPrefix: options?.excludeEffectIdPrefix,
    }).keywords,
  ];
}

export function getEffectiveStatValue(
  state: Readonly<GameState>,
  unit: UnitEntity,
  stat: UnitStatName,
  options?: {
    resolver?: EffectResolver;
  }
): number {
  if (options?.resolver) {
    return options.resolver.getStats(unit)[stat];
  }

  return buildResolvedUnitSnapshot(state, unit).stats[stat];
}

export function getEffectiveStatValueFromSnapshot(
  snapshot: ContinuousEffectSnapshot,
  unit: Readonly<UnitEntity>,
  stat: UnitStatName
): number {
  return snapshot.stats.get(unit.id)?.[stat] ?? unit[stat];
}

export function getEffectiveKeywordsForUnitFromSnapshot(
  snapshot: ContinuousEffectSnapshot,
  unit: Readonly<UnitEntity>
): string[] {
  return [...(snapshot.keywords.get(unit.id) ?? unit.keywords ?? [])];
}

// --- Expiry & cleanup ---

function isEffectExpired(state: GameState, effect: ContinuousEffect): boolean {
  switch (effect.expiry.type) {
    case "end_of_turn":
      return state.turn >= effect.expiry.turn;

    case "start_of_turn":
      return state.turn >= effect.expiry.turn;

    case "while_source_alive":
      return !state.entities[effect.expiry.sourceEntityId];

    case "permanent":
      return false;

    case "until_used":
      return effect.expiry.usesRemaining <= 0;
  }
}

export function purgeExpiredEffects(state: GameState): void {
  state.continuousEffects = state.continuousEffects.filter(
    (effect) => !isEffectExpired(state, effect)
  );
}

export function removeEffectsForEntity(
  state: GameState,
  entityId: EntityId
): void {
  state.continuousEffects = state.continuousEffects.filter((effect) => {
    if (effect.sourceEntityId === entityId) return false;
    if (
      effect.target.type === "specific_entity" &&
      effect.target.entityId === entityId
    ) {
      return false;
    }
    return true;
  });
}
