import type { Faction } from "../../src/game/model/enums";
import type { PlayerId } from "../../src/game/model/ids";
import { DEFAULT_ONLINE_MATCH_FORMAT, ONLINE_MATCH_FORMATS, type OnlineMatchFormat } from "../../src/network/protocol";
import { createMatchState } from "./createMatchState";
import { MatchRoom } from "./matchRoom";
import { RoomStore } from "./roomStore";
import { SessionStore } from "./sessionStore";
import { createMatchSeed } from "./seed";

type MatchmakerOptions = {
  sessionStore: SessionStore;
  roomStore: RoomStore;
};

export class Matchmaker {
  private readonly sessionStore: SessionStore;
  private readonly roomStore: RoomStore;
  private queues: Record<OnlineMatchFormat, string[]> = {
    pvp_1v1: [],
    ffa_3p: [],
    ffa_4p: [],
  };

  constructor(options: MatchmakerOptions) {
    this.sessionStore = options.sessionStore;
    this.roomStore = options.roomStore;
  }

  joinQueue(
    token: string,
    faction: Faction,
    format: OnlineMatchFormat = DEFAULT_ONLINE_MATCH_FORMAT
  ): { ok: true } | { ok: false; reason: string } {
    const session = this.sessionStore.getOrCreate(token);
    if (session.matchId) {
      return {
        ok: false,
        reason: "Session is already in a live match.",
      };
    }
    if (!ONLINE_MATCH_FORMATS[format]) {
      return {
        ok: false,
        reason: `Unknown match format ${format}.`,
      };
    }

    const affectedFormats = this.removeFromQueues(token);
    this.queues[format].push(token);
    this.sessionStore.setQueued(token, faction, format);
    for (const affectedFormat of affectedFormats) {
      this.broadcastQueueStatus(affectedFormat);
    }
    this.broadcastQueueStatus(format);
    this.tryCreateMatch(format);
    return { ok: true };
  }

  leaveQueue(token: string): void {
    const affectedFormats = this.removeFromQueues(token);
    this.sessionStore.setQueued(token, null, null);
    for (const format of affectedFormats) {
      this.broadcastQueueStatus(format);
    }
  }

  getQueuedPlayers(format: OnlineMatchFormat = DEFAULT_ONLINE_MATCH_FORMAT): number {
    return this.queues[format].length;
  }

  emitQueueStatus(token: string): void {
    const session = this.sessionStore.get(token);
    const format = session?.queuedFormat ?? DEFAULT_ONLINE_MATCH_FORMAT;
    const config = ONLINE_MATCH_FORMATS[format];
    this.sessionStore.emitQueueStatus(token, session?.queuedFormat ? this.getQueuedPlayers(format) : 0, config.requiredPlayers);
  }

  private removeFromQueues(token: string): OnlineMatchFormat[] {
    const affectedFormats: OnlineMatchFormat[] = [];
    for (const format of Object.keys(this.queues) as OnlineMatchFormat[]) {
      const nextQueue = this.queues[format].filter((entry) => entry !== token);
      if (nextQueue.length !== this.queues[format].length) {
        affectedFormats.push(format);
        this.queues[format] = nextQueue;
      }
    }
    return affectedFormats;
  }

  private getPlayerOrder(format: OnlineMatchFormat): PlayerId[] {
    const requiredPlayers = ONLINE_MATCH_FORMATS[format].requiredPlayers;
    return Array.from({ length: requiredPlayers }, (_, index) => `player_${index + 1}` as PlayerId);
  }

  private tryCreateMatch(format: OnlineMatchFormat): void {
    const queue = this.queues[format];
    const config = ONLINE_MATCH_FORMATS[format];
    const playerOrder = this.getPlayerOrder(format);

    while (queue.length >= config.requiredPlayers) {
      const tokens = queue.splice(0, config.requiredPlayers);
      if (tokens.length !== config.requiredPlayers) {
        return;
      }

      const sessions = tokens.map((token) => this.sessionStore.get(token));
      if (sessions.some((session) => !session?.queuedFaction || session.queuedFormat !== format)) {
        continue;
      }

      const factions = Object.fromEntries(
        playerOrder.map((playerId, index) => [playerId, sessions[index]!.queuedFaction!])
      ) as Record<PlayerId, Faction>;
      const playerTokens = Object.fromEntries(
        playerOrder.map((playerId, index) => [playerId, tokens[index]!])
      ) as Record<PlayerId, string>;
      const seed = createMatchSeed();
      const matchId = `net_${Date.now().toString(36)}_${seed.toString(36)}`;
      const bundle = createMatchState({
        matchId,
        seed,
        format,
        playerOrder,
        factions,
      });

      for (const playerId of playerOrder) {
        this.sessionStore.bindToMatch(playerTokens[playerId]!, matchId, playerId);
      }

      const room = new MatchRoom({
        matchId,
        seed,
        format,
        playerOrder,
        builtInSetIds: bundle.builtInSetIds,
        runtimeProfileId: bundle.runtimeProfileId,
        mapId: bundle.mapId,
        factions,
        state: bundle.state,
        playerTokens,
        sessionStore: this.sessionStore,
        onFinished: (finishedMatchId) => {
          this.roomStore.delete(finishedMatchId);
        },
      });

      this.roomStore.set(room);
      room.start();
      this.broadcastQueueStatus(format);
    }
  }

  private broadcastQueueStatus(format: OnlineMatchFormat): void {
    const queuedCount = this.queues[format].length;
    const requiredPlayers = ONLINE_MATCH_FORMATS[format].requiredPlayers;
    for (const token of this.queues[format]) {
      this.sessionStore.emitQueueStatus(token, queuedCount, requiredPlayers);
    }
  }
}
