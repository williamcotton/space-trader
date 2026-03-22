import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { createInitialGameState, type UnitEntity } from "../model/state";
import { executeInstructions } from "../actions/instructionHandlers";
import { LAYER, nextEffectTimestamp } from "./continuousEffects";
import type { ReplacementEffectPayload } from "./replacementEngine";

function createState() {
  return createInitialGameState({ map: FRONTIER_BELT_MAP });
}

function getUnit(state: ReturnType<typeof createState>, id: string): UnitEntity {
  const entity = state.entities[id];
  if (!entity || entity.kind !== "unit") throw new Error(`Expected unit: ${id}`);
  return entity;
}

function pushReplacementEffect(
  state: ReturnType<typeof createState>,
  id: string,
  controllerId: "player_1" | "player_2",
  payload: ReplacementEffectPayload,
  entityId: string
) {
  const ts = nextEffectTimestamp(state);
  state.continuousEffects.push({
    id,
    sourceEntityId: null,
    sourceCardId: null,
    controllerId,
    payload,
    target: { type: "specific_entity", entityId },
    expiry: { type: "permanent" },
    layer: LAYER.TEMPORARY,
    timestamp: ts,
  });
}

describe("replacementEngine", () => {
  describe("damage prevention", () => {
    it("prevents all damage to a protected entity", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      const initialHp = unit.hp;

      pushReplacementEffect(state, "shield_1", "player_1", {
        type: "replacement_effect",
        replaces: { type: "damage_to_entity", entityId: unit.id },
        replacement: { type: "prevent" },
      }, unit.id);

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 5, sourceLabel: "Test" },
      ]);

      expect(getUnit(state, unit.id).hp).toBe(initialHp);
      expect(state.log.some((l) => l.text.includes("prevented"))).toBe(true);
    });
  });

  describe("damage reduction", () => {
    it("reduces damage by the specified amount", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      const initialHp = unit.hp;

      pushReplacementEffect(state, "armor_1", "player_1", {
        type: "replacement_effect",
        replaces: { type: "damage_to_entity", entityId: unit.id },
        replacement: { type: "reduce_amount", reduction: 2 },
      }, unit.id);

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 5, sourceLabel: "Test" },
      ]);

      expect(getUnit(state, unit.id).hp).toBe(initialHp - 3);
      expect(state.log.some((l) => l.text.includes("reduced damage by 2"))).toBe(true);
    });

    it("prevents damage entirely when reduction exceeds amount", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      const initialHp = unit.hp;

      pushReplacementEffect(state, "armor_2", "player_1", {
        type: "replacement_effect",
        replaces: { type: "damage_to_entity", entityId: unit.id },
        replacement: { type: "reduce_amount", reduction: 10 },
      }, unit.id);

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 3, sourceLabel: "Test" },
      ]);

      expect(getUnit(state, unit.id).hp).toBe(initialHp);
    });
  });

  describe("damage redirect", () => {
    it("redirects damage to another entity", () => {
      const state = createState();
      const protectedUnit = getUnit(state, "unit_player_1_scout");
      const redirectTarget = getUnit(state, "unit_player_2_scout");
      const protectedHp = protectedUnit.hp;
      const redirectHp = redirectTarget.hp;

      pushReplacementEffect(state, "redirect_1", "player_1", {
        type: "replacement_effect",
        replaces: { type: "damage_to_entity", entityId: protectedUnit.id },
        replacement: { type: "redirect", newTargetEntityId: redirectTarget.id },
      }, protectedUnit.id);

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: protectedUnit.id, amount: 3, sourceLabel: "Test" },
      ]);

      expect(getUnit(state, protectedUnit.id).hp).toBe(protectedHp);
      expect(getUnit(state, redirectTarget.id).hp).toBe(redirectHp - 3);
    });
  });

  describe("exile instead of destroy", () => {
    it("prevents destruction via exile replacement", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");

      pushReplacementEffect(state, "exile_1", "player_1", {
        type: "replacement_effect",
        replaces: { type: "destruction_of_entity", entityId: unit.id },
        replacement: { type: "exile_instead_of_destroy" },
      }, unit.id);

      executeInstructions(state, [
        { type: "DESTROY_ENTITY", targetEntityId: unit.id, sourceLabel: "Test" },
      ]);

      // Entity should still exist (exile prevented destruction)
      expect(state.entities[unit.id]).toBeDefined();
      expect(state.log.some((l) => l.text.includes("exile instead of destroy"))).toBe(true);
    });
  });

  describe("substitute instructions", () => {
    it("replaces an instruction with substitute instructions", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      const initialHp = unit.hp;

      pushReplacementEffect(state, "sub_1", "player_1", {
        type: "replacement_effect",
        replaces: { type: "damage_to_entity", entityId: unit.id },
        replacement: {
          type: "substitute",
          instructions: [
            { type: "LOG", text: "Damage was substituted!" },
          ],
        },
      }, unit.id);

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 5, sourceLabel: "Test" },
      ]);

      expect(getUnit(state, unit.id).hp).toBe(initialHp);
      expect(state.log.some((l) => l.text === "Damage was substituted!")).toBe(true);
    });
  });

  describe("one-shot consumption", () => {
    it("until_used effects decrement uses remaining", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      const initialHp = unit.hp;

      const ts = nextEffectTimestamp(state);
      state.continuousEffects.push({
        id: "one_shot_shield",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: {
          type: "replacement_effect",
          replaces: { type: "damage_to_entity", entityId: unit.id },
          replacement: { type: "prevent" },
        },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "until_used", usesRemaining: 1 },
        layer: LAYER.TEMPORARY,
        timestamp: ts,
      });

      // First hit: prevented
      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 2, sourceLabel: "Hit 1" },
      ]);
      expect(getUnit(state, unit.id).hp).toBe(initialHp);

      // Effect should now have 0 uses remaining
      const effect = state.continuousEffects.find((e) => e.id === "one_shot_shield");
      expect(effect?.expiry.type === "until_used" && effect.expiry.usesRemaining).toBe(0);

      // Second hit: goes through (effect expired)
      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 2, sourceLabel: "Hit 2" },
      ]);
      expect(getUnit(state, unit.id).hp).toBe(initialHp - 2);
    });
  });

  describe("any_damage_to_friendly", () => {
    it("intercepts damage to any friendly unit", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      const initialHp = unit.hp;

      const ts = nextEffectTimestamp(state);
      state.continuousEffects.push({
        id: "friendly_shield",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: {
          type: "replacement_effect",
          replaces: { type: "any_damage_to_friendly", ownerId: "player_1" },
          replacement: { type: "reduce_amount", reduction: 1 },
        },
        target: { type: "all_friendly_units", ownerId: "player_1" },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: ts,
      });

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 3, sourceLabel: "Test" },
      ]);

      expect(getUnit(state, unit.id).hp).toBe(initialHp - 2);
    });

    it("does not intercept damage to enemy units", () => {
      const state = createState();
      const enemyUnit = getUnit(state, "unit_player_2_scout");
      const initialHp = enemyUnit.hp;

      const ts = nextEffectTimestamp(state);
      state.continuousEffects.push({
        id: "friendly_shield",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: {
          type: "replacement_effect",
          replaces: { type: "any_damage_to_friendly", ownerId: "player_1" },
          replacement: { type: "reduce_amount", reduction: 1 },
        },
        target: { type: "all_friendly_units", ownerId: "player_1" },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: ts,
      });

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: enemyUnit.id, amount: 3, sourceLabel: "Test" },
      ]);

      expect(getUnit(state, enemyUnit.id).hp).toBe(initialHp - 3);
    });
  });

  describe("multiple replacement ordering", () => {
    it("active player's replacement effects apply first", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      const initialHp = unit.hp;

      // Player 2's effect: reduce by 1
      const ts1 = nextEffectTimestamp(state);
      state.continuousEffects.push({
        id: "p2_reduce",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_2",
        payload: {
          type: "replacement_effect",
          replaces: { type: "damage_to_entity", entityId: unit.id },
          replacement: { type: "reduce_amount", reduction: 1 },
        },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: ts1,
      });

      // Player 1's effect (active player): prevent entirely
      const ts2 = nextEffectTimestamp(state);
      state.continuousEffects.push({
        id: "p1_prevent",
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
        layer: LAYER.TEMPORARY,
        timestamp: ts2,
      });

      // Active player is player_1, so their prevent should apply first
      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 5, sourceLabel: "Test" },
      ]);

      expect(getUnit(state, unit.id).hp).toBe(initialHp);
    });
  });

  describe("redirect loop termination", () => {
    it("stops redirect loops via applied-effect tracking", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      const enemy = getUnit(state, "unit_player_2_scout");
      const unitHp = unit.hp;
      const enemyHp = enemy.hp;

      // Create a redirect chain: unit -> enemy -> unit (would loop)
      const ts1 = nextEffectTimestamp(state);
      state.continuousEffects.push({
        id: "redirect_loop_1",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: {
          type: "replacement_effect",
          replaces: { type: "damage_to_entity", entityId: unit.id },
          replacement: { type: "redirect", newTargetEntityId: enemy.id },
        },
        target: { type: "specific_entity", entityId: unit.id },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: ts1,
      });

      const ts2 = nextEffectTimestamp(state);
      state.continuousEffects.push({
        id: "redirect_loop_2",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_2",
        payload: {
          type: "replacement_effect",
          replaces: { type: "damage_to_entity", entityId: enemy.id },
          replacement: { type: "redirect", newTargetEntityId: unit.id },
        },
        target: { type: "specific_entity", entityId: enemy.id },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
        timestamp: ts2,
      });

      // Should not infinite loop — applied-effect tracking breaks the cycle
      // Redirect 1 fires (unit->enemy), then redirect 2 fires (enemy->unit),
      // then redirect 1 is already applied so damage lands on unit
      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 2, sourceLabel: "Test" },
      ]);

      // Damage should land on unit (final redirect target after both applied)
      expect(getUnit(state, unit.id).hp).toBe(unitHp - 2);
      expect(getUnit(state, enemy.id).hp).toBe(enemyHp);
    });
  });

  describe("no replacement effects", () => {
    it("instructions pass through unchanged when no replacement effects exist", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_1_scout");
      const initialHp = unit.hp;

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 2, sourceLabel: "Test" },
      ]);

      expect(getUnit(state, unit.id).hp).toBe(initialHp - 2);
    });
  });
});
