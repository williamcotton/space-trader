import { describe, expect, it } from "vitest";
import { requireMapDefinition } from "../content/maps/catalog";
import { DRAW_RESULT_ID } from "../model/ids";
import { createInitialGameState, type MapState } from "../model/state";
import { resolveBaseHpVictory } from "./victory";

function createFourPlayerMap(): MapState {
  return {
    id: "test_four_player",
    name: "Test Four Player",
    width: 9,
    height: 9,
    spawnPoints: {
      player_1: { q: -4, r: -4 },
      player_2: { q: 4, r: -4 },
      player_3: { q: 4, r: 4 },
      player_4: { q: -4, r: 4 },
    },
    resourceNodes: [],
  };
}

describe("resolveBaseHpVictory", () => {
  it("eliminates a player immediately and awards the last survivor the win", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const p2Base = state.entities.base_player_2;
    expect(p2Base?.kind).toBe("base");
    if (!p2Base || p2Base.kind !== "base") {
      throw new Error("Expected player 2 base.");
    }

    p2Base.hp = 0;
    const winner = resolveBaseHpVictory(state);

    expect(winner).toBe("player_1");
    expect(state.winner).toBe("player_1");
    expect(state.eliminatedPlayerIds).toContain("player_2");
    expect(state.entities.base_player_2).toBeUndefined();
    expect(state.entities.unit_player_2_scout).toBeUndefined();
    const winLogs = state.log.filter((entry) => entry.text.includes("wins by outlasting all opponents"));
    expect(winLogs).toHaveLength(1);
  });

  it("ends in a draw when all remaining players are eliminated simultaneously", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });

    const p1Base = state.entities.base_player_1;
    const p2Base = state.entities.base_player_2;
    expect(p1Base?.kind).toBe("base");
    expect(p2Base?.kind).toBe("base");
    if (!p1Base || p1Base.kind !== "base" || !p2Base || p2Base.kind !== "base") {
      throw new Error("Expected both bases.");
    }

    p1Base.hp = 0;
    p2Base.hp = 0;

    const winner = resolveBaseHpVictory(state);
    expect(winner).toBe(DRAW_RESULT_ID);
    expect(state.winner).toBe(DRAW_RESULT_ID);
    expect(state.priorityPlayerId).toBeNull();
  });

  it("does not duplicate win logs if called repeatedly after winner is set", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const p2Base = state.entities.base_player_2;
    expect(p2Base?.kind).toBe("base");
    if (!p2Base || p2Base.kind !== "base") {
      throw new Error("Expected player 2 base.");
    }
    p2Base.hp = 0;

    resolveBaseHpVictory(state);
    resolveBaseHpVictory(state);

    const winLogs = state.log.filter((entry) => entry.text.includes("wins by outlasting all opponents"));
    expect(winLogs).toHaveLength(1);
  });

  it("moves active and priority to the next live seat when the active player is eliminated", () => {
    const state = createInitialGameState({
      map: createFourPlayerMap(),
      factions: {
        player_1: "alloy_clan",
        player_2: "flux_collective",
        player_3: "biomass_swarm",
        player_4: "alloy_clan",
      },
    });
    state.activePlayerId = "player_2";
    state.priorityPlayerId = "player_2";

    const p2Base = state.entities.base_player_2;
    if (!p2Base || p2Base.kind !== "base") {
      throw new Error("Expected player 2 base.");
    }
    p2Base.hp = 0;

    resolveBaseHpVictory(state);

    expect(state.eliminatedPlayerIds).toContain("player_2");
    expect(state.activePlayerId).toBe("player_3");
    expect(state.priorityPlayerId).toBe("player_3");
  });
});
