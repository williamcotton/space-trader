import { DRAW_RESULT_ID, PLAYER_ONE, type PlayerId } from "../game/model/ids";
import type { GameState } from "../game/model/state";
import type { MatchResultSummary } from "./types";

type ResultState = Pick<GameState, "matchId" | "winner">;

export function deriveLocalMatchResultSummary(
  state: ResultState,
  options?: { localPlayerId?: PlayerId | null; modeLabel?: string | null }
): MatchResultSummary | null {
  if (!state.winner) {
    return null;
  }

  const localPlayerId = options?.localPlayerId ?? PLAYER_ONE;
  const modeLabel = options?.modeLabel ?? "Play vs AI";
  if (state.winner === DRAW_RESULT_ID) {
    return {
      source: "local",
      outcome: "draw",
      headline: "Draw",
      detail: "No player secured the win.",
      modeLabel,
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
    modeLabel,
    winnerId: state.winner,
    localPlayerId,
    matchId: state.matchId,
  };
}

export function createLocalExitResultSummary(options?: {
  matchId?: string | null;
  localPlayerId?: PlayerId | null;
  detail?: string | null;
  modeLabel?: string | null;
}): MatchResultSummary {
  return {
    source: "local",
    outcome: "quit",
    headline: "Match Ended",
    detail: options?.detail ?? "You returned to the menu before the match finished.",
    modeLabel: options?.modeLabel ?? "Play vs AI",
    winnerId: null,
    localPlayerId: options?.localPlayerId ?? PLAYER_ONE,
    matchId: options?.matchId ?? null,
  };
}

export function createNetworkMatchResultSummary(options: {
  reason: "victory" | "disconnect" | "abandon";
  winnerId?: PlayerId | null;
  localPlayerId?: PlayerId | null;
  matchId?: string | null;
  detail?: string | null;
  modeLabel?: string | null;
}): MatchResultSummary {
  const winnerId = options.winnerId ?? null;
  const localPlayerId = options.localPlayerId ?? null;
  const modeLabel = options.modeLabel ?? "Play Online";

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
      modeLabel,
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
    modeLabel,
    winnerId,
    localPlayerId,
    matchId: options.matchId ?? null,
  };
}
