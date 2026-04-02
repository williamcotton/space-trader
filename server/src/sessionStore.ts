import type { ServerResponse } from "node:http";
import type { Faction } from "../../src/game/model/enums";
import type { PlayerId } from "../../src/game/model/ids";
import type { MultiplayerServerEvent, QueueStatusEvent } from "../../src/network/protocol";
import { writeSseEvent } from "./protocol";

export type ClientSession = {
  token: string;
  stream: ServerResponse | null;
  queuedFaction: Faction | null;
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

  setQueued(token: string, faction: Faction | null): ClientSession {
    const session = this.getOrCreate(token);
    session.queuedFaction = faction;
    session.queuedAt = faction ? Date.now() : null;
    return session;
  }

  bindToMatch(token: string, matchId: string, playerId: PlayerId): ClientSession {
    const session = this.getOrCreate(token);
    session.matchId = matchId;
    session.playerId = playerId;
    session.queuedFaction = null;
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

  emitQueueStatus(token: string, queuedPlayers: number): void {
    const session = this.sessions.get(token);
    if (!session) {
      return;
    }
    const payload: QueueStatusEvent = {
      type: "queue_status",
      status: session.queuedFaction ? "queued" : "idle",
      queuedFaction: session.queuedFaction,
      queuedAt: session.queuedAt,
      queuedPlayers,
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

