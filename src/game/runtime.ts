import type { GameCommand } from "./actions/commands";
import { dispatchCommand, type DispatchResult } from "./actions/reducers";
import { decideMvpBotCommand } from "./ai/mvpBot";
import { ensureBaseContentLoaded } from "./content/loader";
import { getCardDefinition } from "./content/cards/catalog";
import { getDefaultRuntimeProfile, getRegisteredMap, getRegisteredMaps, getRegisteredResourceIds } from "./content/registry";
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
import type { GameState } from "./model/state";
import type { CanvasAnimation, GameFrame, GameViewport, RenderSystem, UpdateSystem } from "./types";
import { removeEffectsForEntity } from "./systems/continuousEffects";
import { getLegalPlayCardTargetOptions, getPlayCardTargetPrompt, getRequiredPlayCardTargetMode } from "./rules/cardPlayOptions";
import { getDebugStackResponse } from "./registries/debugStackResponses";

const INITIAL_VIEWPORT: GameViewport = {
  width: 1024,
  height: 768,
};

const BOT_ACTION_INTERVAL_SECONDS = 0.16;

type BotDecisionSystem = typeof decideMvpBotCommand;

type PendingCardTargeting = {
  playerId: PlayerId;
  cardInstanceId: string;
  cardName: string;
  targetMode: "entity" | "hex";
  targetStackItemId?: string;
  prompt: string;
};

function createRuntimeMatchId(matchPrefix: string): string {
  return `match_${matchPrefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .padStart(4, "0")}`;
}

