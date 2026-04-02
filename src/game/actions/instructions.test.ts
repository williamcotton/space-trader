import { describe, expect, it } from "vitest";
import { getCardDefinition, type UnitCardDefinition } from "../content/cards/catalog";
import { requireMapDefinition } from "../content/maps/catalog";
import { createInitialGameState, type UnitEntity } from "../model/state";
import { executeInstructions } from "./instructionHandlers";
import { LAYER } from "../systems/continuousEffects";

function createState() {
  return createInitialGameState({ map: requireMapDefinition("frontier_belt") });
}

function getUnit(state: ReturnType<typeof createState>, id: string): UnitEntity {
  const entity = state.entities[id];
  if (!entity || entity.kind !== "unit") throw new Error(`Expected unit: ${id}`);
  return entity;
}

describe("executeInstructions", () => {
  describe("DEAL_DAMAGE", () => {
    it("reduces target HP and destroys unit at 0", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_2_scout");
      const initialHp = unit.hp;

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: initialHp, sourceLabel: "Test" },
      ]);

      expect(state.entities[unit.id]).toBeUndefined();
    });

    it("deals partial damage without destroying", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_2_scout");
      const initialHp = unit.hp;

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 1, sourceLabel: "Test" },
      ]);

      expect((state.entities[unit.id] as UnitEntity).hp).toBe(initialHp - 1);
    });

    it("deals damage to a base", () => {
      const state = createState();
      const base = state.entities["base_player_2"];
      expect(base?.kind).toBe("base");
      const initialHp = base!.hp;

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: "base_player_2", amount: 3, sourceLabel: "Test" },
      ]);

      expect(state.entities["base_player_2"]!.hp).toBe(initialHp - 3);
    });

    it("logs when target does not exist", () => {
      const state = createState();
      const logBefore = state.log.length;

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: "nonexistent", amount: 1, sourceLabel: "Ghost" },
      ]);

      expect(state.log.length).toBeGreaterThan(logBefore);
      expect(state.log[state.log.length - 1].text).toContain("target entity not found");
    });
  });

  describe("DESTROY_ENTITY", () => {
    it("removes a unit from the board", () => {
      const state = createState();
      expect(state.entities["unit_player_1_scout"]).toBeDefined();

      executeInstructions(state, [
        { type: "DESTROY_ENTITY", targetEntityId: "unit_player_1_scout", sourceLabel: "Test" },
      ]);

      expect(state.entities["unit_player_1_scout"]).toBeUndefined();
    });

    it("cleans up continuous effects when destroying a unit", () => {
      const state = createState();
      state.continuousEffects.push({
        id: "test_effect",
        sourceEntityId: "unit_player_1_scout",
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "attackDamage", amount: 1 },
        target: { type: "adjacent_allies", sourceEntityId: "unit_player_1_scout" },
        expiry: { type: "while_source_alive", sourceEntityId: "unit_player_1_scout" },
        layer: LAYER.STATIC,
        timestamp: 1,
      });

      executeInstructions(state, [
        { type: "DESTROY_ENTITY", targetEntityId: "unit_player_1_scout", sourceLabel: "Test" },
      ]);

      expect(state.continuousEffects).toHaveLength(0);
    });
  });

  describe("CHANGE_ENTITY_OWNER", () => {
    it("transfers a unit to a new owner and clears selection", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_2_scout");
      state.selectedEntityId = unit.id;

      executeInstructions(state, [
        {
          type: "CHANGE_ENTITY_OWNER",
          targetEntityId: unit.id,
          newOwnerId: "player_1",
          sourceLabel: "Signal Hijack",
        },
      ]);

      expect(getUnit(state, unit.id).ownerId).toBe("player_1");
      expect(state.selectedEntityId).toBeNull();
    });

    it("logs when the target unit does not exist", () => {
      const state = createState();
      const logBefore = state.log.length;

      executeInstructions(state, [
        {
          type: "CHANGE_ENTITY_OWNER",
          targetEntityId: "missing_unit",
          newOwnerId: "player_1",
          sourceLabel: "Signal Hijack",
        },
      ]);

      expect(state.log.length).toBeGreaterThan(logBefore);
      expect(state.log[state.log.length - 1].text).toContain("target unit not found");
    });
  });

  describe("DEPLOY_UNIT", () => {
    it("creates a unit entity on the board", () => {
      const state = createState();
      const entitiesBefore = Object.keys(state.entities).length;

      executeInstructions(state, [
        { type: "DEPLOY_UNIT", cardId: "frontline_scout_card", controllerId: "player_1" },
      ]);

      expect(Object.keys(state.entities).length).toBe(entitiesBefore + 1);
      const newUnit = Object.values(state.entities).find(
        (e) => e.kind === "unit" && e.name === "Frontline Scout" && e.id !== "unit_player_1_scout"
      );
      expect(newUnit).toBeDefined();
      expect(newUnit!.kind).toBe("unit");
    });

    it("registers aura effects when deploying a unit with auras", () => {
      const state = createState();

      executeInstructions(state, [
        { type: "DEPLOY_UNIT", cardId: "forge_captain_card", controllerId: "player_1" },
      ]);

      expect(state.continuousEffects.some(e =>
        e.sourceCardId === "forge_captain_card" &&
        e.payload.type === "stat_modifier" &&
        e.payload.stat === "attackDamage"
      )).toBe(true);
    });

    it("registers armor aura effects when deploying Bulwark Drone", () => {
      const state = createState();

      executeInstructions(state, [
        { type: "DEPLOY_UNIT", cardId: "bulwark_drone_card", controllerId: "player_1" },
      ]);

      expect(state.continuousEffects.some((e) =>
        e.sourceCardId === "bulwark_drone_card" &&
        e.payload.type === "stat_modifier" &&
        e.payload.stat === "armor" &&
        e.payload.amount === 1
      )).toBe(true);
    });

    it("copies unit keywords from the source card definition", () => {
      const scoutCard = getCardDefinition("frontline_scout_card") as UnitCardDefinition;
      const original = scoutCard.unit.keywords;
      scoutCard.unit.keywords = ["stealth"];

      try {
        const state = createState();

        executeInstructions(state, [
          { type: "DEPLOY_UNIT", cardId: "frontline_scout_card", controllerId: "player_1" },
        ]);

        const newUnit = Object.values(state.entities).find(
          (e) => e.kind === "unit" && e.name === "Frontline Scout" && e.id !== "unit_player_1_scout"
        );
        expect(newUnit?.kind).toBe("unit");
        if (!newUnit || newUnit.kind !== "unit") {
          throw new Error("Expected deployed scout.");
        }
        expect(newUnit.keywords).toEqual(["stealth"]);
      } finally {
        scoutCard.unit.keywords = original;
      }
    });

    it("uses the resource unit card move range when deploying a resource unit", () => {
      const harvesterCard = getCardDefinition("expedition_harvester_card") as UnitCardDefinition;
      const originalMoveRange = harvesterCard.unit.moveRange;
      harvesterCard.unit.moveRange = 4;

      try {
        const state = createInitialGameState({
          map: requireMapDefinition("frontier_belt"),
        });

        executeInstructions(state, [
          { type: "DEPLOY_UNIT", cardId: "expedition_harvester_card", controllerId: "player_1" },
        ]);

        const newUnit = Object.values(state.entities).find(
          (entity) => entity.kind === "unit" && entity.sourceCardId === "expedition_harvester_card" && entity.id !== "unit_player_1_harvester"
        );
        expect(newUnit?.kind).toBe("unit");
        if (!newUnit || newUnit.kind !== "unit") {
          throw new Error("Expected deployed harvester.");
        }
        expect(newUnit.moveRange).toBe(4);
      } finally {
        harvesterCard.unit.moveRange = originalMoveRange;
      }
    });
  });

  describe("APPLY_CONTINUOUS_EFFECT", () => {
    it("pushes an effect to the continuousEffects array", () => {
      const state = createState();

      executeInstructions(state, [{
        type: "APPLY_CONTINUOUS_EFFECT",
        effectId: "test_ce",
        sourceEntityId: null,
        sourceCardId: null,
        controllerId: "player_1",
        payload: { type: "stat_modifier", stat: "armor", amount: 3 },
        target: { type: "specific_entity", entityId: "unit_player_1_scout" },
        expiry: { type: "permanent" },
        layer: LAYER.TEMPORARY,
      }]);

      expect(state.continuousEffects).toHaveLength(1);
      expect(state.continuousEffects[0].id).toBe("test_ce");
    });
  });

  describe("COUNTER_STACK_ITEM", () => {
    it("removes a stack item and moves its source card", () => {
      const state = createState();
      state.stack.push({
        id: "stack_1",
        label: "Test Spell",
        controllerId: "player_2",
        ownerId: "player_2",
        effectId: "damage_enemy_base_2",
        effectMagnitude: 2,
        targetStackItemId: null,
        targetEntityId: null,
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        sourceCardInstanceId: "player_2_card_1",
        sourceCardId: "orbital_ping",
        sourceCardOwnerId: "player_2",
        pendingUnitEntityId: null,
      });

      executeInstructions(state, [
        { type: "COUNTER_STACK_ITEM", targetStackItemId: "stack_1", destination: "discard", sourceLabel: "Counter" },
      ]);

      expect(state.stack).toHaveLength(0);
    });
  });

  describe("LOG", () => {
    it("appends a message to the game log", () => {
      const state = createState();
      const logBefore = state.log.length;

      executeInstructions(state, [
        { type: "LOG", text: "Hello from instructions!" },
      ]);

      expect(state.log.length).toBe(logBefore + 1);
      expect(state.log[state.log.length - 1].text).toBe("Hello from instructions!");
    });
  });

  describe("multi-instruction composition", () => {
    it("executes multiple instructions in order", () => {
      const state = createState();
      const unit = getUnit(state, "unit_player_2_scout");

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 1, sourceLabel: "First" },
        { type: "LOG", text: "Between instructions" },
        { type: "DEAL_DAMAGE", targetEntityId: unit.id, amount: 1, sourceLabel: "Second" },
      ]);

      expect((state.entities[unit.id] as UnitEntity).hp).toBe(unit.maxHp - 2);
      expect(state.log.some(e => e.text === "Between instructions")).toBe(true);
    });

    it("handles deal damage + destroy in sequence", () => {
      const state = createState();
      const unitId = "unit_player_2_scout";

      executeInstructions(state, [
        { type: "DEAL_DAMAGE", targetEntityId: unitId, amount: 1, sourceLabel: "Weaken" },
        { type: "DESTROY_ENTITY", targetEntityId: unitId, sourceLabel: "Finish" },
      ]);

      expect(state.entities[unitId]).toBeUndefined();
    });
  });

  describe("GAIN_RESOURCES", () => {
    it("adds resources to a player's pool", () => {
      const state = createState();
      const creditsBefore = state.players.player_1.resources.credits;

      executeInstructions(state, [
        { type: "GAIN_RESOURCES", playerId: "player_1", resources: { credits: 3, alloy: 1 } },
      ]);

      expect(state.players.player_1.resources.credits).toBe(creditsBefore + 3);
      expect(state.players.player_1.resources.alloy).toBeGreaterThanOrEqual(1);
    });
  });
});
