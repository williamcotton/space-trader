import { describe, expect, it } from "vitest";
import { getVisibleHandState } from "./handTrayModel";

describe("getVisibleHandState", () => {
  it("keeps the local player's hand visible during response windows by default", () => {
    expect(
      getVisibleHandState({
        phase: "main",
        activePlayerId: "player_2",
        priorityPlayerId: "player_1",
      })
    ).toEqual({
      visiblePlayerId: "player_1",
      showingPriorityHand: false,
    });
  });

  it("keeps the local player's hand visible during another player's turn by default", () => {
    expect(
      getVisibleHandState({
        phase: "tactical",
        activePlayerId: "player_2",
        priorityPlayerId: "player_2",
      })
    ).toEqual({
      visiblePlayerId: "player_1",
      showingPriorityHand: false,
    });
  });

  it("can reveal the priority player's hand during response windows for direct-match debugging", () => {
    expect(
      getVisibleHandState({
        phase: "main",
        activePlayerId: "player_2",
        priorityPlayerId: "player_1",
        revealNonLocalHands: true,
      })
    ).toEqual({
      visiblePlayerId: "player_1",
      showingPriorityHand: true,
    });
  });

  it("falls back to the active player when direct-match priority matches the turn player", () => {
    expect(
      getVisibleHandState({
        phase: "tactical",
        activePlayerId: "player_2",
        priorityPlayerId: "player_2",
        revealNonLocalHands: true,
      })
    ).toEqual({
      visiblePlayerId: "player_2",
      showingPriorityHand: false,
    });
  });

  it("keeps the active player's hand visible during direct-match discard", () => {
    expect(
      getVisibleHandState({
        phase: "discard",
        activePlayerId: "player_2",
        priorityPlayerId: "player_1",
        revealNonLocalHands: true,
      })
    ).toEqual({
      visiblePlayerId: "player_2",
      showingPriorityHand: false,
    });
  });

  it("always shows the local player's hand in networked matches", () => {
    expect(
      getVisibleHandState({
        phase: "main",
        activePlayerId: "player_2",
        priorityPlayerId: "player_1",
        networkLocalPlayerId: "player_2",
      })
    ).toEqual({
      visiblePlayerId: "player_2",
      showingPriorityHand: false,
    });
  });
});
