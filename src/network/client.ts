import type { GameCommand } from "../game/actions/commands";
import type { Faction } from "../game/model/enums";
import type { PlayerId } from "../game/model/ids";
import { getGameRuntime, peekGameRuntime } from "../game/runtime";
import {
  DEFAULT_MULTIPLAYER_SERVER_URL,
  DEFAULT_ONLINE_MATCH_FORMAT,
  MULTIPLAYER_PROTOCOL_VERSION,
  MULTIPLAYER_TOKEN_STORAGE_KEY,
  type JoinQueueRequest,
  type JoinQueueResponse,
  type LeaveQueueRequest,
  type LeaveQueueResponse,
  type QuitMatchRequest,
  type QuitMatchResponse,
  type MatchCommandEnvelope,
  type MatchResyncPayload,
  type MatchStartPayload,
  type MultiplayerServerEvent,
  type OnlineMatchFormat,
  type OpenSessionRequest,
  type OpenSessionResponse,
  type ResyncMatchRequest,
  type ResyncMatchResponse,
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
  selectedFaction: Faction;
  selectedFormat: OnlineMatchFormat;
  queuedFaction: Faction | null;
  queuedFormat: OnlineMatchFormat | null;
  queuedPlayers: number;
  requiredPlayers: number;
  matchId: string | null;
  localPlayerId: PlayerId | null;
  error: string | null;
  lastCompletion: MultiplayerMatchCompletion | null;
};

export type MultiplayerMatchCompletion = {
  reason: "victory" | "disconnect" | "abandon";
  winnerId: PlayerId | null;
  matchId: string | null;
  detail: string | null;
};

const WINDOW_TOKEN_SCOPE_PREFIX = "space_trader_window_";
const DEFAULT_MULTIPLAYER_FACTION = "alloy_clan" as Faction;
const MULTIPLAYER_PREFERRED_FACTION_STORAGE_KEY = "space_trader_multiplayer_faction";
const MULTIPLAYER_PREFERRED_FORMAT_STORAGE_KEY = "space_trader_multiplayer_format";

function getWindowTokenScope(): string {
  if (typeof window === "undefined") {
    return "server";
  }

  if (!window.name.startsWith(WINDOW_TOKEN_SCOPE_PREFIX)) {
    const generatedId =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.name = `${WINDOW_TOKEN_SCOPE_PREFIX}${generatedId}`;
  }

  return window.name;
}

function getScopedTokenStorageKey(): string {
  return `${MULTIPLAYER_TOKEN_STORAGE_KEY}:${getWindowTokenScope()}`;
}

function getScopedPreferredFactionStorageKey(): string {
  return `${MULTIPLAYER_PREFERRED_FACTION_STORAGE_KEY}:${getWindowTokenScope()}`;
}

function getScopedPreferredFormatStorageKey(): string {
  return `${MULTIPLAYER_PREFERRED_FORMAT_STORAGE_KEY}:${getWindowTokenScope()}`;
}

function readStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(getScopedTokenStorageKey());
}

function writeStoredToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  const key = getScopedTokenStorageKey();
  if (token) {
    window.sessionStorage.setItem(key, token);
    return;
  }
  window.sessionStorage.removeItem(key);
}

function readStoredPreferredFaction(): Faction {
  if (typeof window === "undefined") {
    return DEFAULT_MULTIPLAYER_FACTION;
  }
  return (window.sessionStorage.getItem(getScopedPreferredFactionStorageKey()) as Faction | null) ?? DEFAULT_MULTIPLAYER_FACTION;
}

function writeStoredPreferredFaction(faction: Faction): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(getScopedPreferredFactionStorageKey(), faction);
}

function readStoredPreferredFormat(): OnlineMatchFormat {
  if (typeof window === "undefined") {
    return DEFAULT_ONLINE_MATCH_FORMAT;
  }
  const stored = window.sessionStorage.getItem(getScopedPreferredFormatStorageKey());
  return stored === "ffa_3p" || stored === "ffa_4p" || stored === "pvp_1v1" ? stored : DEFAULT_ONLINE_MATCH_FORMAT;
}

function writeStoredPreferredFormat(format: OnlineMatchFormat): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(getScopedPreferredFormatStorageKey(), format);
}

