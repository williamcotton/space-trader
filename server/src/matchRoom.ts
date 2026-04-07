import { dispatchCommand } from "../../src/game/actions/reducers";
import type { GameCommand } from "../../src/game/actions/commands";
import type { Faction } from "../../src/game/model/enums";
import type { PlayerId } from "../../src/game/model/ids";
import type { GameState } from "../../src/game/model/state";
import { hexDistance } from "../../src/game/model/hex";
import { getAutoFlowCommand } from "../../src/game/turn/autoFlow";
import type { MatchCommandEnvelope, MatchStartPayload, OnlineMatchFormat } from "../../src/network/protocol";
import { MULTIPLAYER_PROTOCOL_VERSION } from "../../src/network/protocol";
import { SessionStore } from "./sessionStore";

type MatchRoomOptions = {
  matchId: string;
  seed: number;
  format: OnlineMatchFormat;
  playerOrder: PlayerId[];
  builtInSetIds: string[];
  runtimeProfileId: string | null;
  mapId: string;
  factions: Record<PlayerId, Faction>;
  state: GameState;
  playerTokens: Record<PlayerId, string>;
  sessionStore: SessionStore;
  onFinished: (matchId: string) => void;
};

export class MatchRoom {
  readonly matchId: string;
  private readonly seed: number;
  private readonly format: OnlineMatchFormat;
  private readonly playerOrder: PlayerId[];
  private readonly builtInSetIds: string[];
  private readonly runtimeProfileId: string | null;
  private readonly mapId: string;
  private readonly factions: Record<PlayerId, Faction>;
  private readonly state: GameState;
  private readonly playerTokens: Record<PlayerId, string>;
  private readonly sessionStore: SessionStore;
  private readonly onFinished: (matchId: string) => void;
  private history: MatchCommandEnvelope[] = [];
  private nextSequence = 1;
  private finished = false;

  constructor(options: MatchRoomOptions) {
    this.matchId = options.matchId;
    this.seed = options.seed;
    this.format = options.format;
    this.playerOrder = [...options.playerOrder];
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
    for (const playerId of this.playerOrder) {
      this.sendMatchStart(playerId);
    }
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
      const reason = this.describeRejectedCommand(command, result.reason);
      // eslint-disable-next-line no-console
      console.error("Rejected multiplayer command", {
        matchId: this.matchId,
        command,
        reason,
      });
      this.sessionStore.send(token, {
        type: "match_rejected",
        matchId: this.matchId,
        reason,
        rejectedCommand: command,
      });
      return {
        ok: false,
        reason,
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
    this.sendToAllExcept(playerId, {
      type: "player_disconnected",
      matchId: this.matchId,
      playerId,
    });
  }

  abandon(token: string): { ok: true } | { ok: false; reason: string } {
    if (this.finished) {
      return {
        ok: false,
        reason: "Match already ended.",
      };
    }
    const playerId = this.getPlayerIdForToken(token);
    if (!playerId) {
      return {
        ok: false,
        reason: "Session is not part of this match.",
      };
    }
    this.finish("abandon");
    return { ok: true };
  }

  private getPlayerIdForToken(token: string): PlayerId | null {
    for (const playerId of this.playerOrder) {
      if (token === this.playerTokens[playerId]) {
        return playerId;
      }
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
      format: this.format,
      playerOrder: [...this.playerOrder],
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
    this.sendToAll({
      type: "match_command",
      payload: envelope,
    });
  }

  private sendToAll(event: Parameters<SessionStore["send"]>[1]): void {
    for (const playerId of this.playerOrder) {
      this.sessionStore.send(this.playerTokens[playerId], event);
    }
  }

  private sendToAllExcept(excludedPlayerId: PlayerId, event: Parameters<SessionStore["send"]>[1]): void {
    for (const playerId of this.playerOrder) {
      if (playerId === excludedPlayerId) {
        continue;
      }
      this.sessionStore.send(this.playerTokens[playerId], event);
    }
  }

  private describeRejectedCommand(command: GameCommand, baseReason: string): string {
    if (command.type !== "MOVE_UNIT") {
      return baseReason;
    }

    const entity = this.state.entities[command.entityId];
    if (!entity || entity.kind !== "unit") {
      return baseReason;
    }

    const distance = hexDistance(entity.coord, command.to);
    return `${baseReason} [match=${this.matchId} unit=${entity.id} from=(${entity.coord.q},${entity.coord.r}) to=(${command.to.q},${command.to.r}) distance=${distance} movesRemaining=${entity.movesRemaining} moveRange=${entity.moveRange} selected=${this.state.selectedEntityId ?? "none"} phase=${this.state.phase} active=${this.state.activePlayerId} priority=${this.state.priorityPlayerId ?? "none"}]`;
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
    this.sendToAll({
      type: "match_ended",
      matchId: this.matchId,
      winnerId: this.state.winner,
      reason,
    });
    for (const token of Object.values(this.playerTokens)) {
      this.sessionStore.clearMatch(token);
    }
    this.onFinished(this.matchId);
  }
}
