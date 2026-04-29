import type { GameCommand } from "../actions/commands";
import type { DispatchResult } from "../actions/reducers";
import type { BotDecisionWorkerRequest, BotDecisionWorkerResponse } from "../ai/botDecisionWorkerProtocol";
import { decideMinimaxBotCommand } from "../ai/minimaxBot";
import MinimaxBotWorker from "../ai/minimaxBot.worker?worker";
import { getLoadedContentSetIds } from "../content/loader";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import { getAutoFlowCommand } from "../turn/autoFlow";
import {
  PRIORITY_STOP_LABELS,
  createDefaultPlayerPriorityStopSettings,
  getPriorityStopWindow,
  type PlayerPriorityStopSettings,
  type PriorityStopKey,
  type PriorityStopSettings,
} from "../turn/priorityStops";
import type { RuntimeContentOptions } from "./content";
import type { BotDecisionSystem } from "./types";

const BOT_ACTION_INTERVAL_MS = 160;

function createDefaultBotAutoplayEnabled(playerIds: PlayerId[]): Record<PlayerId, boolean> {
  return Object.fromEntries(playerIds.map((playerId, index) => [playerId, index !== 0])) as Record<PlayerId, boolean>;
}

export function createDisabledBotAutoplayEnabled(playerIds: PlayerId[]): Record<PlayerId, boolean> {
  return Object.fromEntries(playerIds.map((playerId) => [playerId, false])) as Record<PlayerId, boolean>;
}

export type RuntimeAutomationHost = {
  state: GameState;
  getStateVersion(): number;
  getContentSelection(): RuntimeContentOptions;
  isNetworkedMatch(): boolean;
  dispatchLocal(command: GameCommand, options?: { scheduleAutomation?: boolean; animate?: boolean }): DispatchResult;
  notifyStateChanged(): void;
};

export class RuntimeAutomationController {
  private botDecisionSystem: BotDecisionSystem = decideMinimaxBotCommand;
  private botActionReadyAtMs = 0;
  private automationTimer: ReturnType<typeof setTimeout> | null = null;
  private automationTimerDueAtMs = 0;
  private botDecisionWorker: Worker | null = null;
  private botDecisionWorkerEnabled = true;
  private botDecisionWorkerFailed = false;
  private botDecisionRequestCounter = 0;
  private pendingBotDecisionRequestId: number | null = null;
  private pendingBotDecisionStateVersion: number | null = null;
  private botAutoplayEnabled: Record<PlayerId, boolean> = createDefaultBotAutoplayEnabled(["player_1", "player_2"]);
  private priorityStopSettings: PlayerPriorityStopSettings = createDefaultPlayerPriorityStopSettings();
  private consumedPriorityStopKeys: Set<string> = new Set();

  constructor(private readonly host: RuntimeAutomationHost) {}

  rehydrate(): void {
    if (typeof this.botActionReadyAtMs !== "number") {
      this.botActionReadyAtMs = 0;
    }
    if (typeof this.automationTimerDueAtMs !== "number") {
      this.automationTimerDueAtMs = 0;
    }
    if (typeof this.automationTimer === "undefined") {
      this.automationTimer = null;
    }
    if (this.botDecisionWorker) {
      this.botDecisionWorker.terminate();
      this.botDecisionWorker = null;
    }
    if (typeof this.botDecisionWorkerEnabled !== "boolean") {
      this.botDecisionWorkerEnabled = true;
    }
    if (typeof this.botDecisionWorkerFailed !== "boolean") {
      this.botDecisionWorkerFailed = false;
    }
    if (typeof this.botDecisionRequestCounter !== "number") {
      this.botDecisionRequestCounter = 0;
    }
    if (typeof this.pendingBotDecisionRequestId !== "number") {
      this.pendingBotDecisionRequestId = null;
    }
    if (typeof this.pendingBotDecisionStateVersion !== "number") {
      this.pendingBotDecisionStateVersion = null;
    }
    this.rehydrateBotAutoplay();
    this.rehydratePriorityStops();
    if (!(this.consumedPriorityStopKeys instanceof Set)) {
      this.consumedPriorityStopKeys = new Set();
    }
  }

