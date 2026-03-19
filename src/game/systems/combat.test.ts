import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { createInitialGameState } from "../model/state";
import { resolveCombatAttack } from "./combat";

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
});
