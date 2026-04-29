import type { GameCommand } from "../actions/commands";
import type { DispatchResult } from "../actions/reducers";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import type { MatchStartPayload } from "../../network/protocol";
import { createRuntimeStateFromContent, type RuntimeContentOptions } from "./content";
import type { RuntimeNetworkSession } from "./types";

export type RuntimeNetworkStartOptions = {
  showIntroAnimation?: boolean;
  canSubmitCommand?: () => boolean;
  getBlockedReason?: () => string | null;
};

export type RuntimeNetworkSessionHost = {
  state: GameState;
  applyResetState(
    newState: GameState,
    runtimeProfileId: string | null,
    contentSelection: RuntimeContentOptions,
    options?: { showIntroAnimation?: boolean }
  ): void;
  dispatchLocal(command: GameCommand, options?: { scheduleAutomation?: boolean; animate?: boolean }): DispatchResult;
  disableBotAutoplay(): void;
  clearPendingTargeting(): void;
  clearAutomationTimer(): void;
  notifyStateChanged(): void;
};

export class RuntimeNetworkSessionController {
  private session: RuntimeNetworkSession | null = null;

  constructor(private readonly host: RuntimeNetworkSessionHost) {}

  rehydrate(): void {
    if (typeof this.session === "undefined") {
      this.session = null;
    }
  }

  isNetworkedMatch(): boolean {
    return this.session !== null;
  }

  getLocalPlayerId(): PlayerId | null {
    return this.session?.localPlayerId ?? null;
  }

  canLocalPlayerActAs(playerId: PlayerId): boolean {
    return !this.session || this.session.localPlayerId === playerId;
  }

  submitOrNull(command: GameCommand, onRejected: (reason: string, command: GameCommand) => void): DispatchResult | null {
    if (!this.session) {
      return null;
    }

    if (this.session.canSubmitCommand && !this.session.canSubmitCommand()) {
      const reason = this.session.getBlockedReason?.() ?? "Waiting for the server to confirm your previous action.";
      this.host.state.lastRejectedReason = reason;
      this.host.notifyStateChanged();
      return {
        ok: false,
        reason,
        events: [],
      };
    }

    try {
      this.host.state.lastRejectedReason = null;
      this.session.submitCommand(command);
      return {
        ok: true,
        events: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit multiplayer command.";
      onRejected(message, command);
      return {
        ok: false,
        reason: message,
        events: [],
      };
    }
  }

  startMatch(
    payload: MatchStartPayload,
    submitCommand: (command: GameCommand) => void,
    options?: RuntimeNetworkStartOptions
  ): void {
    this.session = {
      matchId: payload.matchId,
      localPlayerId: payload.localPlayerId,
      submitCommand,
      canSubmitCommand: options?.canSubmitCommand,
      getBlockedReason: options?.getBlockedReason,
    };

    const { state: newState, runtimeProfileId, loadedSetIds } = createRuntimeStateFromContent({
      builtInSetIds: payload.builtInSetIds,
      runtimeProfileId: payload.runtimeProfileId ?? undefined,
      mapId: payload.mapId,
      factions: payload.factions,
      playerOrder: payload.playerOrder,
      matchId: payload.matchId,
      seed: payload.seed,
    });

    this.host.applyResetState(
      newState,
      runtimeProfileId,
      {
        builtInSetIds: payload.builtInSetIds.length > 0 ? payload.builtInSetIds : loadedSetIds,
      },
      { showIntroAnimation: options?.showIntroAnimation }
    );
    this.host.disableBotAutoplay();
    this.host.state.log.push({
      turn: this.host.state.turn,
      text: `Network match started as ${payload.localPlayerId}.`,
    });
    this.host.notifyStateChanged();
  }

  leaveMatch(reason?: string): void {
    if (!this.session) {
      return;
    }
    this.session = null;
    this.host.clearPendingTargeting();
    this.host.clearAutomationTimer();
    if (reason) {
      this.host.state.log.push({
        turn: this.host.state.turn,
        text: reason,
      });
      this.host.notifyStateChanged();
    }
  }

  applyAuthoritativeCommand(command: GameCommand, options?: { animate?: boolean }): DispatchResult {
    return this.host.dispatchLocal(command, {
      scheduleAutomation: false,
      animate: options?.animate,
    });
  }

  dispose(): void {
    this.session = null;
  }
}
