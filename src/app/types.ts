import type { PlayerId } from "../game/model/ids";

export type AppBootFlow = "home" | "direct_match";

export type MatchResultSource = "local" | "network";
export type MatchResultOutcome = "win" | "loss" | "draw" | "quit" | "disconnect";

export type MatchResultSummary = {
  source: MatchResultSource;
  outcome: MatchResultOutcome;
  headline: string;
  detail: string | null;
  winnerId: PlayerId | null;
  localPlayerId: PlayerId | null;
  matchId: string | null;
};

export type AppScreen =
  | { kind: "home" }
  | { kind: "learn" }
  | { kind: "single_player_setup" }
  | { kind: "multiplayer_setup" }
  | { kind: "multiplayer_queue" }
  | { kind: "match" }
  | { kind: "results"; result: MatchResultSummary };

export type AppBootConfig = {
  requestedFlow: AppBootFlow | null;
  resolvedFlow: AppBootFlow;
  initialScreen: AppScreen;
};