class MultiplayerClient {
  private listeners = new Set<() => void>();
  private snapshot: MultiplayerSnapshot = {
    serverUrl: DEFAULT_MULTIPLAYER_SERVER_URL,
    status: "offline",
    token: readStoredToken(),
    selectedFaction: readStoredPreferredFaction(),
    selectedFormat: readStoredPreferredFormat(),
    queuedFaction: null,
    queuedFormat: null,
    queuedPlayers: 0,
    requiredPlayers: 0,
    matchId: null,
    localPlayerId: null,
    error: null,
    lastCompletion: null,
  };
  private eventSource: EventSource | null = null;
  private eventSourceConnected = false;
  private openSessionPromise: Promise<void> | null = null;
  private resyncPromise: Promise<void> | null = null;
  private commandQueue: Promise<void> = Promise.resolve();
  private commandQueueGeneration = 0;
  private activeMatchStart: MatchStartPayload | null = null;
  private lastAppliedSequence = 0;
  private lastHandledRejectionSignature: string | null = null;
  private lastHandledRejectionAt = 0;
  private pendingLocalCommandSignatures: string[] = [];

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): MultiplayerSnapshot {
    return this.snapshot;
  }

  clearLastCompletion(): void {
    if (!this.snapshot.lastCompletion) {
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      lastCompletion: null,
    };
    this.notify();
  }

  private getCommandSignature(command: GameCommand): string {
    return JSON.stringify(command);
  }

  private hasPendingLocalCommand(): boolean {
    return this.pendingLocalCommandSignatures.length > 0;
  }

  private getPendingCommandBlockedReason(): string | null {
    return this.hasPendingLocalCommand() ? "Waiting for the server to confirm your previous action." : null;
  }

  private trackSubmittedLocalCommand(command: GameCommand): void {
    this.pendingLocalCommandSignatures.push(this.getCommandSignature(command));
  }

  private clearTrackedLocalCommand(command: GameCommand): void {
    const signature = this.getCommandSignature(command);
    const index = this.pendingLocalCommandSignatures.indexOf(signature);
    if (index >= 0) {
      this.pendingLocalCommandSignatures.splice(index, 1);
    }
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

  setSelectedFaction(faction: Faction): void {
    if (this.snapshot.selectedFaction === faction) {
      return;
    }
    writeStoredPreferredFaction(faction);
    this.snapshot = {
      ...this.snapshot,
      selectedFaction: faction,
    };
    this.notify();
  }

  setSelectedFormat(format: OnlineMatchFormat): void {
    if (this.snapshot.selectedFormat === format) {
      return;
    }
    writeStoredPreferredFormat(format);
    this.snapshot = {
      ...this.snapshot,
      selectedFormat: format,
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
      lastCompletion: null,
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
      await this.openEventStream(response.token);
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

  async joinQueue(faction = this.snapshot.selectedFaction, format = this.snapshot.selectedFormat): Promise<void> {
    await this.ensureSession();
    const token = this.snapshot.token;
    if (!token) {
      throw new Error("Missing multiplayer session token.");
    }
    writeStoredPreferredFaction(faction);
    writeStoredPreferredFormat(format);
    await this.postJson<JoinQueueRequest, JoinQueueResponse>("/api/queue/join", {
      token,
      faction,
      format,
    });
    if (this.activeMatchStart) {
      this.snapshot = {
        ...this.snapshot,
        status: "in_match",
        selectedFaction: faction,
        selectedFormat: format,
        queuedFaction: null,
        queuedFormat: null,
        queuedPlayers: 0,
        requiredPlayers: 0,
        matchId: this.activeMatchStart.matchId,
        localPlayerId: this.activeMatchStart.localPlayerId,
        error: null,
      };
      this.notify();
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      status: "queued",
      selectedFaction: faction,
      selectedFormat: format,
      queuedFaction: faction,
      queuedFormat: format,
      error: null,
      lastCompletion: null,
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
      queuedFormat: null,
      queuedPlayers: 0,
      requiredPlayers: 0,
      error: null,
    };
    this.notify();
  }

  async quitMatch(): Promise<void> {
    const token = this.snapshot.token;
    const matchId = this.activeMatchStart?.matchId;
    const completion = matchId
      ? {
          reason: "abandon" as const,
          winnerId: null,
          matchId,
          detail: "You left the online match.",
        }
      : null;
    if (token && matchId) {
      try {
        await this.postJson<QuitMatchRequest, QuitMatchResponse>("/api/match/quit", {
          token,
          matchId,
        });
      } catch {
        // Intentionally ignored. The local client still needs to leave network mode
        // and stop trying to reconnect even if the server cannot be reached.
      }
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.activeMatchStart = null;
    this.lastAppliedSequence = 0;
    this.resetCommandQueue();
    this.pendingLocalCommandSignatures = [];
    writeStoredToken(null);
    const runtime = peekGameRuntime();
    runtime?.leaveNetworkMatch("Left multiplayer match.");
    this.snapshot = {
      ...this.snapshot,
      status: "offline",
      token: null,
      queuedFaction: null,
      queuedFormat: null,
      queuedPlayers: 0,
      requiredPlayers: 0,
      matchId: null,
      localPlayerId: null,
      error: null,
      lastCompletion: completion,
    };
    this.notify();
  }

  disconnect(): void {
    const completion = this.activeMatchStart
      ? {
          reason: "disconnect" as const,
          winnerId: null,
          matchId: this.activeMatchStart.matchId,
          detail: "Disconnected from the multiplayer session.",
        }
      : null;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.eventSourceConnected = false;
    this.activeMatchStart = null;
    this.lastAppliedSequence = 0;
    this.resetCommandQueue();
    this.pendingLocalCommandSignatures = [];
    writeStoredToken(null);
    const runtime = peekGameRuntime();
    runtime?.leaveNetworkMatch("Disconnected from multiplayer session.");
    this.snapshot = {
      ...this.snapshot,
      status: "offline",
      token: null,
      queuedFaction: null,
      queuedFormat: null,
      queuedPlayers: 0,
      requiredPlayers: 0,
      matchId: null,
      localPlayerId: null,
      error: null,
      lastCompletion: completion,
    };
    this.notify();
  }

  submitRuntimeCommand = (command: GameCommand): void => {
    const expectedMatchId = this.activeMatchStart?.matchId ?? null;
    const generation = this.commandQueueGeneration;
    this.trackSubmittedLocalCommand(command);

    this.commandQueue = this.commandQueue
      .catch(() => undefined)
      .then(async () => {
        if (!expectedMatchId || generation !== this.commandQueueGeneration) {
          this.clearTrackedLocalCommand(command);
          return;
        }
        if (this.activeMatchStart?.matchId !== expectedMatchId) {
          this.clearTrackedLocalCommand(command);
          return;
        }
        try {
          await this.submitCommand(command, expectedMatchId);
        } catch (error) {
          this.clearTrackedLocalCommand(command);
          const message = error instanceof Error ? error.message : "Failed to submit multiplayer command.";
          this.handleCommandSubmissionError(message, command);
        }
      });
  };

  private async submitCommand(command: GameCommand, expectedMatchId?: string): Promise<void> {
    const token = this.snapshot.token;
    const matchId = expectedMatchId ?? this.activeMatchStart?.matchId;
    if (!token || !matchId) {
      throw new Error("Missing active multiplayer match.");
    }
    if (this.activeMatchStart?.matchId !== matchId) {
      return;
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

  private openEventStream(token: string): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
    }
    this.eventSourceConnected = false;

    const url = new URL("/api/events", this.snapshot.serverUrl);
    url.searchParams.set("token", token);
    const eventSource = new EventSource(url.toString());
    this.eventSource = eventSource;

    return new Promise((resolve, reject) => {
      let settled = false;
      eventSource.onopen = () => {
        this.eventSourceConnected = true;
        this.snapshot = {
          ...this.snapshot,
          status: this.activeMatchStart ? "in_match" : this.snapshot.queuedFaction ? "queued" : "connected",
          error: null,
        };
        this.notify();
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      eventSource.onerror = () => {
        if (this.snapshot.status === "offline") {
          return;
        }
        if (!this.eventSourceConnected && !settled) {
          settled = true;
          eventSource.close();
          if (this.eventSource === eventSource) {
            this.eventSource = null;
          }
          reject(new Error("Failed to open multiplayer event stream."));
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
    });
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
          selectedFaction: event.queuedFaction ?? this.snapshot.selectedFaction,
          selectedFormat: event.format ?? this.snapshot.selectedFormat,
          queuedFaction: event.queuedFaction,
          queuedFormat: event.format,
          queuedPlayers: event.queuedPlayers,
          requiredPlayers: event.requiredPlayers,
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
        this.handleCommandSubmissionError(event.reason, event.rejectedCommand);
        return;
      case "player_disconnected":
        peekGameRuntime()?.recordNetworkRejection(`${event.playerId} disconnected.`);
        return;
      case "match_ended": {
        const runtime = peekGameRuntime();
        runtime?.leaveNetworkMatch(
          event.reason === "victory"
            ? `Match ended. Winner: ${event.winnerId ?? "none"}.`
            : `Match ended: ${event.reason}.`
        );
        this.activeMatchStart = null;
        this.lastAppliedSequence = 0;
        this.resetCommandQueue();
        this.pendingLocalCommandSignatures = [];
        this.snapshot = {
          ...this.snapshot,
          status: "connected",
          matchId: null,
          localPlayerId: null,
          lastCompletion: {
            reason: event.reason,
            winnerId: event.winnerId,
            matchId: event.matchId,
            detail:
              event.reason === "victory"
                ? `Match ended. Winner: ${event.winnerId ?? "none"}.`
                : `Match ended: ${event.reason}.`,
          },
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
    this.resetCommandQueue();
    this.pendingLocalCommandSignatures = [];
    this.activeMatchStart = payload;
    this.lastAppliedSequence = 0;
    const runtime = getGameRuntime();
    runtime.startNetworkMatch(payload, this.submitRuntimeCommand, {
      showIntroAnimation,
      canSubmitCommand: () => !this.hasPendingLocalCommand(),
      getBlockedReason: () => this.getPendingCommandBlockedReason(),
    });
    this.snapshot = {
      ...this.snapshot,
      status: "in_match",
      selectedFaction: payload.factions[payload.localPlayerId],
      selectedFormat: payload.format,
      queuedFaction: null,
      queuedFormat: null,
      queuedPlayers: 0,
      requiredPlayers: 0,
      matchId: payload.matchId,
      localPlayerId: payload.localPlayerId,
      error: null,
      lastCompletion: null,
    };
    this.notify();
  }

  private handleMatchResync(payload: MatchResyncPayload): void {
    this.resetCommandQueue();
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
    if (payload.command.playerId === this.activeMatchStart.localPlayerId) {
      this.clearTrackedLocalCommand(payload.command);
    }
    const runtime = getGameRuntime();
    runtime.applyAuthoritativeCommand(payload.command, { animate });
    this.lastAppliedSequence = payload.sequence;
  }

  private handleCommandSubmissionError(reason: string, rejectedCommand: GameCommand): void {
    const signature = `${reason}::${JSON.stringify(rejectedCommand)}`;
    const now = Date.now();
    if (this.lastHandledRejectionSignature === signature && now - this.lastHandledRejectionAt < 250) {
      return;
    }
    this.lastHandledRejectionSignature = signature;
    this.lastHandledRejectionAt = now;

    // eslint-disable-next-line no-console
    console.error("Multiplayer command rejected", {
      reason,
      command: rejectedCommand,
      matchId: this.activeMatchStart?.matchId ?? null,
      localPlayerId: this.activeMatchStart?.localPlayerId ?? null,
      lastAppliedSequence: this.lastAppliedSequence,
    });

    getGameRuntime().recordNetworkRejection(reason, rejectedCommand);
    this.snapshot = {
      ...this.snapshot,
      error: reason,
    };
    this.notify();
    this.requestAuthoritativeResync();
  }

  private requestAuthoritativeResync(): void {
    const token = this.snapshot.token;
    const matchId = this.activeMatchStart?.matchId;
    if (!token || !matchId || this.resyncPromise) {
      return;
    }

    this.resyncPromise = this.postJson<ResyncMatchRequest, ResyncMatchResponse>("/api/match/resync", {
      token,
      matchId,
    })
      .then(() => undefined)
      .catch((error) => {
        this.handleError(error instanceof Error ? error.message : "Failed to resync multiplayer match.");
      })
      .finally(() => {
        this.resyncPromise = null;
      });
  }

  private resetCommandQueue(): void {
    this.commandQueueGeneration += 1;
    this.commandQueue = Promise.resolve();
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
