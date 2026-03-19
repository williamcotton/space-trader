import type { StackItem } from "../model/state";
import type { PlayerId } from "../model/ids";

export function getOpponentPlayer(playerId: PlayerId): PlayerId {
  return playerId === "player_1" ? "player_2" : "player_1";
}

export function createStackItemId(turn: number, logIndex: number): string {
  return `stack_${turn}_${logIndex + 1}`;
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
