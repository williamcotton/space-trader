import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { createInitialGameState, type UnitEntity } from "../model/state";
import { getCascadeAffectedHexes } from "./cascade";
import { RELAY_KEYWORD } from "./keywords";

function createUnit(id: string, coord: { q: number; r: number }, keywords: string[] = []): UnitEntity {
  return {
    id,
    kind: "unit",
    name: id,
    ownerId: "player_2",
    role: "utility",
    hp: 4,
    maxHp: 4,
    attackDamage: 1,
    siegeDamageBonus: 0,
    armor: 0,
    moveRange: 2,
    attackRange: 1,
    attackActionsPerTurn: 1,
    coord,
    keywords,
    carries: null,
    sourceCardId: null,
    hasSummoningSickness: false,
    movesRemaining: 0,
    attacksRemaining: 0,
    temporaryAttackBonus: 0,
    temporaryArmorBonus: 0,
  };
}

function hasHex(hexes: readonly { q: number; r: number }[], target: { q: number; r: number }): boolean {
  return hexes.some((hex) => hex.q === target.q && hex.r === target.r);
}

describe("cascade", () => {
  it("extends to farther hexes when a relayed unit repeats the cascade", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });

    for (const [entityId, entity] of Object.entries(state.entities)) {
      if (entity.kind === "unit") {
        delete state.entities[entityId];
      }
    }

    const relay = createUnit("relay", { q: 1, r: 0 }, [RELAY_KEYWORD]);
    state.entities.relay = relay;
    state.entities.bridge = createUnit("bridge", { q: 2, r: 0 });

    const withRelay = getCascadeAffectedHexes(state, "player_2", { q: 0, r: 0 }, 2);
    expect(hasHex(withRelay, { q: 3, r: 0 })).toBe(true);

    relay.keywords = [];
    const withoutRelay = getCascadeAffectedHexes(state, "player_2", { q: 0, r: 0 }, 2);
    expect(hasHex(withoutRelay, { q: 3, r: 0 })).toBe(false);
  });

  it("deduplicates affected hexes across relay branches", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });

    for (const [entityId, entity] of Object.entries(state.entities)) {
      if (entity.kind === "unit") {
        delete state.entities[entityId];
      }
    }

    state.entities.relay_a = createUnit("relay_a", { q: 1, r: 0 }, [RELAY_KEYWORD]);
    state.entities.relay_b = createUnit("relay_b", { q: 2, r: 0 }, [RELAY_KEYWORD]);
    state.entities.bridge = createUnit("bridge", { q: 3, r: 0 });

    const affected = getCascadeAffectedHexes(state, "player_2", { q: 0, r: 0 }, 2);
    const uniqueKeys = new Set(affected.map((coord) => `${coord.q},${coord.r}`));

    expect(affected).toHaveLength(uniqueKeys.size);
    expect(hasHex(affected, { q: 4, r: 0 })).toBe(true);
  });
});
