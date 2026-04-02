import type { GameCommand } from "../game/actions/commands";
import type { Faction } from "../game/model/enums";
import { getGameRuntime } from "../game/runtime";
import {
  DEFAULT_MULTIPLAYER_SERVER_URL,
  MULTIPLAYER_PROTOCOL_VERSION,
  MULTIPLAYER_TOKEN_STORAGE_KEY,
  type JoinQueueRequest,
  type JoinQueueResponse,
  type LeaveQueueRequest,
  type LeaveQueueResponse,
  type MatchCommandEnvelope,
  type MatchResyncPayload,
  type MatchStartPayload,
  type MultiplayerServerEvent,
  type OpenSessionRequest,
  type OpenSessionResponse,
  type SubmitCommandRequest,
  type SubmitCommandResponse,
} from "./protocol";

export type MultiplayerStatus =
  | "offline"
  | "connecting"
  | "connected"
  | "queued"
  | "in_match"
  | "reconnecting"
  | "error";

export type MultiplayerSnapshot = {
  serverUrl: string;
  status: MultiplayerStatus;
  token: string | null;
  queuedFaction: Faction | null;
  queuedPlayers: number;
  matchId: string | null;
  localPlayerId: "player_1" | "player_2" | null;
  error: string | null;
};

function readStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(MULTIPLAYER_TOKEN_STORAGE_KEY);
}

function writeStoredToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    window.localStorage.setItem(MULTIPLAYER_TOKEN_STORAGE_KEY, token);
    return;
  }
  window.localStorage.removeItem(MULTIPLAYER_TOKEN_STORAGE_KEY);
}

