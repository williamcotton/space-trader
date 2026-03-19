import { describe, expect, it } from "vitest";
import { createStackItemId, getOpponentPlayer, peekTopStackItem, popTopStackItem, removeStackItemById } from "./stack";
import type { StackItem } from "../model/state";

describe("stack helpers", () => {
  it("swaps players for priority handoff", () => {
    expect(getOpponentPlayer("player_1")).toBe("player_2");
    expect(getOpponentPlayer("player_2")).toBe("player_1");
  });

  it("creates deterministic stack ids", () => {
    expect(createStackItemId(3, 7)).toBe("stack_3_8");
  });

  it("peeks and pops stack items in LIFO order", () => {
    const items: StackItem[] = [
      {
        id: "s1",
        label: "one",
        controllerId: "player_1",
        ownerId: "player_1",
        effectId: "noop_log",
        effectMagnitude: 0,
        targetStackItemId: null,
        objectKind: "ability",
        counterable: false,
        defaultCounterDestination: "none",
        sourceCardInstanceId: null,
        sourceCardId: null,
        sourceCardOwnerId: null,
      },
      {
        id: "s2",
        label: "two",
        controllerId: "player_2",
        ownerId: "player_2",
        effectId: "damage_enemy_base_2",
        effectMagnitude: 2,
        targetStackItemId: null,
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        sourceCardInstanceId: null,
        sourceCardId: null,
        sourceCardOwnerId: null,
      },
    ];

    const top = peekTopStackItem(items);
    expect(top?.id).toBe("s2");

    const popped = popTopStackItem(items);
    expect(popped?.id).toBe("s2");
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("s1");
  });

  it("removes stack item by id", () => {
    const items: StackItem[] = [
      {
        id: "s1",
        label: "one",
        controllerId: "player_1",
        ownerId: "player_1",
        effectId: "noop_log",
        effectMagnitude: 0,
        targetStackItemId: null,
        objectKind: "ability",
        counterable: false,
        defaultCounterDestination: "none",
        sourceCardInstanceId: null,
        sourceCardId: null,
        sourceCardOwnerId: null,
      },
      {
        id: "s2",
        label: "two",
        controllerId: "player_2",
        ownerId: "player_2",
        effectId: "damage_enemy_base_2",
        effectMagnitude: 2,
        targetStackItemId: null,
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        sourceCardInstanceId: null,
        sourceCardId: null,
        sourceCardOwnerId: null,
      },
    ];

    const removed = removeStackItemById(items, "s1");
    expect(removed?.id).toBe("s1");
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("s2");
  });
});