  resetForState(networked: boolean): void {
    this.clearTimer();
    this.resetBotDecisionWorker();
    this.botDecisionWorkerFailed = false;
    this.botActionReadyAtMs = 0;
    this.consumedPriorityStopKeys = new Set();
    this.botAutoplayEnabled = networked
      ? createDisabledBotAutoplayEnabled(this.host.state.playerOrder)
      : createDefaultBotAutoplayEnabled(this.host.state.playerOrder);
    this.priorityStopSettings = createDefaultPlayerPriorityStopSettings(this.host.state.playerOrder);
  }

  disableBotAutoplay(): void {
    this.botAutoplayEnabled = createDisabledBotAutoplayEnabled(this.host.state.playerOrder);
  }

  isBotAutoplayEnabled(playerId: PlayerId): boolean {
    return this.botAutoplayEnabled[playerId] ?? false;
  }

  setBotAutoplayEnabled(playerId: PlayerId, enabled: boolean): void {
    if (this.host.isNetworkedMatch()) {
      return;
    }
    this.botAutoplayEnabled[playerId] = enabled;
    this.host.state.log.push({
      turn: this.host.state.turn,
      text: `${playerId} bot autopilot ${enabled ? "enabled" : "disabled"}.`,
    });
    this.host.notifyStateChanged();
    this.scheduleFromCurrentState();
  }

  toggleBotAutoplay(playerId: PlayerId): boolean {
    const next = !this.botAutoplayEnabled[playerId];
    this.setBotAutoplayEnabled(playerId, next);
    return next;
  }

  getPriorityStopSettings(playerId: PlayerId): PriorityStopSettings {
    return { ...(this.priorityStopSettings[playerId] ?? { opponentMain: false, opponentTactical: false, opponentStack: false }) };
  }

  setPriorityStopSetting(playerId: PlayerId, stopKey: PriorityStopKey, enabled: boolean): void {
    if (this.host.isNetworkedMatch()) {
      return;
    }
    this.priorityStopSettings[playerId] = {
      ...this.priorityStopSettings[playerId],
      [stopKey]: enabled,
    };
    this.host.state.log.push({
      turn: this.host.state.turn,
      text: `${playerId} ${enabled ? "enabled" : "disabled"} ${PRIORITY_STOP_LABELS[stopKey]}.`,
    });
    this.host.notifyStateChanged();
  }

  togglePriorityStopSetting(playerId: PlayerId, stopKey: PriorityStopKey): boolean {
    const next = !this.priorityStopSettings[playerId][stopKey];
    this.setPriorityStopSetting(playerId, stopKey, next);
    return next;
  }

  replaceBotDecisionSystem(system: BotDecisionSystem): void {
    this.resetBotDecisionWorker();
    this.botDecisionSystem = system;
    this.botDecisionWorkerEnabled = false;
  }

  enableBotDecisionWorker(): void {
    this.botDecisionWorkerEnabled = true;
    this.botDecisionWorkerFailed = false;
    this.resetBotDecisionWorker();
  }

  clearTimer(): void {
    if (this.automationTimer !== null) {
      clearTimeout(this.automationTimer);
      this.automationTimer = null;
    }
    this.automationTimerDueAtMs = 0;
  }

  scheduleFromCurrentState(): void {
    this.clearTimer();
    this.cancelStaleBotDecisionRequest();

    if (this.host.state.winner) {
      return;
    }

    if (this.host.isNetworkedMatch()) {
      return;
    }

    if (getAutoFlowCommand(this.host.state)) {
      this.schedule(0);
      return;
    }

    const priorityPlayerId = this.host.state.priorityPlayerId;
    if (!priorityPlayerId || !this.botAutoplayEnabled[priorityPlayerId]) {
      return;
    }

    const remainingDelayMs = Math.max(0, this.botActionReadyAtMs - Date.now());
    this.schedule(remainingDelayMs);
  }

  dispose(): void {
    this.clearTimer();
    this.resetBotDecisionWorker();
  }

