import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";

type PlayerOrderState = Pick<GameState, "activePlayerId" | "playerOrder" | "players" | "eliminatedPlayerIds">;

export function isPlayerEliminated(state: Pick<GameState, "eliminatedPlayerIds">, playerId: PlayerId): boolean {
  return state.eliminatedPlayerIds.includes(playerId);
}

export function getLivePlayerIds(state: Pick<GameState, "playerOrder" | "players" | "eliminatedPlayerIds">): PlayerId[] {
  const seen = new Set<PlayerId>();
  const livePlayers: PlayerId[] = [];

  for (const playerId of state.playerOrder) {
    if (seen.has(playerId) || !state.players[playerId] || isPlayerEliminated(state, playerId)) {
      continue;
    }
    seen.add(playerId);
    livePlayers.push(playerId);
  }

  return livePlayers;
}

export function getLivePlayerCount(state: Pick<GameState, "playerOrder" | "players" | "eliminatedPlayerIds">): number {
  return getLivePlayerIds(state).length;
}

export function getNextLivePlayerId(
  state: Pick<GameState, "playerOrder" | "players" | "eliminatedPlayerIds">,
  playerId: PlayerId
): PlayerId | null {
  const livePlayers = getLivePlayerIds(state);
  if (livePlayers.length === 0) {
    return null;
  }

  const playerOrder = state.playerOrder.filter((candidate) => state.players[candidate]);
  const currentIndex = playerOrder.indexOf(playerId);
  if (currentIndex < 0) {
    return livePlayers[0] ?? null;
  }

  for (let offset = 1; offset <= playerOrder.length; offset += 1) {
    const candidate = playerOrder[(currentIndex + offset) % playerOrder.length];
    if (candidate && state.players[candidate] && !isPlayerEliminated(state, candidate)) {
      return candidate;
    }
  }

  return null;
}

export function getPriorityReturnPlayerId(state: PlayerOrderState): PlayerId | null {
  if (state.players[state.activePlayerId] && !isPlayerEliminated(state, state.activePlayerId)) {
    return state.activePlayerId;
  }

  return getNextLivePlayerId(state, state.activePlayerId);
}
