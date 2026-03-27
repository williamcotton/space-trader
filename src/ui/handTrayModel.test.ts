import { describe, expect, it } from "vitest";
import { getVisibleHandState } from "./handTrayModel";

describe("getVisibleHandState", () => {
  it("shows the priority player's hand during response windows", () => {
    expect(
      getVisibleHandState({
        phase: "main",
        activePlayerId: "player_2",
        priorityPlayerId: "player_1",
      })
    ).toEqual({
      visiblePlayerId: "player_1",
      showingPriorityHand: true,
    });
  });

  it("falls back to the active player when priority matches the turn player", () => {
    expect(
      getVisibleHandState({
        phase: "tactical",
        activePlayerId: "player_2",
        priorityPlayerId: "player_2",
      })
    ).toEqual({
      visiblePlayerId: "player_2",
      showingPriorityHand: false,
    });
  });

  it("keeps the active player's hand visible during discard", () => {
    expect(
      getVisibleHandState({
        phase: "discard",
        activePlayerId: "player_2",
        priorityPlayerId: "player_1",
      })
    ).toEqual({
      visiblePlayerId: "player_2",
      showingPriorityHand: false,
    });
  });
});