class MultiplayerClient {
  private listeners = new Set<() => void>();
  private snapshot: MultiplayerSnapshot = {
    serverUrl: DEFAULT_MULTIPLAYER_SERVER_URL,
    status: "offline",
    token: readStoredToken(),
    queuedFaction: null,
    queuedPlayers: 0,
    matchId: null,
    localPlayerId: null,
    error: null,
  };
  private eventSource: EventSource | null = null;
  private openSessionPromise: Promise<void> | null = null;
  private activeMatchStart: MatchStartPayload | null = null;
  private lastAppliedSequence = 0;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): MultiplayerSnapshot {
    return this.snapshot;
  }

  setServerUrl(serverUrl: string): void {
    const normalized = serverUrl.trim() || DEFAULT_MULTIPLAYER_SERVER_URL;
    if (normalized === this.snapshot.serverUrl) {
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      serverUrl: normalized,
    };
    this.notify();
  }

  async ensureSession(): Promise<void> {
    if (this.openSessionPromise) {
      return this.openSessionPromise;
    }

    this.snapshot = {
      ...this.snapshot,
      status: this.snapshot.status === "offline" ? "connecting" : this.snapshot.status,
      error: null,
    };
    this.notify();

    this.openSessionPromise = (async () => {
      const response = await this.postJson<OpenSessionRequest, OpenSessionResponse>("/api/session/open", {
        token: this.snapshot.token,
      });
      if (response.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) {
        throw new Error(`Server protocol ${response.protocolVersion} does not match client protocol ${MULTIPLAYER_PROTOCOL_VERSION}.`);
      }
      this.snapshot = {
        ...this.snapshot,
        token: response.token,
        status: this.snapshot.matchId ? "in_match" : this.snapshot.queuedFaction ? "queued" : "connected",
        error: null,
      };
      writeStoredToken(response.token);
      this.openEventStream(response.token);
      this.notify();
    })();

    try {
      await this.openSessionPromise;
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : "Failed to establish multiplayer session.");
      throw error;
    } finally {
      this.openSessionPromise = null;
    }
  }

  async joinQueue(faction: Faction): Promise<void> {
    await this.ensureSession();
    const token = this.snapshot.token;
    if (!token) {
      throw new Error("Missing multiplayer session token.");
    }
    await this.postJson<JoinQueueRequest, JoinQueueResponse>("/api/queue/join", {
      token,
      faction,
    });
    this.snapshot = {
      ...this.snapshot,
      status: "queued",
      queuedFaction: faction,
      error: null,
    };
    this.notify();
  }

  async leaveQueue(): Promise<void> {
    const token = this.snapshot.token;
    if (!token) {
      return;
    }
    await this.postJson<LeaveQueueRequest, LeaveQueueResponse>("/api/queue/leave", {
      token,
    });
    this.snapshot = {
      ...this.snapshot,
      status: this.activeMatchStart ? "in_match" : "connected",
      queuedFaction: null,
      queuedPlayers: 0,
      error: null,
    };
    this.notify();
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.activeMatchStart = null;
    this.lastAppliedSequence = 0;
    const runtime = getGameRuntime();
    runtime.leaveNetworkMatch("Disconnected from multiplayer session.");
    runtime.resetWithContent();
    this.snapshot = {
      ...this.snapshot,
      status: "offline",
      queuedFaction: null,
      queuedPlayers: 0,
      matchId: null,
      localPlayerId: null,
      error: null,
    };
    this.notify();
  }

  submitRuntimeCommand = (command: GameCommand): void => {
    void this.submitCommand(command);
  };

  private async submitCommand(command: GameCommand): Promise<void> {
    const token = this.snapshot.token;
    const matchId = this.activeMatchStart?.matchId;
    if (!token || !matchId) {
      throw new Error("Missing active multiplayer match.");
    }
    const response = await this.postJson<SubmitCommandRequest, SubmitCommandResponse>("/api/command", {
      token,
      matchId,
      command,
    });
    if (!response.ok) {
      throw new Error(response.reason);
    }
  }

  private openEventStream(token: string): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const url = new URL("/api/events", this.snapshot.serverUrl);
    url.searchParams.set("token", token);
    const eventSource = new EventSource(url.toString());
    eventSource.onopen = () => {
      this.snapshot = {
        ...this.snapshot,
        status: this.activeMatchStart ? "in_match" : this.snapshot.queuedFaction ? "queued" : "connected",
        error: null,
      };
      this.notify();
    };
    eventSource.onerror = () => {
      if (this.snapshot.status === "offline") {
        return;
      }
      this.snapshot = {
        ...this.snapshot,
        status: "reconnecting",
      };
      this.notify();
    };
    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as MultiplayerServerEvent;
      this.handleServerEvent(payload);
    };
    this.eventSource = eventSource;
  }

  private handleServerEvent(event: MultiplayerServerEvent): void {
    switch (event.type) {
      case "session_ready":
        if (event.token !== this.snapshot.token) {
          this.snapshot = {
            ...this.snapshot,
            token: event.token,
          };
          writeStoredToken(event.token);
          this.notify();
        }
        return;
      case "queue_status":
        this.snapshot = {
          ...this.snapshot,
          status: event.status === "queued" ? "queued" : this.activeMatchStart ? "in_match" : "connected",
          queuedFaction: event.queuedFaction,
          queuedPlayers: event.queuedPlayers,
        };
        this.notify();
        return;
      case "match_start":
        this.handleMatchStart(event.payload, true);
        return;
      case "match_resync":
        this.handleMatchResync(event.payload);
        return;
      case "match_command":
        this.handleMatchCommand(event.payload, true);
        return;
      case "match_rejected":
        getGameRuntime().recordNetworkRejection(event.reason, event.rejectedCommand);
        this.snapshot = {
          ...this.snapshot,
          error: event.reason,
        };
        this.notify();
        return;
      case "player_disconnected":
        getGameRuntime().recordNetworkRejection(`${event.playerId} disconnected.`);
        return;
      case "match_ended": {
        const runtime = getGameRuntime();
        runtime.leaveNetworkMatch(
          event.reason === "victory"
            ? `Match ended. Winner: ${event.winnerId ?? "none"}.`
            : `Match ended: ${event.reason}.`
        );
        this.activeMatchStart = null;
        this.lastAppliedSequence = 0;
        this.snapshot = {
          ...this.snapshot,
          status: "connected",
          matchId: null,
          localPlayerId: null,
        };
        this.notify();
        return;
      }
      case "error":
        this.handleError(event.message);
        return;
      case "keepalive":
        return;
      default:
        return;
    }
  }

  private handleMatchStart(payload: MatchStartPayload, showIntroAnimation: boolean): void {
    this.activeMatchStart = payload;
    this.lastAppliedSequence = 0;
    const runtime = getGameRuntime();
    runtime.startNetworkMatch(payload, this.submitRuntimeCommand, { showIntroAnimation });
    this.snapshot = {
      ...this.snapshot,
      status: "in_match",
      queuedFaction: null,
      queuedPlayers: 0,
      matchId: payload.matchId,
      localPlayerId: payload.localPlayerId,
      error: null,
    };
    this.notify();
  }

  private handleMatchResync(payload: MatchResyncPayload): void {
    this.handleMatchStart(payload.matchStart, false);
    const runtime = getGameRuntime();
    for (const envelope of payload.commands.sort((a, b) => a.sequence - b.sequence)) {
      runtime.applyAuthoritativeCommand(envelope.command, { animate: false });
      this.lastAppliedSequence = Math.max(this.lastAppliedSequence, envelope.sequence);
    }
    this.snapshot = {
      ...this.snapshot,
      status: "in_match",
    };
    this.notify();
  }

  private handleMatchCommand(payload: MatchCommandEnvelope, animate: boolean): void {
    if (!this.activeMatchStart || payload.matchId !== this.activeMatchStart.matchId) {
      return;
    }
    if (payload.sequence <= this.lastAppliedSequence) {
      return;
    }
    const runtime = getGameRuntime();
    runtime.applyAuthoritativeCommand(payload.command, { animate });
    this.lastAppliedSequence = payload.sequence;
  }

  private handleError(message: string): void {
    this.snapshot = {
      ...this.snapshot,
      status: "error",
      error: message,
    };
    this.notify();
  }

  private async postJson<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse> {
    const response = await fetch(new URL(path, this.snapshot.serverUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as TResponse | { reason?: string };
    if (!response.ok) {
      const maybeReason = payload as { reason?: string };
      throw new Error(typeof maybeReason.reason === "string" ? maybeReason.reason : `Request failed: ${response.status}`);
    }
    return payload as TResponse;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

const multiplayerClient = new MultiplayerClient();

export function getMultiplayerClient(): MultiplayerClient {
  return multiplayerClient;
}
