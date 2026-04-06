import type { GameCommand } from "../game/actions/commands";
import type { Faction } from "../game/model/enums";
import type { PlayerId } from "../game/model/ids";

export const MULTIPLAYER_PROTOCOL_VERSION = 1;
export const DEFAULT_MULTIPLAYER_SERVER_URL = "http://127.0.0.1:4310";
export const MULTIPLAYER_TOKEN_STORAGE_KEY = "space_trader_multiplayer_token";

export type MatchStartPayload = {
  matchId: string;
  seed: number;
  localPlayerId: PlayerId;
  factions: Record<PlayerId, Faction>;
  mapId: string;
  runtimeProfileId: string | null;
  builtInSetIds: string[];
  protocolVersion: number;
};

export type MatchCommandEnvelope = {
  matchId: string;
  sequence: number;
  command: GameCommand;
};

export type MatchResyncPayload = {
  matchStart: MatchStartPayload;
  commands: MatchCommandEnvelope[];
  latestSequence: number;
};

export type SessionReadyEvent = {
  type: "session_ready";
  token: string;
};

export type QueueStatusEvent = {
  type: "queue_status";
  status: "idle" | "queued";
  queuedFaction: Faction | null;
  queuedAt: number | null;
  queuedPlayers: number;
};

export type MatchStartEvent = {
  type: "match_start";
  payload: MatchStartPayload;
};

export type MatchCommandEvent = {
  type: "match_command";
  payload: MatchCommandEnvelope;
};

export type MatchRejectedEvent = {
  type: "match_rejected";
  matchId: string;
  reason: string;
  rejectedCommand: GameCommand;
};

export type MatchResyncEvent = {
  type: "match_resync";
  payload: MatchResyncPayload;
};

export type PlayerDisconnectedEvent = {
  type: "player_disconnected";
  matchId: string;
  playerId: PlayerId;
};

export type MatchEndedEvent = {
  type: "match_ended";
  matchId: string;
  winnerId: PlayerId | null;
  reason: "victory" | "disconnect" | "abandon";
};

export type ErrorEventPayload = {
  type: "error";
  message: string;
};

export type KeepAliveEvent = {
  type: "keepalive";
  ts: number;
};

export type MultiplayerServerEvent =
  | SessionReadyEvent
  | QueueStatusEvent
  | MatchStartEvent
  | MatchCommandEvent
  | MatchRejectedEvent
  | MatchResyncEvent
  | PlayerDisconnectedEvent
  | MatchEndedEvent
  | ErrorEventPayload
  | KeepAliveEvent;

export type OpenSessionRequest = {
  token?: string | null;
};

export type OpenSessionResponse = {
  token: string;
  protocolVersion: number;
};

export type JoinQueueRequest = {
  token: string;
  faction: Faction;
};

export type JoinQueueResponse = {
  ok: true;
};

export type LeaveQueueRequest = {
  token: string;
};

export type LeaveQueueResponse = {
  ok: true;
};

export type QuitMatchRequest = {
  token: string;
  matchId: string;
};

export type QuitMatchResponse = {
  ok: true;
};

export type SubmitCommandRequest = {
  token: string;
  matchId: string;
  command: GameCommand;
};

export type SubmitCommandResponse =
  | {
      ok: true;
      accepted: true;
    }
  | {
      ok: false;
      reason: string;
    };
