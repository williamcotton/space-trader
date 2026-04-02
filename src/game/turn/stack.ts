import type { StackItem } from "../model/state";
import type { GameState } from "../model/state";
import type { PlayerId } from "../model/ids";

export function getOpponentPlayer(playerId: PlayerId): PlayerId {
  return playerId === "player_1" ? "player_2" : "player_1";
}

export function createStackItemId(turn: number, nonce: number): string {
  return `stack_${turn}_${nonce}`;
}

export function reserveStackItemId(state: Pick<GameState, "turn" | "nextGeneratedIdCounter">): string {
  const itemId = createStackItemId(state.turn, state.nextGeneratedIdCounter);
  state.nextGeneratedIdCounter += 1;
  return itemId;
}

export function popTopStackItem(items: StackItem[]): StackItem | null {
  if (items.length === 0) {
    return null;
  }
  return items.pop() ?? null;
}

export function peekTopStackItem(items: StackItem[]): StackItem | null {
  if (items.length === 0) {
    return null;
  }
  return items[items.length - 1];
}

export function removeStackItemById(items: StackItem[], itemId: string): StackItem | null {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) {
    return null;
  }

  const [removed] = items.splice(index, 1);
  return removed ?? null;
}
