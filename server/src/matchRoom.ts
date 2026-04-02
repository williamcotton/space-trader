import { dispatchCommand } from "../../src/game/actions/reducers";
import type { GameCommand } from "../../src/game/actions/commands";
import type { Faction } from "../../src/game/model/enums";
import type { PlayerId } from "../../src/game/model/ids";
import type { GameState } from "../../src/game/model/state";
import { getAutoFlowCommand } from "../../src/game/turn/autoFlow";
import type { MatchCommandEnvelope, MatchStartPayload } from "../../src/network/protocol";
import { MULTIPLAYER_PROTOCOL_VERSION } from "../../src/network/protocol";
import { SessionStore } from "./sessionStore";

type MatchRoomOptions = {
  matchId: string;
  seed: number;
  builtInSetIds: string[];
  runtimeProfileId: string | null;
  mapId: string;
  factions: { player_1: Faction; player_2: Faction };
  state: GameState;
  playerTokens: {
    player_1: string;
    player_2: string;
  };
  sessionStore: SessionStore;
  onFinished: (matchId: string) => void;
};

export class MatchRoom {
  readonly matchId: string;
  private readonly seed: number;
  private readonly builtInSetIds: string[];
  private readonly runtimeProfileId: string | null;
  private readonly mapId: string;
  private readonly factions: { player_1: Faction; player_2: Faction };
  private readonly state: GameState;
  private readonly playerTokens: {
    player_1: string;
    player_2: string;
  };
  private readonly sessionStore: SessionStore;
  private readonly onFinished: (matchId: string) => void;
  private history: MatchCommandEnvelope[] = [];
  private nextSequence = 1;
  private finished = false;

  constructor(options: MatchRoomOptions) {
    this.matchId = options.matchId;
    this.seed = options.seed;
    this.builtInSetIds = [...options.builtInSetIds];
    this.runtimeProfileId = options.runtimeProfileId;
    this.mapId = options.mapId;
    this.factions = options.factions;
    this.state = options.state;
    this.playerTokens = options.playerTokens;
    this.sessionStore = options.sessionStore;
    this.onFinished = options.onFinished;
  }

  start(): void {
    this.sendMatchStart("player_1");
    this.sendMatchStart("player_2");
    this.drainAutoFlow();
  }

  handleCommand(token: string, command: GameCommand): { ok: true } | { ok: false; reason: string } {
    if (this.finished) {
      return {
        ok: false,
        reason: "Match already ended.",
      };
    }

    const expectedPlayerId = this.getPlayerIdForToken(token);
    if (!expectedPlayerId) {
      return {
        ok: false,
        reason: "Session is not part of this match.",
      };
    }

    if (command.playerId !== expectedPlayerId) {
      return {
        ok: false,
        reason: `Command player ${command.playerId} does not match bound player ${expectedPlayerId}.`,
      };
    }

    const result = dispatchCommand(this.state, command);
    if (!result.ok) {
      this.sessionStore.send(token, {
        type: "match_rejected",
        matchId: this.matchId,
        reason: result.reason,
        rejectedCommand: command,
      });
      return {
        ok: false,
        reason: result.reason,
      };
    }

    this.appendAndBroadcast(command);
    this.drainAutoFlow();
    return { ok: true };
  }

  sendResync(token: string): void {
    const localPlayerId = this.getPlayerIdForToken(token);
    if (!localPlayerId) {
      return;
    }
    this.sessionStore.send(token, {
      type: "match_resync",
      payload: {
        matchStart: this.createMatchStartPayload(localPlayerId),
        commands: [...this.history],
        latestSequence: this.nextSequence - 1,
      },
    });
  }

  notifyDisconnect(token: string): void {
    const playerId = this.getPlayerIdForToken(token);
    if (!playerId || this.finished) {
      return;
    }
    const opponent = playerId === "player_1" ? "player_2" : "player_1";
    this.sessionStore.send(this.playerTokens[opponent], {
      type: "player_disconnected",
      matchId: this.matchId,
      playerId,
    });
  }

  private getPlayerIdForToken(token: string): PlayerId | null {
    if (token === this.playerTokens.player_1) {
      return "player_1";
    }
    if (token === this.playerTokens.player_2) {
      return "player_2";
    }
    return null;
  }

  private sendMatchStart(localPlayerId: PlayerId): void {
    this.sessionStore.send(this.playerTokens[localPlayerId], {
      type: "match_start",
      payload: this.createMatchStartPayload(localPlayerId),
    });
  }

  private createMatchStartPayload(localPlayerId: PlayerId): MatchStartPayload {
    return {
      matchId: this.matchId,
      seed: this.seed,
      localPlayerId,
      factions: this.factions,
      mapId: this.mapId,
      runtimeProfileId: this.runtimeProfileId,
      builtInSetIds: [...this.builtInSetIds],
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    };
  }

  private appendAndBroadcast(command: GameCommand): void {
    const envelope: MatchCommandEnvelope = {
      matchId: this.matchId,
      sequence: this.nextSequence++,
      command,
    };
    this.history.push(envelope);
    this.sessionStore.send(this.playerTokens.player_1, {
      type: "match_command",
      payload: envelope,
    });
    this.sessionStore.send(this.playerTokens.player_2, {
      type: "match_command",
      payload: envelope,
    });
  }

  private drainAutoFlow(): void {
    while (!this.finished) {
      if (this.state.winner) {
        this.finish("victory");
        return;
      }
      const autoFlowCommand = getAutoFlowCommand(this.state);
      if (!autoFlowCommand) {
        return;
      }
      const result = dispatchCommand(this.state, autoFlowCommand);
      if (!result.ok) {
        throw new Error(`Authoritative auto-flow rejected in ${this.matchId}: ${result.reason}`);
      }
      this.appendAndBroadcast(autoFlowCommand);
    }
  }

  private finish(reason: "victory" | "disconnect" | "abandon"): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.sessionStore.send(this.playerTokens.player_1, {
      type: "match_ended",
      matchId: this.matchId,
      winnerId: this.state.winner,
      reason,
    });
    this.sessionStore.send(this.playerTokens.player_2, {
      type: "match_ended",
      matchId: this.matchId,
      winnerId: this.state.winner,
      reason,
    });
    this.sessionStore.clearMatch(this.playerTokens.player_1);
    this.sessionStore.clearMatch(this.playerTokens.player_2);
    this.onFinished(this.matchId);
  }
}