  private rehydrateBotAutoplay(): void {
    if (!this.botAutoplayEnabled) {
      this.botAutoplayEnabled = this.host.isNetworkedMatch()
        ? createDisabledBotAutoplayEnabled(this.host.state.playerOrder)
        : createDefaultBotAutoplayEnabled(this.host.state.playerOrder);
      return;
    }

    const defaults = this.host.isNetworkedMatch()
      ? createDisabledBotAutoplayEnabled(this.host.state.playerOrder)
      : createDefaultBotAutoplayEnabled(this.host.state.playerOrder);
    this.botAutoplayEnabled = Object.fromEntries(
      this.host.state.playerOrder.map((playerId) => [playerId, this.botAutoplayEnabled[playerId] ?? defaults[playerId] ?? false])
    ) as Record<PlayerId, boolean>;
  }

  private rehydratePriorityStops(): void {
    if (!this.priorityStopSettings) {
      this.priorityStopSettings = createDefaultPlayerPriorityStopSettings(this.host.state.playerOrder);
      return;
    }

    const defaults = createDefaultPlayerPriorityStopSettings(this.host.state.playerOrder);
    this.priorityStopSettings = Object.fromEntries(
      this.host.state.playerOrder.map((playerId) => [
        playerId,
        {
          ...defaults[playerId],
          ...this.priorityStopSettings[playerId],
        },
      ])
    ) as PlayerPriorityStopSettings;
  }

  private shouldUseBotDecisionWorker(): boolean {
    const contentSelection = this.host.getContentSelection();
    return this.botDecisionWorkerEnabled &&
      !this.botDecisionWorkerFailed &&
      typeof Worker !== "undefined" &&
      !(contentSelection.extraSets && contentSelection.extraSets.length > 0);
  }

  private clearPendingBotDecision(): void {
    this.pendingBotDecisionRequestId = null;
    this.pendingBotDecisionStateVersion = null;
  }

  private resetBotDecisionWorker(): void {
    if (this.botDecisionWorker) {
      this.botDecisionWorker.terminate();
      this.botDecisionWorker = null;
    }
    this.clearPendingBotDecision();
  }

  private ensureBotDecisionWorker(): Worker | null {
    if (!this.shouldUseBotDecisionWorker()) {
      return null;
    }

    if (this.botDecisionWorker) {
      return this.botDecisionWorker;
    }

    const worker = new MinimaxBotWorker();
    worker.onmessage = (event: MessageEvent<BotDecisionWorkerResponse>) => {
      this.handleBotDecisionWorkerMessage(event.data);
    };
    worker.onerror = () => {
      this.resetBotDecisionWorker();
      this.botDecisionWorkerFailed = true;
      this.host.state.log.push({
        turn: this.host.state.turn,
        text: "Bot worker failed; falling back to main-thread decisions.",
      });
      this.host.notifyStateChanged();
      this.scheduleFromCurrentState();
    };

    this.botDecisionWorker = worker;
    return worker;
  }

  private cancelStaleBotDecisionRequest(): void {
    if (this.pendingBotDecisionRequestId === null) {
      return;
    }

    if (this.pendingBotDecisionStateVersion === this.host.getStateVersion()) {
      return;
    }

    this.resetBotDecisionWorker();
  }

  private requestBotDecision(priorityPlayerId: PlayerId): boolean {
    this.cancelStaleBotDecisionRequest();

    if (this.pendingBotDecisionRequestId !== null) {
      return true;
    }

    const worker = this.ensureBotDecisionWorker();
    if (!worker) {
      return false;
    }

    const requestId = ++this.botDecisionRequestCounter;
    this.pendingBotDecisionRequestId = requestId;
    this.pendingBotDecisionStateVersion = this.host.getStateVersion();
    const request: BotDecisionWorkerRequest = {
      type: "decide",
      requestId,
      stateVersion: this.host.getStateVersion(),
      playerId: priorityPlayerId,
      builtInSetIds: [...(this.host.getContentSelection().builtInSetIds ?? getLoadedContentSetIds())],
      state: this.host.state,
    };
    worker.postMessage(request);
    return true;
  }