function getDefaultRuntimeMap() {
  ensureBaseContentLoaded();
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

function createDefaultRuntimeState(): GameState {
  const map = getDefaultRuntimeMap();
  const runtimeProfile = getDefaultRuntimeProfile();
  return createInitialGameState({
    map,
    matchId: createRuntimeMatchId(runtimeProfile?.matchIdPrefix ?? map.id),
    randomSource: () => Math.random(),
  });
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
  private botDecisionSystem: BotDecisionSystem = decideMvpBotCommand;
  private botActionCooldownSeconds = 0;
  private elapsedSeconds = 0;
  private animations: CanvasAnimation[] = [];
  private botAutoplayEnabled: Record<PlayerId, boolean> = {
    player_1: false,
    player_2: true,
  };
  private priorityStopSettings: PlayerPriorityStopSettings = createDefaultPlayerPriorityStopSettings();
  private consumedPriorityStopKeys: Set<string> = new Set();
  private pendingCardTargeting: PendingCardTargeting | null = null;
  private listeners: Set<() => void> = new Set();
  private stateVersion = 0;
  private derivedState: DerivedState = createEmptyDerivedState();
  readonly state: GameState;

  constructor(
    state: GameState = createDefaultRuntimeState()
  ) {
    this.state = state;
    migrateRuntimeState(this.state);
    this.rehydrateHotState();
    configurePlayerThemes({
      player_1: this.state.players.player_1.faction,
      player_2: this.state.players.player_2.faction,
    });
    this.pushAnimations([buildMatchIntroAnimation(this.state)]);
  }

  resetWithFactions(factions: { player_1: Faction; player_2: Faction }): void {
    const newState = createInitialGameState({
      map: this.state.map,
      matchId: createRuntimeMatchId(this.state.map.id),
      randomSource: () => Math.random(),
      factions,
    });
    Object.assign(this.state, newState);
    this.animations = [];
    this.elapsedSeconds = 0;
    this.botActionCooldownSeconds = 0;
    this.pendingCardTargeting = null;
    this.consumedPriorityStopKeys = new Set();
    this.derivedState = createEmptyDerivedState();
    configurePlayerThemes(factions);
    this.pushAnimations([buildMatchIntroAnimation(this.state)]);
    this.notifyListeners();
  }

  setViewport(width: number, height: number): void {
    this.viewport.width = width;
    this.viewport.height = height;
  }

  rehydrateHotState(): void {
    if (!Array.isArray(this.animations)) {
      this.animations = [];
    }
    if (typeof this.elapsedSeconds !== "number") {
      this.elapsedSeconds = 0;
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
    if (typeof this.stateVersion !== "number") {
      this.stateVersion = 0;
    }
    if (!this.derivedState || typeof this.derivedState.sourceVersion !== "number") {
      this.derivedState = createEmptyDerivedState();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStateVersion(): number {
    return this.stateVersion;
  }

  private notifyListeners(): void {
    this.stateVersion++;
    for (const listener of this.listeners) {
      listener();
    }
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

  dispatch(command: GameCommand): DispatchResult {
    const before = captureAnimationSnapshot(this.state);
    const result = dispatchCommand(this.state, command);
    if (result.ok && result.events.length > 0) {
      this.pushAnimations(buildAnimationsFromEvents(result.events, before, this.state));
    }
    this.notifyListeners();
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
    if (next?.q === this.state.hoveredHex?.q && next?.r === this.state.hoveredHex?.r) {
      return;
    }
    this.state.hoveredHex = next;
    this.notifyListeners();
  }

  clearHoveredHex(): void {
    if (!this.state.hoveredHex) {
      return;
    }
    this.state.hoveredHex = null;
    this.notifyListeners();
  }

  selectUnitFromScreenPoint(pixelX: number, pixelY: number): void {
    const hoveredHex = this.getHexAtScreenPoint(pixelX, pixelY);
    this.state.hoveredHex = hoveredHex;
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
    this.botDecisionSystem = system;
  }

  private getPendingPriorityStopWindow() {
    const window = getPriorityStopWindow(this.state, this.botAutoplayEnabled, this.priorityStopSettings);
    if (!window || this.consumedPriorityStopKeys.has(window.key)) {
      return null;
    }
    return window;
  }

  private stepBotAutoplay(deltaSeconds: number): void {
    this.botActionCooldownSeconds = Math.max(0, this.botActionCooldownSeconds - deltaSeconds);
    if (this.botActionCooldownSeconds > 0 || this.state.winner) {
      return;
    }

    const priorityPlayerId = this.state.priorityPlayerId;
    if (!priorityPlayerId || !this.botAutoplayEnabled[priorityPlayerId]) {
      return;
    }

    const priorityStopWindow = this.getPendingPriorityStopWindow();
    if (priorityStopWindow) {
      this.consumedPriorityStopKeys.add(priorityStopWindow.key);
      this.state.log.push({
        turn: this.state.turn,
        text: `Priority stop ${PRIORITY_STOP_LABELS[priorityStopWindow.stopKey]}: ${priorityStopWindow.priorityPlayerId} yielded to ${priorityStopWindow.yieldedToPlayerId}.`,
      });
      const result = this.dispatch({
        type: "PASS_PRIORITY",
        playerId: priorityStopWindow.priorityPlayerId,
      });
      this.botActionCooldownSeconds = BOT_ACTION_INTERVAL_SECONDS;
      if (!result.ok) {
        this.botActionCooldownSeconds = BOT_ACTION_INTERVAL_SECONDS * 2;
      }
      return;
    }

    const command = this.botDecisionSystem(this.state, priorityPlayerId);
    if (!command) {
      return;
    }

    const result = this.dispatch(command);
    this.botActionCooldownSeconds = BOT_ACTION_INTERVAL_SECONDS;
    if (!result.ok) {
      this.botActionCooldownSeconds = BOT_ACTION_INTERVAL_SECONDS * 2;
    }
  }

  private stepAutoFlow(): void {
    const command = getAutoFlowCommand(this.state);
    if (!command) {
      return;
    }

    void this.dispatch(command);
  }

  step(context: CanvasRenderingContext2D, deltaSeconds: number): void {
    this.elapsedSeconds += deltaSeconds;
    this.stepAutoFlow();
    this.stepBotAutoplay(deltaSeconds);
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
        timeSeconds: this.elapsedSeconds,
      },
      derived: this.derivedState,
    };

    this.updateSystem(this.state, frame);
    this.renderSystem(this.state, frame);
  }
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

  import.meta.hot.accept("./ai/mvpBot", (module) => {
    const next = module as typeof import("./ai/mvpBot") | undefined;
    if (!next) {
      return;
    }
    runtime.replaceBotDecisionSystem(next.decideMvpBotCommand);
  });

  import.meta.hot.dispose((data: RuntimeHotData) => {
    data.runtime = runtime;
  });
}
