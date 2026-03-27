import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { createInitialGameState, type UnitEntity } from "../model/state";
import {
  LAYER,
  createContinuousEffectId,
  getActiveEffectsForEntity,
  getEffectiveStatValue,
  nextEffectTimestamp,
  purgeExpiredEffects,
  removeEffectsForEntity,
  type ContinuousEffect,
} from "./continuousEffects";

function createState() {
  return createInitialGameState({ map: FRONTIER_BELT_MAP });
}

function getUnit(state: ReturnType<typeof createState>, id: string): UnitEntity {
  const entity = state.entities[id];
  if (!entity || entity.kind !== "unit") throw new Error(`Expected unit: ${id}`);
  return entity;
}

describe("continuousEffects", () => {
  describe("getEffectiveStatValue", () => {
    it("returns base stat when no effects exist", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      expect(getEffectiveStatValue(state, unit, "attackDamage")).toBe(unit.attackDamage);
      expect(getEffectiveStatValue(state, unit, "armor")).toBe(unit.armor);
    });

    it("applies a specific_entity stat modifier", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      state.continuousEffects.push({
        id: "test_buff",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 3 },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: 1,
      });
      expect(getEffectiveStatValue(state, unit, "armor")).toBe(unit.armor + 3);
    });

    it("stacks multiple modifiers by layer then timestamp", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      state.continuousEffects.push(
        {
          id: "buff_1",
          sourceEntityId: null,
          sourceCardId: null,
          controllerId: "player_1",
          payload: { type: "stat_modifier", stat: "attackDamage", amount: 2 },
          target: { type: "specific_entity", entityId: unit.id },
          expiry: { type: "permanent" },
          layer: LAYER.TEMPORARY,
          timestamp: 2,
        },
        {
          id: "buff_2",
          sourceEntityId: null,
          sourceCardId: null,
          controllerId: "player_1",
          payload: { type: "stat_modifier", stat: "attackDamage", amount: 1 },
          target: { type: "specific_entity", entityId: unit.id },
          expiry: { type: "permanent" },
          layer: LAYER.STATIC,
          timestamp: 1,
        },
      );
      expect(getEffectiveStatValue(state, unit, "attackDamage")).toBe(unit.attackDamage + 3);
    });

    it("does not apply effects targeting a different entity", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      state.continuousEffects.push({
        id: "wrong_target",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 5 },
        target: { type: "specific_entity", entityId: "unit_player_2_scout" },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: 1,
      });
      expect(getEffectiveStatValue(state, unit, "armor")).toBe(unit.armor);
    });
  });

  describe("adjacent_allies targeting", () => {
    it("applies aura to adjacent allied unit of correct role", () => {
      const state = createState();
      const attacker = getUnit(state, "unit_player_1_scout");
      const auraSource = getUnit(state, "unit_player_1_harvester");
      auraSource.coord = { q: attacker.coord.q + 1, r: attacker.coord.r };
      auraSource.role = "utility";

      state.continuousEffects.push({
        id: "aura_atk",
        sourceEntityId: auraSource.id,
        sourceCardId: "forge_captain_card",
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "attackDamage", amount: 1 },
        target: { type: "adjacent_allies", sourceEntityId: auraSource.id, roleFilter: "combat" },
        expiry: { type: "while_source_alive", sourceEntityId: auraSource.id },
        layer: LAYER.STATIC,
        timestamp: 1,
      });

      expect(getEffectiveStatValue(state, attacker, "attackDamage")).toBe(attacker.attackDamage + 1);
    });

    it("does not apply aura to non-adjacent unit", () => {
      const state = createState();
      const attacker = getUnit(state, "unit_player_1_scout");
      const auraSource = getUnit(state, "unit_player_1_harvester");
      attacker.coord = { q: 0, r: 0 };
      auraSource.coord = { q: 5, r: 5 };

      state.continuousEffects.push({
        id: "aura_far",
        sourceEntityId: auraSource.id,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "attackDamage", amount: 1 },
        target: { type: "adjacent_allies", sourceEntityId: auraSource.id },
        expiry: { type: "while_source_alive", sourceEntityId: auraSource.id },
        layer: LAYER.STATIC,
        timestamp: 1,
      });

      expect(getEffectiveStatValue(state, attacker, "attackDamage")).toBe(attacker.attackDamage);
    });

    it("does not apply aura to the source unit itself", () => {
      const state = createState();
      const auraSource = getUnit(state, "unit_player_1_scout");

      state.continuousEffects.push({
        id: "self_aura",
        sourceEntityId: auraSource.id,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "attackDamage", amount: 1 },
        target: { type: "adjacent_allies", sourceEntityId: auraSource.id },
        expiry: { type: "while_source_alive", sourceEntityId: auraSource.id },
        layer: LAYER.STATIC,
        timestamp: 1,
      });

      expect(getEffectiveStatValue(state, auraSource, "attackDamage")).toBe(auraSource.attackDamage);
    });

    it("does not apply aura to enemy units", () => {
      const state = createState();
      const enemy = getUnit(state, "unit_player_2_scout");
      const auraSource = getUnit(state, "unit_player_1_scout");
      enemy.coord = { q: auraSource.coord.q + 1, r: auraSource.coord.r };

      state.continuousEffects.push({
        id: "enemy_aura",
        sourceEntityId: auraSource.id,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "attackDamage", amount: 1 },
        target: { type: "adjacent_allies", sourceEntityId: auraSource.id },
        expiry: { type: "while_source_alive", sourceEntityId: auraSource.id },
        layer: LAYER.STATIC,
        timestamp: 1,
      });

      expect(getEffectiveStatValue(state, enemy, "attackDamage")).toBe(enemy.attackDamage);
    });

    it("filters by role when roleFilter is set", () => {
      const state = createState();
      const harvester = getUnit(state, "unit_player_1_harvester");
      const auraSource = getUnit(state, "unit_player_1_scout");
      harvester.coord = { q: auraSource.coord.q + 1, r: auraSource.coord.r };

      state.continuousEffects.push({
        id: "role_aura",
        sourceEntityId: auraSource.id,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "attackDamage", amount: 1 },
        target: { type: "adjacent_allies", sourceEntityId: auraSource.id, roleFilter: "combat" },
        expiry: { type: "while_source_alive", sourceEntityId: auraSource.id },
        layer: LAYER.STATIC,
        timestamp: 1,
      });

      expect(getEffectiveStatValue(state, harvester, "attackDamage")).toBe(harvester.attackDamage);
    });
  });

  describe("purgeExpiredEffects", () => {
    it("removes end_of_turn effects when turn matches", () => {
      const state = createState();
      state.continuousEffects.push({
        id: "eot",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 2 },
        target: { type: "specific_entity", entityId: "unit_player_1_scout" },
        expiry: { type: "end_of_turn", turn: 1 },
        layer: LAYER.TEMPORARY,
        timestamp: 1,
      });

      expect(state.continuousEffects).toHaveLength(1);
      purgeExpiredEffects(state);
      expect(state.continuousEffects).toHaveLength(0);
    });

    it("keeps end_of_turn effects from future turns", () => {
      const state = createState();
      state.continuousEffects.push({
        id: "future",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 2 },
        target: { type: "specific_entity", entityId: "unit_player_1_scout" },
        expiry: { type: "end_of_turn", turn: 99 },
        layer: LAYER.TEMPORARY,
        timestamp: 1,
      });

      purgeExpiredEffects(state);
      expect(state.continuousEffects).toHaveLength(1);
    });

    it("removes start_of_turn effects when the turn starts", () => {
      const state = createState();
      state.continuousEffects.push({
        id: "sot",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 2 },
        target: { type: "specific_entity", entityId: "unit_player_1_scout" },
        expiry: { type: "start_of_turn", turn: 1 },
        layer: LAYER.TEMPORARY,
        timestamp: 1,
      });

      purgeExpiredEffects(state);
      expect(state.continuousEffects).toHaveLength(0);
    });

    it("keeps start_of_turn effects until the matching turn begins", () => {
      const state = createState();
      state.continuousEffects.push({
        id: "future_start",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 2 },
        target: { type: "specific_entity", entityId: "unit_player_1_scout" },
        expiry: { type: "start_of_turn", turn: 3 },
        layer: LAYER.TEMPORARY,
        timestamp: 1,
      });

      purgeExpiredEffects(state);
      expect(state.continuousEffects).toHaveLength(1);
    });

    it("removes while_source_alive effects when source is dead", () => {
      const state = createState();
      state.continuousEffects.push({
        id: "dead_source",
        sourceEntityId: "nonexistent_unit",
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 1 },
        target: { type: "specific_entity", entityId: "unit_player_1_scout" },
        expiry: { type: "while_source_alive", sourceEntityId: "nonexistent_unit" },
        layer: LAYER.STATIC,
        timestamp: 1,
      });

      purgeExpiredEffects(state);
      expect(state.continuousEffects).toHaveLength(0);
    });

    it("keeps while_source_alive effects when source is alive", () => {
      const state = createState();
      state.continuousEffects.push({
        id: "alive_source",
        sourceEntityId: "unit_player_1_scout",
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 1 },
        target: { type: "specific_entity", entityId: "unit_player_1_harvester" },
        expiry: { type: "while_source_alive", sourceEntityId: "unit_player_1_scout" },
        layer: LAYER.STATIC,
        timestamp: 1,
      });

      purgeExpiredEffects(state);
      expect(state.continuousEffects).toHaveLength(1);
    });

    it("removes until_used effects with 0 uses remaining", () => {
      const state = createState();
      state.continuousEffects.push({
        id: "used_up",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 1 },
        target: { type: "specific_entity", entityId: "unit_player_1_scout" },
        expiry: { type: "until_used", usesRemaining: 0 },
        layer: LAYER.TEMPORARY,
        timestamp: 1,
      });

      purgeExpiredEffects(state);
      expect(state.continuousEffects).toHaveLength(0);
    });

    it("keeps permanent effects", () => {
      const state = createState();
      state.continuousEffects.push({
        id: "perm",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 1 },
        target: { type: "specific_entity", entityId: "unit_player_1_scout" },
        expiry: { type: "permanent" },
        layer: LAYER.COUNTER,
        timestamp: 1,
      });

      purgeExpiredEffects(state);
      expect(state.continuousEffects).toHaveLength(1);
    });
  });

  describe("removeEffectsForEntity", () => {
    it("removes effects sourced from or targeting a destroyed entity", () => {
      const state = createState();
      const entityId = "unit_player_1_scout";
      state.continuousEffects.push(
        {
          id: "sourced",
          sourceEntityId: entityId,
          sourceCardId: null,
          controllerId: "player_1",
          payload: { type: "stat_modifier", stat: "attackDamage", amount: 1 },
          target: { type: "adjacent_allies", sourceEntityId: entityId },
          expiry: { type: "while_source_alive", sourceEntityId: entityId },
          layer: LAYER.STATIC,
          timestamp: 1,
        },
        {
          id: "targeting",
          sourceEntityId: null,
          sourceCardId: null,
          controllerId: "player_1",
          payload: { type: "stat_modifier", stat: "armor", amount: 2 },
          target: { type: "specific_entity", entityId },
          expiry: { type: "permanent" },
          layer: LAYER.TEMPORARY,
          timestamp: 2,
        },
        {
          id: "unrelated",
          sourceEntityId: null,
          sourceCardId: null,
          controllerId: "player_2",
          payload: { type: "stat_modifier", stat: "armor", amount: 1 },
          target: { type: "specific_entity", entityId: "unit_player_2_scout" },
          expiry: { type: "permanent" },
          layer: LAYER.TEMPORARY,
          timestamp: 3,
        },
      );

      removeEffectsForEntity(state, entityId);
      expect(state.continuousEffects).toHaveLength(1);
      expect(state.continuousEffects[0].id).toBe("unrelated");
    });
  });

  describe("getActiveEffectsForEntity", () => {
    it("returns effects matching all_friendly_units", () => {
      const state = createState();
      const effect: ContinuousEffect = {
        id: "friendly",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "attackDamage", amount: 1 },
        target: { type: "all_friendly_units", ownerId: "player_1" },
        expiry: { type: "permanent" },
        layer: LAYER.STATIC,
        timestamp: 1,
      };
      state.continuousEffects.push(effect);

      const p1Effects = getActiveEffectsForEntity(state, "unit_player_1_scout");
      expect(p1Effects).toHaveLength(1);

      const p2Effects = getActiveEffectsForEntity(state, "unit_player_2_scout");
      expect(p2Effects).toHaveLength(0);
    });

    it("returns effects matching all_enemy_units", () => {
      const state = createState();
      state.continuousEffects.push({
        id: "debuff",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "attackDamage", amount: -1 },
        target: { type: "all_enemy_units", ownerId: "player_1" },
        expiry: { type: "permanent" },
        layer: LAYER.STATIC,
        timestamp: 1,
      });

      const p1Effects = getActiveEffectsForEntity(state, "unit_player_1_scout");
      expect(p1Effects).toHaveLength(0);

      const p2Effects = getActiveEffectsForEntity(state, "unit_player_2_scout");
      expect(p2Effects).toHaveLength(1);
    });
  });

  describe("createContinuousEffectId and nextEffectTimestamp", () => {
    it("generates unique IDs using counter", () => {
      const state = createState();
      const ts1 = nextEffectTimestamp(state);
      const id1 = createContinuousEffectId(state, "test");
      const ts2 = nextEffectTimestamp(state);
      const id2 = createContinuousEffectId(state, "test");
      expect(ts1).toBe(1);
      expect(ts2).toBe(2);
      expect(id1).not.toBe(id2);
    });
  });
});
