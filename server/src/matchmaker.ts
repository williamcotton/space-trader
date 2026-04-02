import type { Faction } from "../../src/game/model/enums";
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
  private queue: string[] = [];

  constructor(options: MatchmakerOptions) {
    this.sessionStore = options.sessionStore;
    this.roomStore = options.roomStore;
  }

  joinQueue(token: string, faction: Faction): { ok: true } | { ok: false; reason: string } {
    const session = this.sessionStore.getOrCreate(token);
    if (session.matchId) {
      return {
        ok: false,
        reason: "Session is already in a live match.",
      };
    }

    this.queue = this.queue.filter((entry) => entry !== token);
    this.queue.push(token);
    this.sessionStore.setQueued(token, faction);
    this.broadcastQueueStatus();
    this.tryCreateMatch();
    return { ok: true };
  }

  leaveQueue(token: string): void {
    this.queue = this.queue.filter((entry) => entry !== token);
    this.sessionStore.setQueued(token, null);
    this.broadcastQueueStatus();
  }

  getQueuedPlayers(): number {
    return this.queue.length;
  }

  private tryCreateMatch(): void {
    while (this.queue.length >= 2) {
      const playerOneToken = this.queue.shift();
      const playerTwoToken = this.queue.shift();
      if (!playerOneToken || !playerTwoToken) {
        return;
      }

      const playerOneSession = this.sessionStore.get(playerOneToken);
      const playerTwoSession = this.sessionStore.get(playerTwoToken);
      if (!playerOneSession?.queuedFaction || !playerTwoSession?.queuedFaction) {
        continue;
      }

      const playerOneFaction = playerOneSession.queuedFaction;
      const playerTwoFaction = playerTwoSession.queuedFaction;
      const seed = createMatchSeed();
      const matchId = `net_${Date.now().toString(36)}_${seed.toString(36)}`;
      const bundle = createMatchState({
        matchId,
        seed,
        factions: {
          player_1: playerOneFaction,
          player_2: playerTwoFaction,
        },
      });

      this.sessionStore.bindToMatch(playerOneToken, matchId, "player_1");
      this.sessionStore.bindToMatch(playerTwoToken, matchId, "player_2");

      const room = new MatchRoom({
        matchId,
        seed,
        builtInSetIds: bundle.builtInSetIds,
        runtimeProfileId: bundle.runtimeProfileId,
        mapId: bundle.mapId,
        factions: {
          player_1: playerOneFaction,
          player_2: playerTwoFaction,
        },
        state: bundle.state,
        playerTokens: {
          player_1: playerOneToken,
          player_2: playerTwoToken,
        },
        sessionStore: this.sessionStore,
        onFinished: (finishedMatchId) => {
          this.roomStore.delete(finishedMatchId);
        },
      });

      this.roomStore.set(room);
      room.start();
      this.broadcastQueueStatus();
    }
  }

  private broadcastQueueStatus(): void {
    const queuedCount = this.queue.length;
    for (const token of this.queue) {
      this.sessionStore.emitQueueStatus(token, queuedCount);
    }
  }
}
