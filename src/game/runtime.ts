import type { GameCommand } from "./actions/commands";
import { dispatchCommand, type DispatchResult } from "./actions/reducers";
import type { BotDecisionWorkerRequest, BotDecisionWorkerResponse } from "./ai/botDecisionWorkerProtocol";
import { decideMinimaxBotCommand } from "./ai/minimaxBot";
import MinimaxBotWorker from "./ai/minimaxBot.worker?worker";
import { ensureDefaultContentLoaded, getLoadedContentSetIds, loadConfiguredContentSets, type ContentLoadSelection } from "./content/loader";
import { getCardDefinition } from "./content/cards/catalog";
import {
  findRegisteredRuntimeProfileForMap,
  getDefaultRuntimeProfile,
  getRegisteredMap,
  getRegisteredMaps,
  getRegisteredRuntimeProfile,
  getRegisteredResourceIds,
} from "./content/registry";
import { areSameHex, hexDistance, isWithinMapBounds, pixelToAxial } from "./model/hex";
import { findEntityAtHex } from "./model/queries";
import { createInitialGameState } from "./model/state";
import type { Faction } from "./model/enums";
import type { PlayerId } from "./model/ids";
import { migrateRuntimeState } from "./model/migrations";
import { buildMatchIntroAnimation, buildVictoryAnimation, captureAnimationSnapshot, buildAnimationsFromEvents, stepAnimations } from "./render/animations";
import { configurePlayerThemes } from "./presentation";
import { getHexMetrics } from "./render/layout";
import { renderGame, updateGame } from "./systems";
import { canAttackEntityDirectly } from "./rules/directInteraction";
import { getAutoFlowCommand } from "./turn/autoFlow";
import {
  PRIORITY_STOP_LABELS,
  createDefaultPlayerPriorityStopSettings,
  getPriorityStopWindow,
  type PlayerPriorityStopSettings,
  type PriorityStopKey,
  type PriorityStopSettings,
} from "./turn/priorityStops";
import { createEmptyDerivedState, rebuildDerivedState, type DerivedState } from "./derived";
import type { GameState, HexCoord } from "./model/state";
import type { CanvasAnimation, GameFrame, GameViewport, RenderSystem, UpdateSystem } from "./types";
import { removeEffectsForEntity } from "./systems/continuousEffects";
import { getLegalPlayCardTargetOptions, getPlayCardTargetPrompt, getRequiredPlayCardTargetMode } from "./rules/cardPlayOptions";
import { getDebugStackResponse } from "./registries/debugStackResponses";

const INITIAL_VIEWPORT: GameViewport = {
  width: 1024,
  height: 768,
  scale: 1,
};

const BOT_ACTION_INTERVAL_MS = 160;

type BotDecisionSystem = typeof decideMinimaxBotCommand;

type PendingCardTargeting = {
  playerId: PlayerId;
  cardInstanceId: string;
  cardName: string;
  targetMode: "entity" | "hex";
  targetStackItemId?: string;
  prompt: string;
};

export type RuntimeContentOptions = Omit<ContentLoadSelection, "reset"> & {
  runtimeProfileId?: string;
  mapId?: string;
  factions?: { player_1: Faction; player_2: Faction };
};

function createRuntimeMatchId(matchPrefix: string): string {
  return `match_${matchPrefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .padStart(4, "0")}`;
}

function getDefaultRuntimeMap() {
  ensureDefaultContentLoaded();
  const runtimeProfile = getDefaultRuntimeProfile();
  if (runtimeProfile) {
    const runtimeMap = getRegisteredMap(runtimeProfile.defaultMapId);
    if (!runtimeMap) {
      throw new Error(`Missing default runtime map ${runtimeProfile.defaultMapId} for runtime profile ${runtimeProfile.id}.`);
    }
    return runtimeMap;
  }

  const fallbackMap = Object.values(getRegisteredMaps())
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!fallbackMap) {
    throw new Error("Missing registered runtime maps.");
  }
  return fallbackMap;
}

function requireRuntimeMap(mapId: string) {
  const map = getRegisteredMap(mapId);
  if (!map) {
    throw new Error(`Missing registered map ${mapId}.`);
  }
  return map;
}

