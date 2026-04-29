import type { GameCommand } from "./actions/commands";
import type { DispatchResult } from "./actions/reducers";
import { getLoadedContentSetIds } from "./content/loader";
import {
  findRegisteredRuntimeProfileForMap,
  getDefaultRuntimeProfile,
} from "./content/registry";
import type { Faction } from "./model/enums";
import type { PlayerId } from "./model/ids";
import { migrateRuntimeState } from "./model/migrations";
import { buildMatchIntroAnimation } from "./render/animations";
import { configurePlayerThemes } from "./presentation";
import { updateGame } from "./systems";
import {
  type PriorityStopKey,
  type PriorityStopSettings,
} from "./turn/priorityStops";
import type { GameState, HexCoord } from "./model/state";
import type { CanvasAnimation, GameRenderer, GameViewport, UpdateSystem } from "./types";
import type { MatchStartPayload } from "../network/protocol";
import { RuntimeAutomationController } from "./runtime/automation";
import { createDefaultRuntimeState, createRuntimeStateFromContent, type RuntimeContentOptions } from "./runtime/content";
import { RuntimeCommandExecutor } from "./runtime/commandExecutor";
import { RuntimeDevControls } from "./runtime/devControls";
import { bindRuntimeToWindow, type RuntimeHotData } from "./runtime/hotRuntime";
import { RuntimeNetworkSessionController } from "./runtime/networkSession";
import { RuntimeFrameController } from "./runtime/renderFrame";
import { RuntimeStore } from "./runtime/store";
import { RuntimeTargetingController } from "./runtime/targeting";
import { RuntimeTransients } from "./runtime/transients";
import type { BotDecisionSystem, PendingAttackTargeting, PendingCardTargeting } from "./runtime/types";

export type { RuntimeContentOptions } from "./runtime/content";
export { getBoardClickCommand } from "./runtime/targeting";

function buildFactionMap(state: Pick<GameState, "playerOrder" | "players">): Record<PlayerId, Faction> {
  return Object.fromEntries(
    state.playerOrder
      .filter((playerId) => Boolean(state.players[playerId]))
      .map((playerId) => [playerId, state.players[playerId]!.faction])
  ) as Record<PlayerId, Faction>;
}

export class GameRuntime {
  private store = new RuntimeStore();
  private transients = new RuntimeTransients();
  private commandExecutor = new RuntimeCommandExecutor(this);
  private networkController = new RuntimeNetworkSessionController(this);
  private targeting = new RuntimeTargetingController(this, this.transients);
  private devControls = new RuntimeDevControls(this, this.transients);
  private automation = new RuntimeAutomationController(this);
  private renderFrame!: RuntimeFrameController;
  private updateSystem: UpdateSystem = updateGame;
  private runtimeProfileId: string | null = null;
  private contentSelection: RuntimeContentOptions = {
    builtInSetIds: ["base"],
  };
  readonly state: GameState;

  constructor(
    state: GameState = createDefaultRuntimeState(),
    runtimeProfileId?: string,
    contentSelection?: RuntimeContentOptions
  ) {
    this.state = state;
    this.renderFrame = new RuntimeFrameController(this.state, this.store, this.transients, () => this.updateSystem);
    migrateRuntimeState(this.state);
    this.runtimeProfileId = runtimeProfileId ?? findRegisteredRuntimeProfileForMap(this.state.map.id)?.id ?? getDefaultRuntimeProfile()?.id ?? null;
    this.contentSelection = contentSelection ?? {
      builtInSetIds: getLoadedContentSetIds(),
    };
    this.rehydrateHotState();
    configurePlayerThemes(buildFactionMap(this.state));
    this.pushAnimations([buildMatchIntroAnimation(this.state)]);
    this.scheduleAutomationFromCurrentState();
  }

  resetWithFactions(factions: Partial<Record<PlayerId, Faction>>): void {
    if (this.isNetworkedMatch()) {
      return;
    }
    this.resetWithContent({
      builtInSetIds: this.contentSelection.builtInSetIds,
      extraSets: this.contentSelection.extraSets,
      runtimeProfileId: this.runtimeProfileId ?? undefined,
      mapId: this.state.map.id,
      factions,
    });
  }

