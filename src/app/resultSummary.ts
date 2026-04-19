import { DRAW_RESULT_ID, PLAYER_ONE, type PlayerId } from "../game/model/ids";
import type { GameState } from "../game/model/state";
import type { MatchResultSummary } from "./types";

type ResultState = Pick<GameState, "matchId" | "winner">;

export function deriveLocalMatchResultSummary(
  state: ResultState,
  options?: { localPlayerId?: PlayerId | null }
): MatchResultSummary | null {
  if (!state.winner) {
    return null;
  }

  const localPlayerId = options?.localPlayerId ?? PLAYER_ONE;
  if (state.winner === DRAW_RESULT_ID) {
    return {
      source: "local",
      outcome: "draw",
      headline: "Draw",
      detail: "No player secured the win.",
      winnerId: state.winner,
      localPlayerId,
      matchId: state.matchId,
    };
  }

  return {
    source: "local",
    outcome: state.winner === localPlayerId ? "win" : "loss",
    headline: state.winner === localPlayerId ? "Victory" : "Defeat",
    detail: `Winner: ${state.winner}.`,
    winnerId: state.winner,
    localPlayerId,
    matchId: state.matchId,
  };
}

export function createNetworkMatchResultSummary(options: {
  reason: "victory" | "disconnect" | "abandon";
  winnerId?: PlayerId | null;
  localPlayerId?: PlayerId | null;
  matchId?: string | null;
  detail?: string | null;
}): MatchResultSummary {
  const winnerId = options.winnerId ?? null;
  const localPlayerId = options.localPlayerId ?? null;

  if (options.reason === "victory") {
    const outcome =
      winnerId === DRAW_RESULT_ID
        ? "draw"
        : winnerId && localPlayerId && winnerId === localPlayerId
          ? "win"
          : "loss";
    const headline =
      winnerId === DRAW_RESULT_ID
        ? "Draw"
        : outcome === "win"
          ? "Victory"
          : "Defeat";

    return {
      source: "network",
      outcome,
      headline,
      detail: options.detail ?? (winnerId ? `Winner: ${winnerId}.` : "The match ended."),
      winnerId,
      localPlayerId,
      matchId: options.matchId ?? null,
    };
  }

  return {
    source: "network",
    outcome: options.reason === "abandon" ? "quit" : "disconnect",
    headline: options.reason === "abandon" ? "Match Ended" : "Disconnected",
    detail:
      options.detail ??
      (options.reason === "abandon"
        ? "You left the network match."
        : "The connection to the match was interrupted."),
    winnerId,
    localPlayerId,
    matchId: options.matchId ?? null,
  };
}
