import type { ServerResponse } from "node:http";
import type { Faction } from "../../src/game/model/enums";
import type { PlayerId } from "../../src/game/model/ids";
import type { MultiplayerServerEvent, OnlineMatchFormat, QueueStatusEvent } from "../../src/network/protocol";
import { writeSseEvent } from "./protocol";

export type ClientSession = {
  token: string;
  stream: ServerResponse | null;
  queuedFaction: Faction | null;
  queuedFormat: OnlineMatchFormat | null;
  queuedAt: number | null;
  matchId: string | null;
  playerId: PlayerId | null;
};

export class SessionStore {
  private sessions = new Map<string, ClientSession>();

  getOrCreate(token: string): ClientSession {
    const existing = this.sessions.get(token);
    if (existing) {
      return existing;
    }
    const created: ClientSession = {
      token,
      stream: null,
      queuedFaction: null,
      queuedFormat: null,
      queuedAt: null,
      matchId: null,
      playerId: null,
    };
    this.sessions.set(token, created);
    return created;
  }

  get(token: string): ClientSession | undefined {
    return this.sessions.get(token);
  }

  attachStream(token: string, stream: ServerResponse): ClientSession {
    const session = this.getOrCreate(token);
    session.stream = stream;
    return session;
  }

  detachStream(token: string, stream?: ServerResponse): void {
    const session = this.sessions.get(token);
    if (!session) {
      return;
    }
    if (!stream || session.stream === stream) {
      session.stream = null;
    }
  }

  send(token: string, event: MultiplayerServerEvent): void {
    const session = this.sessions.get(token);
    if (!session?.stream) {
      return;
    }
    writeSseEvent(session.stream, event);
  }

  setQueued(token: string, faction: Faction | null, format: OnlineMatchFormat | null): ClientSession {
    const session = this.getOrCreate(token);
    session.queuedFaction = faction;
    session.queuedFormat = faction ? format : null;
    session.queuedAt = faction ? Date.now() : null;
    return session;
  }

  bindToMatch(token: string, matchId: string, playerId: PlayerId): ClientSession {
    const session = this.getOrCreate(token);
    session.matchId = matchId;
    session.playerId = playerId;
    session.queuedFaction = null;
    session.queuedFormat = null;
    session.queuedAt = null;
    return session;
  }

  clearMatch(token: string): void {
    const session = this.sessions.get(token);
    if (!session) {
      return;
    }
    session.matchId = null;
    session.playerId = null;
  }

  emitQueueStatus(token: string, queuedPlayers: number, requiredPlayers: number): void {
    const session = this.sessions.get(token);
    if (!session) {
      return;
    }
    const payload: QueueStatusEvent = {
      type: "queue_status",
      status: session.queuedFaction ? "queued" : "idle",
      format: session.queuedFormat,
      queuedFaction: session.queuedFaction,
      queuedAt: session.queuedAt,
      queuedPlayers,
      requiredPlayers,
    };
    this.send(token, payload);
  }

  broadcastKeepalive(): void {
    for (const session of this.sessions.values()) {
      if (!session.stream) {
        continue;
      }
      writeSseEvent(session.stream, {
        type: "keepalive",
        ts: Date.now(),
      });
    }
  }
}