  resetWithContent(options?: RuntimeContentOptions): void {
    if (this.isNetworkedMatch()) {
      return;
    }
    const { state: newState, runtimeProfileId, loadedSetIds } = createRuntimeStateFromContent(
      {
        builtInSetIds: options?.builtInSetIds ?? this.contentSelection.builtInSetIds,
        extraSets: options?.extraSets ?? this.contentSelection.extraSets,
        runtimeProfileId: options?.runtimeProfileId,
        mapId: options?.mapId,
        factions: options?.factions,
        seed: options?.seed,
        matchId: options?.matchId,
      },
      this.runtimeProfileId,
      this.state.map.id
    );

    this.applyResetState(
      newState,
      runtimeProfileId,
      {
        builtInSetIds: options?.builtInSetIds ?? this.contentSelection.builtInSetIds ?? loadedSetIds,
        extraSets: options?.extraSets ?? this.contentSelection.extraSets,
      },
      { showIntroAnimation: true }
    );
  }

  applyResetState(
    newState: GameState,
    runtimeProfileId: string | null,
    contentSelection: RuntimeContentOptions,
    options?: { showIntroAnimation?: boolean }
  ): void {
    this.runtimeProfileId = runtimeProfileId;
    this.contentSelection = contentSelection;
    Object.assign(this.state, newState);
    this.transients.reset();
    this.automation.resetForState(this.isNetworkedMatch());
    this.store.resetDerivedState();
    configurePlayerThemes(buildFactionMap(this.state));
    if (options?.showIntroAnimation !== false) {
      this.pushAnimations([buildMatchIntroAnimation(this.state)]);
    }
    this.notifyListeners();
    this.scheduleAutomationFromCurrentState();
  }

  setViewport(width: number, height: number, scale = 1): void {
    this.transients.setViewport(width, height, scale);
  }

  getViewport(): GameViewport {
    return { ...this.transients.getViewport() };
  }