function resolveRuntimeProfileId(selection?: RuntimeContentOptions, fallbackRuntimeProfileId?: string | null, fallbackMapId?: string): string | null {
  if (selection?.runtimeProfileId) {
    const explicitProfile = getRegisteredRuntimeProfile(selection.runtimeProfileId);
    if (!explicitProfile) {
      throw new Error(`Missing registered runtime profile ${selection.runtimeProfileId}.`);
    }
    return explicitProfile.id;
  }

  if (selection?.mapId) {
    return findRegisteredRuntimeProfileForMap(selection.mapId)?.id ?? getDefaultRuntimeProfile()?.id ?? null;
  }

  if (fallbackRuntimeProfileId) {
    return getRegisteredRuntimeProfile(fallbackRuntimeProfileId)?.id ?? null;
  }

  if (fallbackMapId) {
    return findRegisteredRuntimeProfileForMap(fallbackMapId)?.id ?? getDefaultRuntimeProfile()?.id ?? null;
  }

  return getDefaultRuntimeProfile()?.id ?? null;
}

function createRuntimeStateFromContent(
  selection?: RuntimeContentOptions,
  fallbackRuntimeProfileId?: string | null,
  fallbackMapId?: string
): { state: GameState; runtimeProfileId: string | null; loadedSetIds: string[] } {
  loadConfiguredContentSets({
    builtInSetIds: selection?.builtInSetIds,
    extraSets: selection?.extraSets,
    reset: true,
  });

  const runtimeProfileId = resolveRuntimeProfileId(selection, fallbackRuntimeProfileId, fallbackMapId);
  const runtimeProfile = runtimeProfileId ? getRegisteredRuntimeProfile(runtimeProfileId) : null;
  const map =
    selection?.mapId
      ? requireRuntimeMap(selection.mapId)
      : runtimeProfile
        ? requireRuntimeMap(runtimeProfile.defaultMapId)
        : fallbackMapId
          ? requireRuntimeMap(fallbackMapId)
          : getDefaultRuntimeMap();

  return {
    state: createInitialGameState({
      map,
      runtimeProfileId: runtimeProfile?.id ?? undefined,
      matchId: createRuntimeMatchId(runtimeProfile?.matchIdPrefix ?? map.id),
      randomSource: () => Math.random(),
      factions: selection?.factions,
    }),
    runtimeProfileId: runtimeProfile?.id ?? findRegisteredRuntimeProfileForMap(map.id)?.id ?? null,
    loadedSetIds: getLoadedContentSetIds(),
  };
}

function createDefaultRuntimeState(): GameState {
  return createRuntimeStateFromContent().state;
}

function getSelectedActiveUnit(state: GameState) {
  if (!state.selectedEntityId) {
    return null;
  }

  const entity = state.entities[state.selectedEntityId];
  if (!entity || entity.kind !== "unit" || entity.ownerId !== state.activePlayerId) {
    return null;
  }

  return entity;
}

export function getBoardClickCommand(state: GameState, clickedHex: { q: number; r: number } | null): GameCommand | null {
  if (!clickedHex) {
    if (!state.selectedEntityId) {
      return null;
    }

    return {
      type: "CLEAR_SELECTION",
      playerId: state.activePlayerId,
      reason: "clicked_outside_map",
    };
  }

  const clickedEntity = findEntityAtHex(state, clickedHex);
  if (clickedEntity?.kind === "unit" && clickedEntity.ownerId === state.activePlayerId) {
    if (state.selectedEntityId === clickedEntity.id) {
      return {
        type: "CLEAR_SELECTION",
        playerId: state.activePlayerId,
        reason: "clicked_selected_unit",
      };
    }

    return {
      type: "SELECT_ENTITY",
      playerId: state.activePlayerId,
      entityId: clickedEntity.id,
    };
  }

  const selectedUnit = getSelectedActiveUnit(state);
  if (selectedUnit && !clickedEntity && state.phase === "tactical") {
    return {
      type: "MOVE_UNIT",
      playerId: state.activePlayerId,
      entityId: selectedUnit.id,
      to: clickedHex,
    };
  }

  if (!state.selectedEntityId) {
    return null;
  }

  return {
    type: "CLEAR_SELECTION",
    playerId: state.activePlayerId,
    reason: "clicked_empty_or_enemy_tile",
  };
}

