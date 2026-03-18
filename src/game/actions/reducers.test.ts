import { describe, expect, it } from "vitest";
import type { GameCommand } from "./commands";
import { dispatchCommand } from "./reducers";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { createInitialGameState } from "../model/state";

function setupState() {
  return createInitialGameState({ map: FRONTIER_BELT_MAP });
}

function advanceToTactical(state: ReturnType<typeof setupState>): void {
  dispatchCommand(state, { type: "END_PHASE", playerId: "player_1" }); // economy
  dispatchCommand(state, { type: "END_PHASE", playerId: "player_1" }); // main
  dispatchCommand(state, { type: "END_PHASE", playerId: "player_1" }); // tactical
}

function expectRejected(result: ReturnType<typeof dispatchCommand>): string {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected command to be rejected.");
  }
  return result.reason;
}

describe("dispatchCommand", () => {
  it("supports first unit selection + movement path", () => {
    const state = setupState();
    const unitId = "unit_player_1_scout";
    const before = state.entities[unitId];
    expect(before?.kind).toBe("unit");
    if (!before || before.kind !== "unit") {
      throw new Error("Expected initial player 1 unit.");
    }
    const beforeCoord = { ...before.coord };
    const beforeMoves = before.movesRemaining;

    const selectResult = dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: unitId,
    });
    expect(selectResult.ok).toBe(true);
    expect(state.selectedEntityId).toBe(unitId);

    dispatchCommand(state, { type: "ADVANCE_PHASE", playerId: "player_1" }); // economy
    dispatchCommand(state, { type: "ADVANCE_PHASE", playerId: "player_1" }); // main
    dispatchCommand(state, { type: "ADVANCE_PHASE", playerId: "player_1" }); // tactical
    expect(state.phase).toBe("tactical");

    const moveResult = dispatchCommand(state, {
      type: "MOVE_UNIT",
      playerId: "player_1",
      entityId: unitId,
      to: { q: beforeCoord.q + 1, r: beforeCoord.r },
    });

    expect(moveResult.ok).toBe(true);
    const after = state.entities[unitId];
    expect(after?.kind).toBe("unit");
    if (!after || after.kind !== "unit") {
      throw new Error("Expected moved unit.");
    }
    expect(after.coord.q).toBe(beforeCoord.q + 1);
    expect(after.coord.r).toBe(beforeCoord.r);
    expect(after.movesRemaining).toBe(beforeMoves - 1);
  });

  it("is deterministic for the same command stream", () => {
    const commandStream: GameCommand[] = [
      { type: "SELECT_ENTITY", playerId: "player_1", entityId: "unit_player_1_scout" },
      { type: "ADVANCE_PHASE", playerId: "player_1" },
      { type: "ADVANCE_PHASE", playerId: "player_1" },
      { type: "ADVANCE_PHASE", playerId: "player_1" },
      { type: "MOVE_UNIT", playerId: "player_1", entityId: "unit_player_1_scout", to: { q: -2, r: 0 } },
    ];

    const stateA = setupState();
    const stateB = setupState();

    for (const command of commandStream) {
      dispatchCommand(stateA, command);
      dispatchCommand(stateB, command);
    }

    expect(stateA).toEqual(stateB);
  });

  it("rejects invalid move cases (out-of-phase, occupied, out-of-range)", () => {
    const state = setupState();
    const unitId = "unit_player_1_scout";

    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: unitId,
    });

    const outOfPhase = dispatchCommand(state, {
      type: "MOVE_UNIT",
      playerId: "player_1",
      entityId: unitId,
      to: { q: -2, r: 0 },
    });
    expect(expectRejected(outOfPhase)).toContain("tactical phase");

    advanceToTactical(state);
    expect(state.phase).toBe("tactical");

    const occupied = dispatchCommand(state, {
      type: "MOVE_UNIT",
      playerId: "player_1",
      entityId: unitId,
      to: { q: -4, r: 0 }, // friendly base tile (occupied and within movement range)
    });
    expect(expectRejected(occupied)).toContain("occupied");

    const outOfRange = dispatchCommand(state, {
      type: "MOVE_UNIT",
      playerId: "player_1",
      entityId: unitId,
      to: { q: 2, r: 0 },
    });
    expect(expectRejected(outOfRange)).toContain("out of movement range");
  });

  it("remains deterministic with mixed valid and invalid commands", () => {
    const commandStream: GameCommand[] = [
      { type: "SELECT_ENTITY", playerId: "player_1", entityId: "unit_player_1_scout" },
      { type: "MOVE_UNIT", playerId: "player_1", entityId: "unit_player_1_scout", to: { q: -2, r: 0 } }, // invalid phase
      { type: "END_PHASE", playerId: "player_1" },
      { type: "END_PHASE", playerId: "player_1" },
      { type: "END_PHASE", playerId: "player_1" },
      { type: "MOVE_UNIT", playerId: "player_1", entityId: "unit_player_1_scout", to: { q: -2, r: 0 } }, // valid
      { type: "ATTACK_UNIT", playerId: "player_1", attackerId: "unit_player_1_scout", targetId: "unit_player_2_scout" }, // out of range
    ];

    const stateA = setupState();
    const stateB = setupState();

    for (const command of commandStream) {
      dispatchCommand(stateA, command);
      dispatchCommand(stateB, command);
    }

    expect(stateA).toEqual(stateB);
  });

  it("resolves attack by reducing target HP and consuming attack budget", () => {
    const state = setupState();
    const attackerId = "unit_player_1_scout";
    const targetId = "unit_player_2_scout";

    const attacker = state.entities[attackerId];
    const target = state.entities[targetId];
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit") {
      throw new Error("Expected initial units.");
    }

    attacker.coord = { q: -1, r: 0 };
    target.coord = { q: 0, r: 0 };

    advanceToTactical(state);
    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: attackerId,
    });

    const beforeHp = target.hp;
    const beforeAttacks = attacker.attacksRemaining;
    const attackResult = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId,
      targetId,
    });

    expect(attackResult.ok).toBe(true);
    const afterTarget = state.entities[targetId];
    const afterAttacker = state.entities[attackerId];
    expect(afterTarget?.kind).toBe("unit");
    expect(afterAttacker?.kind).toBe("unit");
    if (!afterTarget || afterTarget.kind !== "unit" || !afterAttacker || afterAttacker.kind !== "unit") {
      throw new Error("Expected entities after attack.");
    }

    expect(afterTarget.hp).toBe(beforeHp - 2);
    expect(afterAttacker.attacksRemaining).toBe(beforeAttacks - 1);
  });

  it("ends the match when a base reaches zero HP", () => {
    const state = setupState();
    const attackerId = "unit_player_1_scout";
    const baseId = "base_player_2";
    const blockerId = "unit_player_2_scout";

    const attacker = state.entities[attackerId];
    const targetBase = state.entities[baseId];
    const blocker = state.entities[blockerId];
    expect(attacker?.kind).toBe("unit");
    expect(targetBase?.kind).toBe("base");
    expect(blocker?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !targetBase || targetBase.kind !== "base" || !blocker || blocker.kind !== "unit") {
      throw new Error("Expected attacker, base, and blocker.");
    }

    attacker.coord = { q: 3, r: 0 };
    blocker.coord = { q: 2, r: 0 };
    targetBase.hp = 1;

    advanceToTactical(state);
    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: attackerId,
    });

    const attackResult = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId,
      targetId: baseId,
    });

    expect(attackResult.ok).toBe(true);
    expect(state.winner).toBe("player_1");

    const updatedBase = state.entities[baseId];
    expect(updatedBase?.kind).toBe("base");
    if (!updatedBase || updatedBase.kind !== "base") {
      throw new Error("Expected base after attack.");
    }
    expect(updatedBase.hp).toBe(0);
  });

  it("enforces attack legality checks (phase, ownership, range, summoning sickness)", () => {
    const state = setupState();
    const attackerId = "unit_player_1_scout";
    const targetId = "unit_player_2_scout";

    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: attackerId,
    });

    const badPhase = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId,
      targetId,
    });
    expect(expectRejected(badPhase)).toContain("tactical phase");

    advanceToTactical(state);

    const wrongOwner = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId: "unit_player_2_scout",
      targetId: "unit_player_1_scout",
    });
    expect(expectRejected(wrongOwner)).toContain("opponent unit");

    dispatchCommand(state, {
      type: "SELECT_ENTITY",
      playerId: "player_1",
      entityId: attackerId,
    });
    const outOfRange = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId,
      targetId,
    });
    expect(expectRejected(outOfRange)).toContain("out of attack range");

    const attacker = state.entities[attackerId];
    const target = state.entities[targetId];
    expect(attacker?.kind).toBe("unit");
    expect(target?.kind).toBe("unit");
    if (!attacker || attacker.kind !== "unit" || !target || target.kind !== "unit") {
      throw new Error("Expected units for sickness check.");
    }

    attacker.coord = { q: -1, r: 0 };
    target.coord = { q: 0, r: 0 };
    attacker.hasSummoningSickness = true;

    const summoningSickness = dispatchCommand(state, {
      type: "ATTACK_UNIT",
      playerId: "player_1",
      attackerId,
      targetId,
    });
    expect(expectRejected(summoningSickness)).toContain("summoning sickness");
  });

  it("rejects END_PHASE from non-active player", () => {
    const state = setupState();
    const result = dispatchCommand(state, {
      type: "END_PHASE",
      playerId: "player_2",
    });

    expect(expectRejected(result)).toContain("active player");
  });
});
