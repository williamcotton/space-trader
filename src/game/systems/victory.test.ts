import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { createInitialGameState } from "../model/state";
import { resolveBaseHpVictory } from "./victory";

describe("resolveBaseHpVictory", () => {
  it("awards win when one base reaches zero HP", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
    const p2Base = state.entities.base_player_2;
    expect(p2Base?.kind).toBe("base");
    if (!p2Base || p2Base.kind !== "base") {
      throw new Error("Expected player 2 base.");
    }

    p2Base.hp = 0;
    const winner = resolveBaseHpVictory(state);

    expect(winner).toBe("player_1");
    expect(state.winner).toBe("player_1");
    const winLogs = state.log.filter((entry) => entry.text.includes("wins by destroying the enemy base"));
    expect(winLogs).toHaveLength(1);
  });

  it("uses active player as MVP tie-break on simultaneous base destruction", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
    state.activePlayerId = "player_2";

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
    expect(winner).toBe("player_2");
  });

  it("does not duplicate win logs if called repeatedly after winner is set", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
    const p2Base = state.entities.base_player_2;
    expect(p2Base?.kind).toBe("base");
    if (!p2Base || p2Base.kind !== "base") {
      throw new Error("Expected player 2 base.");
    }
    p2Base.hp = 0;

    resolveBaseHpVictory(state);
    resolveBaseHpVictory(state);

    const winLogs = state.log.filter((entry) => entry.text.includes("wins by destroying the enemy base"));
    expect(winLogs).toHaveLength(1);
  });
});