  private handleBotDecisionWorkerMessage(response: BotDecisionWorkerResponse): void {
    if (response.requestId !== this.pendingBotDecisionRequestId) {
      return;
    }

    this.clearPendingBotDecision();

    if (response.type === "error") {
      this.host.state.log.push({
        turn: this.host.state.turn,
        text: `Bot worker error: ${response.message}`,
      });
      this.host.notifyStateChanged();
      this.botActionReadyAtMs = Date.now() + BOT_ACTION_INTERVAL_MS * 2;
      this.scheduleFromCurrentState();
      return;
    }

    if (response.stateVersion !== this.host.getStateVersion()) {
      this.scheduleFromCurrentState();
      return;
    }

    if (this.host.state.winner || this.host.state.priorityPlayerId !== response.playerId || !this.botAutoplayEnabled[response.playerId]) {
      this.scheduleFromCurrentState();
      return;
    }

    if (!response.command) {
      return;
    }

    const result = this.host.dispatchLocal(response.command, { scheduleAutomation: false });
    this.botActionReadyAtMs = Date.now() + (result.ok ? BOT_ACTION_INTERVAL_MS : BOT_ACTION_INTERVAL_MS * 2);
    this.scheduleFromCurrentState();
  }

  private schedule(delayMs: number): void {
    if (this.host.state.winner) {
      this.clearTimer();
      return;
    }

    const clampedDelay = Math.max(0, Math.floor(delayMs));
    const dueAtMs = Date.now() + clampedDelay;
    if (this.automationTimer && this.automationTimerDueAtMs <= dueAtMs) {
      return;
    }

    this.clearTimer();
    this.automationTimerDueAtMs = dueAtMs;
    this.automationTimer = setTimeout(() => {
      this.automationTimer = null;
      this.automationTimerDueAtMs = 0;
      this.runTick();
    }, clampedDelay);
  }

  private getPendingPriorityStopWindow() {
    const window = getPriorityStopWindow(this.host.state, this.botAutoplayEnabled, this.priorityStopSettings);
    if (!window || this.consumedPriorityStopKeys.has(window.key)) {
      return null;
    }
    return window;
  }

  private runTick(): void {
    if (this.host.state.winner) {
      return;
    }

    const autoFlowCommand = getAutoFlowCommand(this.host.state);
    if (autoFlowCommand) {
      void this.host.dispatchLocal(autoFlowCommand, { scheduleAutomation: true });
      return;
    }

    const priorityPlayerId = this.host.state.priorityPlayerId;
    if (!priorityPlayerId || !this.botAutoplayEnabled[priorityPlayerId]) {
      return;
    }

    const remainingDelayMs = this.botActionReadyAtMs - Date.now();
    if (remainingDelayMs > 0) {
      this.schedule(remainingDelayMs);
      return;
    }

    const priorityStopWindow = this.getPendingPriorityStopWindow();
    if (priorityStopWindow) {
      this.consumedPriorityStopKeys.add(priorityStopWindow.key);
      this.host.state.log.push({
        turn: this.host.state.turn,
        text: `Priority stop ${PRIORITY_STOP_LABELS[priorityStopWindow.stopKey]}: ${priorityStopWindow.priorityPlayerId} yielded to ${priorityStopWindow.yieldedToPlayerId}.`,
      });
      const result = this.host.dispatchLocal(
        {
          type: "PASS_PRIORITY",
          playerId: priorityStopWindow.priorityPlayerId,
        },
        { scheduleAutomation: false }
      );
      this.botActionReadyAtMs = Date.now() + (result.ok ? BOT_ACTION_INTERVAL_MS : BOT_ACTION_INTERVAL_MS * 2);
      this.scheduleFromCurrentState();
      return;
    }

    if (this.requestBotDecision(priorityPlayerId)) {
      return;
    }

    const command = this.botDecisionSystem(this.host.state, priorityPlayerId);
    if (!command) {
      return;
    }

    const result = this.host.dispatchLocal(command, { scheduleAutomation: false });
    this.botActionReadyAtMs = Date.now() + (result.ok ? BOT_ACTION_INTERVAL_MS : BOT_ACTION_INTERVAL_MS * 2);
    this.scheduleFromCurrentState();
  }
}