export class GameRuntime {
  private viewport: GameViewport = { ...INITIAL_VIEWPORT };
  private updateSystem: UpdateSystem = updateGame;
  private renderSystem: RenderSystem = renderGame;
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
  private animations: CanvasAnimation[] = [];
  private botAutoplayEnabled: Record<PlayerId, boolean> = {
    player_1: false,
    player_2: true,
  };
  private priorityStopSettings: PlayerPriorityStopSettings = createDefaultPlayerPriorityStopSettings();
  private consumedPriorityStopKeys: Set<string> = new Set();
  private pendingCardTargeting: PendingCardTargeting | null = null;
  private listeners: Set<() => void> = new Set();
  private transientListeners: Set<() => void> = new Set();
  private stateVersion = 0;
  private transientVersion = 0;
  private derivedState: DerivedState = createEmptyDerivedState();
  private runtimeProfileId: string | null = null;
  private hoveredHex: HexCoord | null = null;
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
    migrateRuntimeState(this.state);
    this.runtimeProfileId = runtimeProfileId ?? findRegisteredRuntimeProfileForMap(this.state.map.id)?.id ?? getDefaultRuntimeProfile()?.id ?? null;
    this.contentSelection = contentSelection ?? {
      builtInSetIds: getLoadedContentSetIds(),
    };
    this.rehydrateHotState();
    configurePlayerThemes({
      player_1: this.state.players.player_1.faction,
      player_2: this.state.players.player_2.faction,
    });
    this.pushAnimations([buildMatchIntroAnimation(this.state)]);
    this.scheduleAutomationFromCurrentState();
  }

  resetWithFactions(factions: { player_1: Faction; player_2: Faction }): void {
    this.resetWithContent({
      builtInSetIds: this.contentSelection.builtInSetIds,
      extraSets: this.contentSelection.extraSets,
      runtimeProfileId: this.runtimeProfileId ?? undefined,
      mapId: this.state.map.id,
      factions,
    });
  }

  resetWithContent(options?: RuntimeContentOptions): void {
    const { state: newState, runtimeProfileId, loadedSetIds } = createRuntimeStateFromContent(
      {
        builtInSetIds: options?.builtInSetIds ?? this.contentSelection.builtInSetIds,
        extraSets: options?.extraSets ?? this.contentSelection.extraSets,
        runtimeProfileId: options?.runtimeProfileId,
        mapId: options?.mapId,
        factions: options?.factions,
      },
      this.runtimeProfileId,
      this.state.map.id
    );

    this.runtimeProfileId = runtimeProfileId;
    this.contentSelection = {
      builtInSetIds: options?.builtInSetIds ?? this.contentSelection.builtInSetIds ?? loadedSetIds,
      extraSets: options?.extraSets ?? this.contentSelection.extraSets,
    };
    Object.assign(this.state, newState);
    this.clearAutomationTimer();
    this.resetBotDecisionWorker();
    this.botDecisionWorkerFailed = false;
    this.animations = [];
    this.botActionReadyAtMs = 0;
    this.pendingCardTargeting = null;
    this.hoveredHex = null;
    this.consumedPriorityStopKeys = new Set();
    this.derivedState = createEmptyDerivedState();
    configurePlayerThemes({
      player_1: this.state.players.player_1.faction,
      player_2: this.state.players.player_2.faction,
    });
    this.pushAnimations([buildMatchIntroAnimation(this.state)]);
    this.notifyListeners();
    this.scheduleAutomationFromCurrentState();
  }

  setViewport(width: number, height: number, scale = 1): void {
    this.viewport.width = width;
    this.viewport.height = height;
    this.viewport.scale = scale;
  }

  rehydrateHotState(): void {
    if (!Array.isArray(this.animations)) {
      this.animations = [];
    }
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
    if (!this.botAutoplayEnabled) {
      this.botAutoplayEnabled = {
        player_1: false,
        player_2: true,
      };
    }
    if (!this.priorityStopSettings) {
      this.priorityStopSettings = createDefaultPlayerPriorityStopSettings();
    } else {
      const defaults = createDefaultPlayerPriorityStopSettings();
      this.priorityStopSettings = {
        player_1: { ...defaults.player_1, ...this.priorityStopSettings.player_1 },
        player_2: { ...defaults.player_2, ...this.priorityStopSettings.player_2 },
      };
    }
    if (!(this.consumedPriorityStopKeys instanceof Set)) {
      this.consumedPriorityStopKeys = new Set();
    }
    if (!this.pendingCardTargeting) {
      this.pendingCardTargeting = null;
    } else if (!this.pendingCardTargeting.targetMode) {
      this.pendingCardTargeting = null;
    }
    if (!this.listeners) {
      this.listeners = new Set();
    }
    if (!this.transientListeners) {
      this.transientListeners = new Set();
    }
    if (typeof this.stateVersion !== "number") {
      this.stateVersion = 0;
    }
    if (typeof this.transientVersion !== "number") {
      this.transientVersion = 0;
    }
    if (typeof this.hoveredHex === "undefined") {
      this.hoveredHex = null;
    }
    if (!this.derivedState || typeof this.derivedState.sourceVersion !== "number") {
      this.derivedState = createEmptyDerivedState();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeTransient(listener: () => void): () => void {
    this.transientListeners.add(listener);
    return () => this.transientListeners.delete(listener);
  }

  getStateVersion(): number {
    return this.stateVersion;
  }

  getTransientVersion(): number {
    return this.transientVersion;
  }

  getHoveredHex(): HexCoord | null {
    return this.hoveredHex ? { ...this.hoveredHex } : null;
  }

  private notifyListeners(): void {
    this.stateVersion++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private notifyTransientListeners(): void {
    this.transientVersion++;
    for (const listener of this.transientListeners) {
      listener();
    }
  }

  private setHoveredHex(next: HexCoord | null): boolean {
    if (next?.q === this.hoveredHex?.q && next?.r === this.hoveredHex?.r) {
      return false;
    }
    this.hoveredHex = next ? { ...next } : null;
    this.notifyTransientListeners();
    return true;
  }

  private pushAnimations(animations: CanvasAnimation[]): void {
    if (animations.length === 0) {
      return;
    }

    this.animations.push(...animations);
    if (this.animations.length > 32) {
      this.animations = this.animations.slice(-32);
    }
  }

  getAnimations(): CanvasAnimation[] {
    return this.animations;
  }

  hasActiveAnimations(): boolean {
    return this.animations.length > 0;
  }

  dispatch(command: GameCommand): DispatchResult {
    return this.dispatchCommand(command);
  }

  private dispatchCommand(command: GameCommand, options?: { scheduleAutomation?: boolean }): DispatchResult {
    const before = captureAnimationSnapshot(this.state);
    const result = dispatchCommand(this.state, command);
    if (result.ok && result.events.length > 0) {
      this.pushAnimations(buildAnimationsFromEvents(result.events, before, this.state));
    }
    this.notifyListeners();
    if (result.ok && options?.scheduleAutomation !== false) {
      this.scheduleAutomationFromCurrentState();
    }
    return result;
  }

  isBotAutoplayEnabled(playerId: PlayerId): boolean {
    return this.botAutoplayEnabled[playerId];
  }

  setBotAutoplayEnabled(playerId: PlayerId, enabled: boolean): void {
    this.botAutoplayEnabled[playerId] = enabled;
    this.state.log.push({
      turn: this.state.turn,
      text: `${playerId} bot autopilot ${enabled ? "enabled" : "disabled"}.`,
    });
    this.notifyListeners();
    this.scheduleAutomationFromCurrentState();
  }

  toggleBotAutoplay(playerId: PlayerId): boolean {
    const next = !this.botAutoplayEnabled[playerId];
    this.setBotAutoplayEnabled(playerId, next);
    return next;
  }

  getPriorityStopSettings(playerId: PlayerId): PriorityStopSettings {
    return { ...this.priorityStopSettings[playerId] };
  }

  setPriorityStopSetting(playerId: PlayerId, stopKey: PriorityStopKey, enabled: boolean): void {
    this.priorityStopSettings[playerId] = {
      ...this.priorityStopSettings[playerId],
      [stopKey]: enabled,
    };
    this.state.log.push({
      turn: this.state.turn,
      text: `${playerId} ${enabled ? "enabled" : "disabled"} ${PRIORITY_STOP_LABELS[stopKey]}.`,
    });
    this.notifyListeners();
  }

  togglePriorityStopSetting(playerId: PlayerId, stopKey: PriorityStopKey): boolean {
    const next = !this.priorityStopSettings[playerId][stopKey];
    this.setPriorityStopSetting(playerId, stopKey, next);
    return next;
  }

  getPendingCardTargeting(): PendingCardTargeting | null {
    return this.pendingCardTargeting ? { ...this.pendingCardTargeting } : null;
  }

  private clearPendingCardTargeting(logText?: string): void {
    if (!this.pendingCardTargeting) {
      return;
    }
    if (logText) {
      this.state.log.push({
        turn: this.state.turn,
        text: logText,
      });
    }
    this.pendingCardTargeting = null;
  }

  private findResourceNodeAtHex(coord: { q: number; r: number }): GameState["map"]["resourceNodes"][number] | undefined {
    return this.state.map.resourceNodes.find((node) => areSameHex(node.coord, coord));
  }

  private getHexAtScreenPoint(pixelX: number, pixelY: number): { q: number; r: number } | null {
    const metrics = getHexMetrics(this.viewport, this.state.map);
    const hoveredHex = pixelToAxial({ x: pixelX, y: pixelY }, metrics.origin, metrics.size);
    if (!isWithinMapBounds(hoveredHex, this.state.map)) {
      return null;
    }
    return hoveredHex;
  }

  setHoveredHexFromScreenPoint(pixelX: number, pixelY: number): void {
    const next = this.getHexAtScreenPoint(pixelX, pixelY);
    this.setHoveredHex(next);
  }

  clearHoveredHex(): void {
    this.setHoveredHex(null);
  }

  selectUnitFromScreenPoint(pixelX: number, pixelY: number): void {
    const hoveredHex = this.getHexAtScreenPoint(pixelX, pixelY);
    this.setHoveredHex(hoveredHex);
    if (this.pendingCardTargeting) {
      if (!hoveredHex) {
        this.clearPendingCardTargeting(`Cancelled targeting for ${this.pendingCardTargeting.cardName}.`);
        this.notifyListeners();
        return;
      }

      const pending = this.pendingCardTargeting;
      let result: DispatchResult;
      if (pending.targetMode === "entity") {
        const targetEntity = findEntityAtHex(this.state, hoveredHex);
        if (!targetEntity) {
          this.clearPendingCardTargeting(`Cancelled targeting for ${pending.cardName}.`);
          this.notifyListeners();
          return;
        }

        result = this.dispatch({
          type: "PLAY_CARD",
          playerId: pending.playerId,
          cardInstanceId: pending.cardInstanceId,
          targetStackItemId: pending.targetStackItemId,
          targetEntityId: targetEntity.id,
        });
      } else {
        result = this.dispatch({
          type: "PLAY_CARD",
          playerId: pending.playerId,
          cardInstanceId: pending.cardInstanceId,
          targetStackItemId: pending.targetStackItemId,
          targetHex: hoveredHex,
        });
      }
      if (result.ok) {
        this.pendingCardTargeting = null;
      }
      return;
    }

    const command = getBoardClickCommand(this.state, hoveredHex);
    if (!command) {
      this.notifyListeners();
      return;
    }
    void this.dispatch(command);
  }

  debugAdvancePhase(): void {
    void this.dispatch({
      type: "END_PHASE",
      playerId: this.state.activePlayerId,
    });
  }

  debugSelectFirstActiveUnit(): void {
    const activePlayerId = this.state.activePlayerId;
    const firstUnit = Object.values(this.state.entities).find(
      (entity) => entity.kind === "unit" && entity.ownerId === activePlayerId
    );

    if (!firstUnit) {
      return;
    }

    void this.dispatch({
      type: "SELECT_ENTITY",
      playerId: activePlayerId,
      entityId: firstUnit.id,
    });
  }

  debugMoveSelectedUnit(deltaQ: number, deltaR: number): void {
    const activePlayerId = this.state.activePlayerId;
    const selectedId = this.state.selectedEntityId;
    if (!selectedId) {
      return;
    }

    const selected = this.state.entities[selectedId];
    if (!selected || selected.kind !== "unit") {
      return;
    }

    void this.dispatch({
      type: "MOVE_UNIT",
      playerId: activePlayerId,
      entityId: selected.id,
      to: {
        q: selected.coord.q + deltaQ,
        r: selected.coord.r + deltaR,
      },
    });
  }

  debugAttackFirstTargetInRange(): void {
    const activePlayerId = this.state.activePlayerId;
    const selectedId = this.state.selectedEntityId;
    if (!selectedId) {
      return;
    }

    const attacker = this.state.entities[selectedId];
    if (!attacker || attacker.kind !== "unit") {
      return;
    }

    const target = Object.values(this.state.entities).find((entity) => {
      if (entity.ownerId === activePlayerId) {
        return false;
      }
      return canAttackEntityDirectly(this.state, activePlayerId, entity) && hexDistance(attacker.coord, entity.coord) <= attacker.attackRange;
    });

    if (!target) {
      return;
    }

    void this.dispatch({
      type: "ATTACK_UNIT",
      playerId: activePlayerId,
      attackerId: attacker.id,
      targetId: target.id,
    });
  }

  debugHarvestSelectedUnit(): void {
    const activePlayerId = this.state.activePlayerId;
    const selectedId = this.state.selectedEntityId;
    if (!selectedId) {
      return;
    }

    const selected = this.state.entities[selectedId];
    if (!selected || selected.kind !== "unit" || selected.ownerId !== activePlayerId || selected.role !== "resource") {
      return;
    }

    const node = this.findResourceNodeAtHex(selected.coord);
    if (!node) {
      return;
    }

    void this.dispatch({
      type: "HARVEST_NODE",
      playerId: activePlayerId,
      entityId: selected.id,
      nodeId: node.id,
    });
  }

  playCardFromHand(
    cardInstanceId: string,
    targetStackItemId?: string,
    targetEntityId?: string,
    targetHex?: { q: number; r: number }
  ): DispatchResult {
    if (this.state.phase === "discard") {
      this.pendingCardTargeting = null;
      return this.dispatch({
        type: "DISCARD_CARD",
        playerId: this.state.activePlayerId,
        cardInstanceId,
      });
    }

    const playerId = this.state.priorityPlayerId ?? this.state.activePlayerId;
    const handCard = this.state.zones[playerId].hand.find((card) => card.instanceId === cardInstanceId);
    const definition = handCard ? getCardDefinition(handCard.cardId) : undefined;
    const cardName = definition?.name ?? handCard?.cardId ?? cardInstanceId;
    const pendingTargetMode = definition ? getRequiredPlayCardTargetMode(definition) : null;
    const hasExplicitTarget =
      (pendingTargetMode === "entity" && Boolean(targetEntityId)) ||
      (pendingTargetMode === "hex" && Boolean(targetHex));

    if (pendingTargetMode && !hasExplicitTarget) {
      const legalTargets = definition
        ? getLegalPlayCardTargetOptions(this.state, playerId, cardInstanceId, definition)
        : [];
      if (legalTargets.length === 0) {
        return this.dispatch({
          type: "PLAY_CARD",
          playerId,
          cardInstanceId,
          targetStackItemId,
        });
      }

      const prompt = getPlayCardTargetPrompt(cardName, definition!);
      this.pendingCardTargeting = {
        playerId,
        cardInstanceId,
        cardName,
        targetMode: pendingTargetMode,
        targetStackItemId,
        prompt,
      };
      this.state.log.push({
        turn: this.state.turn,
        text: prompt,
      });
      this.notifyListeners();
      return {
        ok: true,
        events: [],
      };
    }

    const result = this.dispatch({
      type: "PLAY_CARD",
      playerId,
      cardInstanceId,
      targetStackItemId,
      targetEntityId,
      targetHex,
    });
    if (result.ok) {
      this.pendingCardTargeting = null;
    }
    return result;
  }

  debugPassPriority(): void {
    const priorityPlayerId = this.state.priorityPlayerId;
    if (!priorityPlayerId) {
      return;
    }

    void this.dispatch({
      type: "PASS_PRIORITY",
      playerId: priorityPlayerId,
    });
  }

  debugAddTestResources(playerId: PlayerId, amount = 100): void {
    const pool = this.state.players[playerId].resources;
    for (const resource of getRegisteredResourceIds()) {
      pool[resource] += amount;
    }

    this.state.log.push({
      turn: this.state.turn,
      text: `${playerId} gained ${amount} of each resource for testing.`,
    });
    this.notifyListeners();
    this.scheduleAutomationFromCurrentState();
  }

  debugKillTestUnit(playerId: PlayerId): void {
    const selected = this.state.selectedEntityId ? this.state.entities[this.state.selectedEntityId] : null;
    const target =
      selected && selected.kind === "unit" && selected.ownerId === playerId
        ? selected
        : Object.values(this.state.entities).find((entity) => entity.kind === "unit" && entity.ownerId === playerId);

    if (!target || target.kind !== "unit") {
      return;
    }

    const before = captureAnimationSnapshot(this.state);

    if (target.carries) {
      this.state.log.push({
        turn: this.state.turn,
        text: `${target.id} was destroyed and cargo lost (${target.carries}).`,
      });
    }
    if (this.state.selectedEntityId === target.id) {
      this.state.selectedEntityId = null;
    }
    removeEffectsForEntity(this.state, target.id);
    delete this.state.entities[target.id];
    this.state.log.push({
      turn: this.state.turn,
      text: `${playerId} debug-killed ${target.id}.`,
    });

    this.pushAnimations(buildAnimationsFromEvents([], before, this.state));
    this.notifyListeners();
    this.scheduleAutomationFromCurrentState();
  }

  debugWinTestGame(playerId: PlayerId): void {
    const before = captureAnimationSnapshot(this.state);
    const replayVictoryOnly = this.state.winner === playerId;

    this.state.winner = playerId;
    this.state.log.push({
      turn: this.state.turn,
      text: `${playerId} claimed victory for testing.`,
    });

    if (replayVictoryOnly) {
      this.pushAnimations([buildVictoryAnimation(this.state, playerId)]);
    } else {
      this.pushAnimations(buildAnimationsFromEvents([], before, this.state));
    }
    this.notifyListeners();
    this.scheduleAutomationFromCurrentState();
  }

  debugRespondStack(): void {
    const priorityPlayerId = this.state.priorityPlayerId;
    if (!priorityPlayerId) {
      return;
    }

    const response = getDebugStackResponse("noop_response");
    if (!response) {
      return;
    }

    void this.dispatch({
      type: "RESPOND_STACK",
      playerId: priorityPlayerId,
      label: response.label,
      effectId: response.effectId,
      targetStackItemId: response.getTargetStackItemId?.(this.state) ?? undefined,
    });
  }

  debugRespondDamageEnemyBase(): void {
    const priorityPlayerId = this.state.priorityPlayerId;
    if (!priorityPlayerId) {
      return;
    }

    const response = getDebugStackResponse("base_strike");
    if (!response) {
      return;
    }

    void this.dispatch({
      type: "RESPOND_STACK",
      playerId: priorityPlayerId,
      label: response.label,
      effectId: response.effectId,
      targetStackItemId: response.getTargetStackItemId?.(this.state) ?? undefined,
    });
  }

  debugRespondCounterTopItem(targetStackItemId?: string): void {
    const priorityPlayerId = this.state.priorityPlayerId;
    if (!priorityPlayerId) {
      return;
    }

    const response = getDebugStackResponse("counter_top_item");
    if (!response) {
      return;
    }

    const resolvedTargetId = targetStackItemId ?? response.getTargetStackItemId?.(this.state) ?? undefined;

    void this.dispatch({
      type: "RESPOND_STACK",
      playerId: priorityPlayerId,
      label: response.label,
      effectId: response.effectId,
      targetStackItemId: resolvedTargetId,
    });
  }

  replaceSystems(update: UpdateSystem, render: RenderSystem): void {
    this.updateSystem = update;
    this.renderSystem = render;
  }

  replaceBotDecisionSystem(system: BotDecisionSystem): void {
    this.resetBotDecisionWorker();
    this.botDecisionSystem = system;
    this.botDecisionWorkerEnabled = false;
  }

  private shouldUseBotDecisionWorker(): boolean {
    return this.botDecisionWorkerEnabled && !this.botDecisionWorkerFailed && typeof Worker !== "undefined";
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
      this.state.log.push({
        turn: this.state.turn,
        text: "Bot worker failed; falling back to main-thread decisions.",
      });
      this.notifyListeners();
      this.scheduleAutomationFromCurrentState();
    };

    this.botDecisionWorker = worker;
    return worker;
  }

  private cancelStaleBotDecisionRequest(): void {
    if (this.pendingBotDecisionRequestId === null) {
      return;
    }

    if (this.pendingBotDecisionStateVersion === this.stateVersion) {
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
    this.pendingBotDecisionStateVersion = this.stateVersion;
    const request: BotDecisionWorkerRequest = {
      type: "decide",
      requestId,
      stateVersion: this.stateVersion,
      playerId: priorityPlayerId,
      state: this.state,
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
      this.state.log.push({
        turn: this.state.turn,
        text: `Bot worker error: ${response.message}`,
      });
      this.notifyListeners();
      this.botActionReadyAtMs = Date.now() + BOT_ACTION_INTERVAL_MS * 2;
      this.scheduleAutomationFromCurrentState();
      return;
    }

    if (response.stateVersion !== this.stateVersion) {
      this.scheduleAutomationFromCurrentState();
      return;
    }

    if (this.state.winner || this.state.priorityPlayerId !== response.playerId || !this.botAutoplayEnabled[response.playerId]) {
      this.scheduleAutomationFromCurrentState();
      return;
    }

    if (!response.command) {
      return;
    }

    const result = this.dispatchCommand(response.command, { scheduleAutomation: false });
    this.botActionReadyAtMs = Date.now() + (result.ok ? BOT_ACTION_INTERVAL_MS : BOT_ACTION_INTERVAL_MS * 2);
    this.scheduleAutomationFromCurrentState();
  }

  enableBotDecisionWorker(): void {
    this.botDecisionWorkerEnabled = true;
    this.botDecisionWorkerFailed = false;
    this.resetBotDecisionWorker();
  }

  private clearAutomationTimer(): void {
    if (this.automationTimer !== null) {
      clearTimeout(this.automationTimer);
      this.automationTimer = null;
    }
    this.automationTimerDueAtMs = 0;
  }

  private scheduleAutomation(delayMs: number): void {
    if (this.state.winner) {
      this.clearAutomationTimer();
      return;
    }

    const clampedDelay = Math.max(0, Math.floor(delayMs));
    const dueAtMs = Date.now() + clampedDelay;
    if (this.automationTimer && this.automationTimerDueAtMs <= dueAtMs) {
      return;
    }

    this.clearAutomationTimer();
    this.automationTimerDueAtMs = dueAtMs;
    this.automationTimer = setTimeout(() => {
      this.automationTimer = null;
      this.automationTimerDueAtMs = 0;
      this.runAutomationTick();
    }, clampedDelay);
  }

  private scheduleAutomationFromCurrentState(): void {
    this.clearAutomationTimer();
    this.cancelStaleBotDecisionRequest();

    if (this.state.winner) {
      return;
    }

    if (getAutoFlowCommand(this.state)) {
      this.scheduleAutomation(0);
      return;
    }

    const priorityPlayerId = this.state.priorityPlayerId;
    if (!priorityPlayerId || !this.botAutoplayEnabled[priorityPlayerId]) {
      return;
    }

    const remainingDelayMs = Math.max(0, this.botActionReadyAtMs - Date.now());
    this.scheduleAutomation(remainingDelayMs);
  }

  private getPendingPriorityStopWindow() {
    const window = getPriorityStopWindow(this.state, this.botAutoplayEnabled, this.priorityStopSettings);
    if (!window || this.consumedPriorityStopKeys.has(window.key)) {
      return null;
    }
    return window;
  }

  private runAutomationTick(): void {
    if (this.state.winner) {
      return;
    }

    const autoFlowCommand = getAutoFlowCommand(this.state);
    if (autoFlowCommand) {
      void this.dispatchCommand(autoFlowCommand, { scheduleAutomation: true });
      return;
    }

    const priorityPlayerId = this.state.priorityPlayerId;
    if (!priorityPlayerId || !this.botAutoplayEnabled[priorityPlayerId]) {
      return;
    }

    const remainingDelayMs = this.botActionReadyAtMs - Date.now();
    if (remainingDelayMs > 0) {
      this.scheduleAutomation(remainingDelayMs);
      return;
    }

    const priorityStopWindow = this.getPendingPriorityStopWindow();
    if (priorityStopWindow) {
      this.consumedPriorityStopKeys.add(priorityStopWindow.key);
      this.state.log.push({
        turn: this.state.turn,
        text: `Priority stop ${PRIORITY_STOP_LABELS[priorityStopWindow.stopKey]}: ${priorityStopWindow.priorityPlayerId} yielded to ${priorityStopWindow.yieldedToPlayerId}.`,
      });
      const result = this.dispatchCommand(
        {
          type: "PASS_PRIORITY",
          playerId: priorityStopWindow.priorityPlayerId,
        },
        { scheduleAutomation: false }
      );
      this.botActionReadyAtMs = Date.now() + (result.ok ? BOT_ACTION_INTERVAL_MS : BOT_ACTION_INTERVAL_MS * 2);
      this.scheduleAutomationFromCurrentState();
      return;
    }

    if (this.requestBotDecision(priorityPlayerId)) {
      return;
    }

    const command = this.botDecisionSystem(this.state, priorityPlayerId);
    if (!command) {
      return;
    }

    const result = this.dispatchCommand(command, { scheduleAutomation: false });
    this.botActionReadyAtMs = Date.now() + (result.ok ? BOT_ACTION_INTERVAL_MS : BOT_ACTION_INTERVAL_MS * 2);
    this.scheduleAutomationFromCurrentState();
  }

  step(context: CanvasRenderingContext2D, deltaSeconds: number): void {
    this.animations = stepAnimations(this.animations, deltaSeconds);

    if (this.stateVersion > this.derivedState.sourceVersion) {
      this.derivedState = rebuildDerivedState(this.state, this.stateVersion);
    }

    const frame: GameFrame = {
      context,
      viewport: this.viewport,
      deltaSeconds,
      transients: {
        animations: this.animations,
        hoveredHex: this.hoveredHex,
      },
      derived: this.derivedState,
    };

    this.updateSystem(this.state, frame);
    this.renderSystem(this.state, frame);
  }
}

export function createConfiguredRuntime(options?: RuntimeContentOptions): GameRuntime {
  const { state, runtimeProfileId } = createRuntimeStateFromContent(options);
  return new GameRuntime(state, runtimeProfileId ?? undefined, options);
}

type RuntimeHotData = {
  runtime?: GameRuntime;
};

const hotData = (import.meta.hot?.data ?? {}) as RuntimeHotData;
const runtime = hotData.runtime ?? new GameRuntime();
Object.setPrototypeOf(runtime, GameRuntime.prototype);
runtime.rehydrateHotState();
migrateRuntimeState(runtime.state);

runtime.replaceSystems(updateGame, renderGame);

export function getGameRuntime(): GameRuntime {
  return runtime;
}

if (import.meta.hot) {
  import.meta.hot.accept("./systems", (module) => {
    const next = module as typeof import("./systems") | undefined;
    if (!next) {
      return;
    }
    runtime.replaceSystems(next.updateGame, next.renderGame);
  });

  import.meta.hot.accept("./ai/minimaxBot", (module) => {
    const next = module as typeof import("./ai/minimaxBot") | undefined;
    if (!next) {
      return;
    }
    runtime.replaceBotDecisionSystem(next.decideMinimaxBotCommand);
    runtime.enableBotDecisionWorker();
  });

  import.meta.hot.dispose((data: RuntimeHotData) => {
    data.runtime = runtime;
  });
}
