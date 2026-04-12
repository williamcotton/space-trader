import { describe, expect, it } from "vitest";
import { requireMapDefinition } from "../content/maps/catalog";
import { BASTION_KEYWORD } from "../content/sets/alpha/mechanics/keywordIds";
import { createInitialGameState, type GameState, type UnitEntity } from "../model/state";
import {
  LAYER,
  getEffectiveKeywordsForUnit,
  getEffectiveStatValue,
} from "./continuousEffects";
import {
  buildContinuousEffectSnapshot,
  buildResolvedUnitSnapshot,
  createEffectResolver,
} from "./effectPipeline";

function createState(): GameState {
  return createInitialGameState({ map: requireMapDefinition("frontier_belt") });
}

function getUnit(state: GameState, id: string): UnitEntity {
  const entity = state.entities[id];
  if (!entity || entity.kind !== "unit") {
    throw new Error(`Expected unit ${id}.`);
  }
  return entity;
}

describe("effectPipeline", () => {
  it("returns printed stats and keywords when no effects exist", () => {
    const state = createState();
    const unit = getUnit(state, "unit_player_1_scout");

    const snapshot = buildResolvedUnitSnapshot(state, unit);

    expect(snapshot.stats.attackDamage).toBe(unit.attackDamage);
    expect(snapshot.stats.armor).toBe(unit.armor);
    expect(snapshot.keywords).toEqual(unit.keywords ?? []);
  });

  it("applies granted keywords and stat modifiers", () => {
    const state = createState();
    const unit = getUnit(state, "unit_player_1_scout");

    state.continuousEffects.push(
      {
        id: "kw_relay",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "keyword_grant", keyword: "relay" },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.ABILITY,
        timestamp: 1,
      },
      {
        id: "armor_plus_two",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 2 },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: 2,
      }
    );

    const snapshot = buildResolvedUnitSnapshot(state, unit);

    expect(snapshot.keywords).toContain("relay");
    expect(snapshot.stats.armor).toBe(unit.armor + 2);
  });

  it("orders effects by timestamp within a layer", () => {
    const state = createState();
    const unit = getUnit(state, "unit_player_1_scout");

    state.continuousEffects.push(
      {
        id: "set_first",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_set", stat: "attackDamage", value: 2 },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: 1,
      },
      {
        id: "set_second",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_set", stat: "attackDamage", value: 5 },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: 2,
      }
    );

    expect(buildResolvedUnitSnapshot(state, unit).stats.attackDamage).toBe(5);
  });

  it("respects authored layer order across stat effects", () => {
    const state = createState();
    const unit = getUnit(state, "unit_player_1_scout");

    state.continuousEffects.push(
      {
        id: "static_set",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_set", stat: "attackDamage", value: 2 },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.STATIC,
        timestamp: 1,
      },
      {
        id: "temporary_plus_four",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "attackDamage", amount: 4 },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: 2,
      },
      {
        id: "counter_minus_one",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "attackDamage", amount: -1 },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.COUNTER,
        timestamp: 3,
      }
    );

    expect(buildResolvedUnitSnapshot(state, unit).stats.attackDamage).toBe(5);
  });

  it("applies adjacent ally effects through the same pipeline", () => {
    const state = createState();
    const scout = getUnit(state, "unit_player_1_scout");
    const harvester = getUnit(state, "unit_player_1_harvester");
    harvester.coord = { q: scout.coord.q + 1, r: scout.coord.r };

    state.continuousEffects.push({
      id: "adjacent_aura",
      sourceEntityId: harvester.id,
      sourceCardId: null,
      controllerId: "player_1",
      payload: { type: "stat_modifier", stat: "attackDamage", amount: 1 },
      target: { type: "adjacent_allies", sourceEntityId: harvester.id, roleFilter: "combat" },
      expiry: { type: "permanent" },
      layer: LAYER.STATIC,
      timestamp: 1,
    });

    expect(buildResolvedUnitSnapshot(state, scout).stats.attackDamage).toBe(scout.attackDamage + 1);
  });

  it("clamps move and attack range to zero or greater", () => {
    const state = createState();
    const unit = getUnit(state, "unit_player_1_scout");

    state.continuousEffects.push(
      {
        id: "move_set_negative",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_set", stat: "moveRange", value: -4 },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.STATIC,
        timestamp: 1,
      },
      {
        id: "range_set_negative",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_set", stat: "attackRange", value: -1 },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.STATIC,
        timestamp: 2,
      }
    );

    const snapshot = buildResolvedUnitSnapshot(state, unit);
    expect(snapshot.stats.moveRange).toBe(0);
    expect(snapshot.stats.attackRange).toBe(0);
  });

  it("lets stat hooks see resolved keywords from the pipeline", () => {
    const state = createState();
    const scout = getUnit(state, "unit_player_1_scout");
    const harvester = getUnit(state, "unit_player_1_harvester");
    harvester.coord = { q: scout.coord.q + 1, r: scout.coord.r };

    state.continuousEffects.push({
      id: "grant_bastion",
      sourceEntityId: null,
      sourceCardId: null,
      controllerId: "player_1",
      payload: { type: "keyword_grant", keyword: BASTION_KEYWORD },
      target: { type: "specific_entity", entityId: scout.id },
      expiry: { type: "permanent" },
      layer: LAYER.ABILITY,
      timestamp: 1,
    });

    expect(buildResolvedUnitSnapshot(state, scout).stats.armor).toBe(scout.armor + 1);
  });

  it("excludes replacement effects from the stat and keyword pipeline", () => {
    const state = createState();
    const unit = getUnit(state, "unit_player_1_scout");

    state.continuousEffects.push({
      id: "replacement_only",
      sourceEntityId: null,
      sourceCardId: null,
      controllerId: "player_1",
      payload: {
        type: "replacement_effect",
        replaces: { type: "damage_to_entity", entityId: unit.id },
        replacement: { type: "prevent" },
      },
      target: { type: "specific_entity", entityId: unit.id },
      expiry: { type: "permanent" },
      layer: LAYER.STATIC,
      timestamp: 1,
    });

    const snapshot = buildResolvedUnitSnapshot(state, unit);
    expect(snapshot.stats.attackDamage).toBe(unit.attackDamage);
    expect(snapshot.keywords).toEqual(unit.keywords ?? []);
  });

  it("matches the legacy public stat and keyword getters", () => {
    const state = createState();
    const unit = getUnit(state, "unit_player_1_scout");

    state.continuousEffects.push(
      {
        id: "relay_grant",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "keyword_grant", keyword: "relay" },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.ABILITY,
        timestamp: 1,
      },
      {
        id: "armor_plus_three",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 3 },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: 2,
      }
    );

    const snapshot = buildResolvedUnitSnapshot(state, unit);
    expect(snapshot.stats.armor).toBe(getEffectiveStatValue(state, unit, "armor"));
    expect(snapshot.keywords).toEqual(getEffectiveKeywordsForUnit(state, unit));
  });

  it("builds a board snapshot that matches per-unit getters and resolver reads", () => {
    const state = createState();
    const scout = getUnit(state, "unit_player_1_scout");
    const resolver = createEffectResolver(state);

    state.continuousEffects.push({
      id: "scout_attack_bonus",
      sourceEntityId: null,
      sourceCardId: null,
      controllerId: "player_1",
      payload: { type: "stat_modifier", stat: "attackDamage", amount: 2 },
      target: { type: "specific_entity", entityId: scout.id },
      expiry: { type: "permanent" },
      layer: LAYER.TEMPORARY,
      timestamp: 1,
    });

    const boardSnapshot = buildContinuousEffectSnapshot(state);

    for (const entity of Object.values(state.entities)) {
      if (entity.kind !== "unit") {
        continue;
      }

      expect(boardSnapshot.stats.get(entity.id)?.attackDamage).toBe(getEffectiveStatValue(state, entity, "attackDamage"));
      expect(boardSnapshot.keywords.get(entity.id) ?? []).toEqual(getEffectiveKeywordsForUnit(state, entity));
      expect(resolver.getStats(entity).attackDamage).toBe(getEffectiveStatValue(state, entity, "attackDamage"));
      expect(resolver.getKeywords(entity)).toEqual(getEffectiveKeywordsForUnit(state, entity));
    }
  });
});
