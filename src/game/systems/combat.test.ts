import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { createInitialGameState } from "../model/state";
import { resolveCombatAttack } from "./combat";
import { LAYER } from "./continuousEffects";

describe("resolveCombatAttack", () => {
  it("applies attack, defense, and supply penalty in locked order", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
    const attacker = state.entities.unit_player_1_scout;
    const target = state.entities.unit_player_2_scout;
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit") {
      throw new Error("Expected initial units.");
    }

    attacker.coord = { q: 4, r: 0 }; // distance 8 from player_1 base at (-4, 0) => supply penalty 1
    attacker.attackDamage = 4;
    target.coord = { q: 5, r: 0 };
    target.armor = 1;
    target.hp = 8;

    const result = resolveCombatAttack(state, attacker, target);

    expect(result.rawAttack).toBe(4);
    expect(result.defense).toBe(1);
    expect(result.distanceFromFriendlyBase).toBe(8);
    expect(result.supplyPenalty).toBe(1);
    expect(result.finalDamage).toBe(2);
    expect(result.targetHpBefore).toBe(8);
    expect(result.targetHpAfter).toBe(6);
    expect(result.targetDestroyed).toBe(false);
  });

  it("enforces minimum damage of 1 after modifiers", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
    const attacker = state.entities.unit_player_1_scout;
    const target = state.entities.unit_player_2_scout;
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit") {
      throw new Error("Expected initial units.");
    }

    attacker.coord = { q: 5, r: 0 }; // distance 9 => supply penalty 1
    attacker.attackDamage = 1;
    target.coord = { q: 4, r: 0 };
    target.armor = 4;
    target.hp = 2;

    const result = resolveCombatAttack(state, attacker, target);

    expect(result.rawAttack).toBe(1);
    expect(result.defense).toBe(4);
    expect(result.supplyPenalty).toBe(1);
    expect(result.finalDamage).toBe(1);
    expect(result.targetHpAfter).toBe(1);
  });

  it("applies a siege bonus when attacking bases", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
    const attacker = state.entities.unit_player_1_scout;
    const target = state.entities.base_player_2;
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("base");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "base") {
      throw new Error("Expected unit attacker and base target.");
    }

    attacker.coord = { q: 2, r: 0 };
    target.coord = { q: 3, r: 0 };

    const result = resolveCombatAttack(state, attacker, target);

    expect(result.rawAttack).toBe(attacker.attackDamage + attacker.siegeDamageBonus);
    expect(result.finalDamage).toBe(3);
    expect(result.targetHpAfter).toBe(target.hp - 3);
  });

  it("adds Forge Captain adjacency aura to allied combat attack damage", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
    const attacker = state.entities.unit_player_1_scout;
    const target = state.entities.unit_player_2_scout;
    const forgeCaptain = state.entities.unit_player_1_harvester;
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    expect(forgeCaptain?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit" || !forgeCaptain || forgeCaptain.kind !== "unit") {
      throw new Error("Expected units for Forge Captain aura test.");
    }

    attacker.coord = { q: -1, r: 0 };
    target.coord = { q: 0, r: 0 };
    forgeCaptain.coord = { q: -1, r: -1 };
    forgeCaptain.role = "utility";
    forgeCaptain.name = "Forge Captain";
    forgeCaptain.sourceCardId = "forge_captain_card";

    state.continuousEffects.push({
      id: "ce_forge_captain_aura_atk",
      sourceEntityId: forgeCaptain.id,
      sourceCardId: "forge_captain_card",
      controllerId: "player_1",
      payload: { type: "stat_modifier", stat: "attackDamage", amount: 1 },
      target: { type: "adjacent_allies", sourceEntityId: forgeCaptain.id, roleFilter: "combat" },
      expiry: { type: "while_source_alive", sourceEntityId: forgeCaptain.id },
      layer: LAYER.STATIC,
      timestamp: 1,
    });

    const result = resolveCombatAttack(state, attacker, target);

    expect(result.rawAttack).toBe(attacker.attackDamage + 1);
    expect(result.finalDamage).toBe(3);
    expect(result.targetHpAfter).toBe(target.hp - 3);
  });
});
