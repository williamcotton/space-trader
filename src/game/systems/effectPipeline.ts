import type { EntityId } from "../model/ids";
import { hexDistance } from "../model/hex";
import type { GameState, UnitEntity } from "../model/state";
import { getRegisteredUnitStatAdjustments } from "../registries/unitStatHooks";
import type { ContinuousEffect } from "./continuousEffects";

export type UnitStatName =
  | "attackDamage"
  | "armor"
  | "siegeDamageBonus"
  | "moveRange"
  | "attackRange"
  | "hp"
  | "maxHp";

export type EffectiveUnitStats = Record<UnitStatName, number>;

export type ResolvedUnitSnapshot = {
  stats: EffectiveUnitStats;
  keywords: string[];
};

export type ContinuousEffectSnapshot = {
  stats: Map<EntityId, EffectiveUnitStats>;
  keywords: Map<EntityId, string[]>;
};

export type EffectResolver = {
  getStats(unit: Readonly<UnitEntity>): EffectiveUnitStats;
  getKeywords(
    unit: Readonly<UnitEntity>,
    options?: {
      excludeEffectIdPrefix?: string;
    }
  ): string[];
};

type BuildResolvedUnitSnapshotOptions = {
  excludeEffectIdPrefix?: string;
};

export const UNIT_STAT_NAMES: readonly UnitStatName[] = [
  "attackDamage",
  "armor",
  "siegeDamageBonus",
  "moveRange",
  "attackRange",
  "hp",
  "maxHp",
] as const;

function createBaseStats(unit: Readonly<UnitEntity>): EffectiveUnitStats {
  return {
    attackDamage: unit.attackDamage,
    armor: unit.armor,
    siegeDamageBonus: unit.siegeDamageBonus,
    moveRange: unit.moveRange,
    attackRange: unit.attackRange,
    hp: unit.hp,
    maxHp: unit.maxHp,
  };
}

export function doesEffectApplyToEntity(
  state: Readonly<GameState>,
  effect: Readonly<ContinuousEffect>,
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

function getApplicablePipelineEffects(
  state: Readonly<GameState>,
  unit: Readonly<UnitEntity>,
  options?: BuildResolvedUnitSnapshotOptions
): ContinuousEffect[] {
  return state.continuousEffects
    .filter((effect) => doesEffectApplyToEntity(state, effect, unit.id))
    .filter((effect) => effect.payload.type !== "replacement_effect")
    .filter((effect) => !options?.excludeEffectIdPrefix || !effect.id.startsWith(options.excludeEffectIdPrefix))
    .sort((a, b) => a.layer - b.layer || a.timestamp - b.timestamp);
}

function buildResolvedKeywords(unit: Readonly<UnitEntity>, effects: readonly ContinuousEffect[]): string[] {
  const keywords = [...(unit.keywords ?? [])];
  for (const effect of effects) {
    if (effect.payload.type !== "keyword_grant" || keywords.includes(effect.payload.keyword)) {
      continue;
    }
    keywords.push(effect.payload.keyword);
  }
  return keywords;
}

function buildResolvedStats(
  state: Readonly<GameState>,
  unit: Readonly<UnitEntity>,
  effects: readonly ContinuousEffect[],
  keywords: readonly string[]
): EffectiveUnitStats {
  const stats = createBaseStats(unit);

  for (const effect of effects) {
    if (effect.payload.type === "stat_modifier") {
      stats[effect.payload.stat] += effect.payload.amount;
    } else if (effect.payload.type === "stat_set") {
      stats[effect.payload.stat] = effect.payload.value;
    }
  }

  for (const stat of UNIT_STAT_NAMES) {
    stats[stat] += getRegisteredUnitStatAdjustments(state, unit, stat, { keywords });
  }

  stats.moveRange = Math.max(0, stats.moveRange);
  stats.attackRange = Math.max(0, stats.attackRange);

  return stats;
}

export function buildResolvedUnitSnapshot(
  state: Readonly<GameState>,
  unit: Readonly<UnitEntity>,
  options?: BuildResolvedUnitSnapshotOptions
): ResolvedUnitSnapshot {
  const effects = getApplicablePipelineEffects(state, unit, options);
  const keywords = buildResolvedKeywords(unit, effects);
  const stats = buildResolvedStats(state, unit, effects, keywords);
  return { stats, keywords };
}

export function createEffectResolver(state: Readonly<GameState>): EffectResolver {
  const snapshotCache = new Map<EntityId, ResolvedUnitSnapshot>();

  function getSnapshot(unit: Readonly<UnitEntity>): ResolvedUnitSnapshot {
    const cached = snapshotCache.get(unit.id);
    if (cached) {
      return cached;
    }

    const snapshot = buildResolvedUnitSnapshot(state, unit);
    snapshotCache.set(unit.id, snapshot);
    return snapshot;
  }

  return {
    getStats(unit) {
      return getSnapshot(unit).stats;
    },
    getKeywords(unit, options) {
      if (options?.excludeEffectIdPrefix) {
        return buildResolvedUnitSnapshot(state, unit, options).keywords;
      }
      return getSnapshot(unit).keywords;
    },
  };
}

export function buildContinuousEffectSnapshot(
  state: Readonly<GameState>
): ContinuousEffectSnapshot {
  const resolver = createEffectResolver(state);
  const stats = new Map<EntityId, EffectiveUnitStats>();
  const keywords = new Map<EntityId, string[]>();

  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "unit") {
      continue;
    }

    stats.set(entity.id, { ...resolver.getStats(entity) });
    keywords.set(entity.id, [...resolver.getKeywords(entity)]);
  }

  return { stats, keywords };
}
