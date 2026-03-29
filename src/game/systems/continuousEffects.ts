import type { EntityId, PlayerId } from "../model/ids";
import type { UnitRole } from "../model/enums";
import type { GameState, UnitEntity } from "../model/state";
import { hexDistance } from "../model/hex";
import type { ReplacementEffectPayload } from "./replacementEngine";
import { getRegisteredUnitStatAdjustments } from "../registries/unitStatHooks";

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
  stat: "attackDamage" | "armor" | "siegeDamageBonus" | "moveRange" | "attackRange" | "hp" | "maxHp";
  amount: number;
};

export type KeywordGrant = {
  type: "keyword_grant";
  keyword: string;
};

export type ContinuousEffectPayload = StatModifier | KeywordGrant | ReplacementEffectPayload;

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

function doesEffectApplyToEntity(
  state: Readonly<GameState>,
  effect: ContinuousEffect,
  entityId: EntityId
): boolean {
  const target = effect.target;

  switch (target.type) {
    case "specific_entity":
      return target.entityId === entityId;

    case "adjacent_allies": {
      const sourceEntity = state.entities[target.sourceEntityId];
      const targetEntity = state.entities[entityId];
      if (!sourceEntity || !targetEntity) return false;
      if (sourceEntity.id === entityId) return false;
      if (targetEntity.kind !== "unit") return false;
      if (sourceEntity.ownerId !== targetEntity.ownerId) return false;
      if (target.roleFilter && targetEntity.role !== target.roleFilter) return false;
      return hexDistance(sourceEntity.coord, targetEntity.coord) === 1;
    }

    case "all_friendly_units": {
      const entity = state.entities[entityId];
      if (!entity || entity.kind !== "unit") return false;
      return entity.ownerId === target.ownerId;
    }

    case "all_enemy_units": {
      const entity = state.entities[entityId];
      if (!entity || entity.kind !== "unit") return false;
      return entity.ownerId !== target.ownerId;
    }
  }
}

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
  }
): string[] {
  const baseKeywords = unit.keywords ?? [];
  const grantedKeywords = getActiveEffectsForEntity(state, unit.id)
    .filter((effect) => !options?.excludeEffectIdPrefix || !effect.id.startsWith(options.excludeEffectIdPrefix))
    .flatMap((effect) => effect.payload.type === "keyword_grant" ? [effect.payload.keyword] : []);

  return [...new Set([...baseKeywords, ...grantedKeywords])];
}

export function getEffectiveStatValue(
  state: Readonly<GameState>,
  unit: UnitEntity,
  stat: "attackDamage" | "armor" | "siegeDamageBonus"
): number {
  const base = unit[stat];

  const effects = getActiveEffectsForEntity(state, unit.id)
    .filter(
      (e) => e.payload.type === "stat_modifier" && e.payload.stat === stat
    )
    .sort((a, b) => a.layer - b.layer || a.timestamp - b.timestamp);

  let value = effects.reduce((value, effect) => {
    if (effect.payload.type === "stat_modifier") {
      return value + effect.payload.amount;
    }
    return value;
  }, base);

  value += getRegisteredUnitStatAdjustments(state, unit, stat);

  return value;
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