  rehydrateHotState(): void {
    if (!this.store) {
      this.store = new RuntimeStore();
    }
    this.store.rehydrate();
    if (!this.transients) {
      this.transients = new RuntimeTransients();
    }
    this.transients.rehydrate();
    if (!this.commandExecutor) {
      this.commandExecutor = new RuntimeCommandExecutor(this);
    }
    if (!this.networkController) {
      this.networkController = new RuntimeNetworkSessionController(this);
    }
    this.networkController.rehydrate();
    if (!this.targeting) {
      this.targeting = new RuntimeTargetingController(this, this.transients);
    }
    if (!this.devControls) {
      this.devControls = new RuntimeDevControls(this, this.transients);
    }
    if (!this.automation) {
      this.automation = new RuntimeAutomationController(this);
    }
    this.automation.rehydrate();
    if (!this.renderFrame) {
      this.renderFrame = new RuntimeFrameController(this.state, this.store, this.transients, () => this.updateSystem);
    }
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  subscribeTransient(listener: () => void): () => void {
    return this.store.subscribeTransient(listener);
  }

  getStateVersion(): number {
    return this.store.getStateVersion();
  }

  getTransientVersion(): number {
    return this.store.getTransientVersion();
  }

  getHoveredHex(): HexCoord | null {
    return this.transients.getHoveredHex();
  }

  notifyStateChanged(): void {
    this.store.notifyStateChanged();
  }

  notifyListeners(): void {
    this.notifyStateChanged();
  }

  notifyTransientChanged(): void {
    this.store.notifyTransientChanged();
  }

  pushAnimations(animations: CanvasAnimation[]): void {
    this.transients.pushAnimations(animations);
  }

  getAnimations(): CanvasAnimation[] {
    return this.transients.getAnimations();
  }

  hasActiveAnimations(): boolean {
    return this.transients.hasActiveAnimations();
  }

  dispatch(command: GameCommand): DispatchResult {
    const networkResult = this.networkController.submitOrNull(command, (reason, rejectedCommand) => {
      this.recordNetworkRejection(reason, rejectedCommand);
    });
    if (networkResult) {
      return networkResult;
    }
    return this.dispatchCommand(command);
  }

  private dispatchCommand(command: GameCommand, options?: { scheduleAutomation?: boolean; animate?: boolean }): DispatchResult {
    return this.commandExecutor.dispatchLocal(command, options);
  }

  dispatchLocal(command: GameCommand, options?: { scheduleAutomation?: boolean; animate?: boolean }): DispatchResult {
    return this.dispatchCommand(command, options);
  }

  isBotAutoplayEnabled(playerId: PlayerId): boolean {
    return this.automation.isBotAutoplayEnabled(playerId);
  }

  setBotAutoplayEnabled(playerId: PlayerId, enabled: boolean): void {
    this.automation.setBotAutoplayEnabled(playerId, enabled);
  }

  toggleBotAutoplay(playerId: PlayerId): boolean {
    return this.automation.toggleBotAutoplay(playerId);
  }

  disableBotAutoplay(): void {
    this.automation.disableBotAutoplay();
  }

  getPriorityStopSettings(playerId: PlayerId): PriorityStopSettings {
    return this.automation.getPriorityStopSettings(playerId);
  }

  setPriorityStopSetting(playerId: PlayerId, stopKey: PriorityStopKey, enabled: boolean): void {
    this.automation.setPriorityStopSetting(playerId, stopKey, enabled);
  }

  togglePriorityStopSetting(playerId: PlayerId, stopKey: PriorityStopKey): boolean {
    return this.automation.togglePriorityStopSetting(playerId, stopKey);
  }

  getPendingCardTargeting(): PendingCardTargeting | null {
    return this.transients.getPendingCardTargeting();
  }

  getPendingAttackTargeting(): PendingAttackTargeting | null {
    return this.transients.getPendingAttackTargeting();
  }

  isNetworkedMatch(): boolean {
    return this.networkController.isNetworkedMatch();
  }

  getNetworkLocalPlayerId(): PlayerId | null {
    return this.networkController.getLocalPlayerId();
  }

  getRuntimeProfileId(): string | null {
    return this.runtimeProfileId;
  }

  getContentSelection(): RuntimeContentOptions {
    return this.contentSelection;
  }

  canLocalPlayerActAs(playerId: PlayerId): boolean {
    return this.networkController.canLocalPlayerActAs(playerId);
  }

  startNetworkMatch(
    payload: MatchStartPayload,
    submitCommand: (command: GameCommand) => void,
    options?: {
      showIntroAnimation?: boolean;
      canSubmitCommand?: () => boolean;
      getBlockedReason?: () => string | null;
    }
  ): void {
    this.networkController.startMatch(payload, submitCommand, options);
  }

  leaveNetworkMatch(reason?: string): void {
    this.networkController.leaveMatch(reason);
  }

  applyAuthoritativeCommand(command: GameCommand, options?: { animate?: boolean }): DispatchResult {
    return this.networkController.applyAuthoritativeCommand(command, options);
  }

  recordNetworkRejection(reason: string, rejectedCommand?: GameCommand): void {
    this.state.lastRejectedReason = reason;
    this.state.log.push({
      turn: this.state.turn,
      text: rejectedCommand
        ? `Server rejected ${rejectedCommand.type}: ${reason}`
        : `Network error: ${reason}`,
    });
    this.notifyListeners();
  }

  clearPendingTargeting(): void {
    this.transients.setPendingCardTargeting(null);
    this.transients.setPendingAttackTargeting(null);
  }

  syncPendingAttackTargeting(): void {
    this.targeting.syncPendingAttackTargeting();
  }

  setHoveredHexFromBoardCoord(coord: HexCoord | null): void {
    this.targeting.setHoveredHexFromBoardCoord(coord);
  }

  clearHoveredHex(): void {
    this.targeting.clearHoveredHex();
  }

  selectBoardHex(hoveredHex: HexCoord | null): void {
    this.targeting.selectBoardHex(hoveredHex);
  }

  endPhase(): DispatchResult | null {
    return this.targeting.endPhase();
  }

  passPriority(): DispatchResult | null {
    return this.targeting.passPriority();
  }

  cancelPendingTargeting(): boolean {
    return this.targeting.cancelPendingTargeting();
  }

  beginAttackTargetingForSelectedUnit(): boolean {
    return this.targeting.beginAttackTargetingForSelectedUnit();
  }

  harvestSelectedUnit(): DispatchResult | null {
    return this.targeting.harvestSelectedUnit();
  }

  attackSelectedUnitFirstTargetInRange(): DispatchResult | null {
    return this.targeting.attackSelectedUnitFirstTargetInRange();
  }

  debugAdvancePhase(): void {
    this.devControls.debugAdvancePhase();
  }

  debugSelectFirstActiveUnit(): void {
    this.devControls.debugSelectFirstActiveUnit();
  }

  debugMoveSelectedUnit(deltaQ: number, deltaR: number): void {
    this.devControls.debugMoveSelectedUnit(deltaQ, deltaR);
  }

  debugAttackFirstTargetInRange(): void {
    this.attackSelectedUnitFirstTargetInRange();
  }

  debugHarvestSelectedUnit(): void {
    this.harvestSelectedUnit();
  }

  playCardFromHand(
    cardInstanceId: string,
    targetStackItemId?: string,
    targetEntityId?: string,
    targetHex?: { q: number; r: number }
  ): DispatchResult {
    return this.targeting.playCardFromHand(cardInstanceId, targetStackItemId, targetEntityId, targetHex);
  }

  debugPassPriority(): void {
    this.devControls.debugPassPriority();
  }

  debugAddTestResources(playerId: PlayerId, amount = 100): void {
    this.devControls.debugAddTestResources(playerId, amount);
  }

  debugKillTestUnit(playerId: PlayerId): void {
    this.devControls.debugKillTestUnit(playerId);
  }

  debugWinTestGame(playerId: PlayerId): void {
    this.devControls.debugWinTestGame(playerId);
  }

  debugRespondStack(): void {
    this.devControls.debugRespondStack();
  }

  debugRespondDamageEnemyBase(): void {
    this.devControls.debugRespondDamageEnemyBase();
  }

  debugRespondCounterTopItem(targetStackItemId?: string): void {
    this.devControls.debugRespondCounterTopItem(targetStackItemId);
  }

  getDevControls(): RuntimeDevControls {
    return this.devControls;
  }

  replaceUpdateSystem(update: UpdateSystem): void {
    this.updateSystem = update;
  }

  replaceBotDecisionSystem(system: BotDecisionSystem): void {
    this.automation.replaceBotDecisionSystem(system);
  }

  enableBotDecisionWorker(): void {
    this.automation.enableBotDecisionWorker();
  }

  clearAutomationTimer(): void {
    this.automation.clearTimer();
  }

  scheduleAutomationFromCurrentState(): void {
    this.automation.scheduleFromCurrentState();
  }

  dispose(): void {
    this.automation.dispose();
    this.store.dispose();
    this.networkController.dispose();
    this.transients.reset();
  }

  step(target: GameRenderer, deltaSeconds: number): void {
    this.renderFrame.step(target, deltaSeconds);
  }
}

export function createConfiguredRuntime(options?: RuntimeContentOptions): GameRuntime {
  const { state, runtimeProfileId } = createRuntimeStateFromContent(options);
  return new GameRuntime(state, runtimeProfileId ?? undefined, options);
}

const hotData = (import.meta.hot?.data ?? {}) as RuntimeHotData<GameRuntime>;
let runtime: GameRuntime | undefined = hotData.runtime;

function prepareRuntime(instance: GameRuntime): GameRuntime {
  Object.setPrototypeOf(instance, GameRuntime.prototype);
  instance.rehydrateHotState();
  migrateRuntimeState(instance.state);
  instance.replaceUpdateSystem(updateGame);
  hotData.runtime = instance;
  bindRuntimeToWindow(instance);

  return instance;
}

function createRuntime(): GameRuntime {
  return prepareRuntime(new GameRuntime());
}

if (runtime) {
  runtime = prepareRuntime(runtime);
}

export function getGameRuntime(): GameRuntime {
  runtime ??= createRuntime();
  return runtime;
}

export function peekGameRuntime(): GameRuntime | null {
  return runtime ?? null;
}

export function destroyGameRuntime(): void {
  if (!runtime) {
    bindRuntimeToWindow(undefined);
    hotData.runtime = undefined;
    return;
  }

  runtime.dispose();
  runtime = undefined;
  hotData.runtime = undefined;
  bindRuntimeToWindow(undefined);
}

if (import.meta.hot) {
  import.meta.hot.accept("./systems", (module) => {
    const next = module as typeof import("./systems") | undefined;
    if (!next) {
      return;
    }
    runtime?.replaceUpdateSystem(next.updateGame);
  });

  import.meta.hot.accept("./ai/minimaxBot", (module) => {
    const next = module as typeof import("./ai/minimaxBot") | undefined;
    if (!next) {
      return;
    }
    runtime?.replaceBotDecisionSystem(next.decideMinimaxBotCommand);
    runtime?.enableBotDecisionWorker();
  });

  import.meta.hot.dispose((data: RuntimeHotData<GameRuntime>) => {
    data.runtime = runtime;
  });
}
