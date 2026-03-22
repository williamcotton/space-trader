import type { GameCommand } from "./actions/commands";
import { dispatchCommand, type DispatchResult } from "./actions/reducers";
import { decideMvpBotCommand } from "./ai/mvpBot";
import { FRONTIER_BELT_MAP } from "./content/maps/frontierBelt";
import { getCardDefinition } from "./content/cards/catalog";
import { areSameHex, hexDistance, isWithinMapBounds, pixelToAxial } from "./model/hex";
import { findEntityAtHex } from "./model/queries";
import { createInitialGameState } from "./model/state";
import type { PlayerId } from "./model/ids";
import { migrateRuntimeState } from "./model/migrations";
import { captureAnimationSnapshot, buildAnimationsFromEvents, stepAnimations } from "./render/animations";
import { getHexMetrics } from "./render/layout";
import { renderGame, updateGame } from "./systems";
import { getAutoFlowCommand } from "./turn/autoFlow";
import type { GameState } from "./model/state";
import type { CanvasAnimation, GameFrame, GameViewport, RenderSystem, UpdateSystem } from "./types";

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
  targetStackItemId?: string;
  prompt: string;
};

function createRuntimeMatchId(): string {
  return `match_frontier_belt_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .padStart(4, "0")}`;
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

class GameRuntime {
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
  private pendingCardTargeting: PendingCardTargeting | null = null;
  private listeners: Set<() => void> = new Set();
  private stateVersion = 0;
  readonly state: GameState;

  constructor(
    state: GameState = createInitialGameState({
      map: FRONTIER_BELT_MAP,
      matchId: createRuntimeMatchId(),
      randomSource: () => Math.random(),
    })
  ) {
    this.state = state;
    migrateRuntimeState(this.state);
    this.rehydrateHotState();
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
    if (!this.pendingCardTargeting) {
      this.pendingCardTargeting = null;
    }
    if (!this.listeners) {
      this.listeners = new Set();
    }
    if (typeof this.stateVersion !== "number") {
      this.stateVersion = 0;
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

  dispatch(command: GameCommand): DispatchResult {
    const before = captureAnimationSnapshot(this.state);
    const result = dispatchCommand(this.state, command);
    if (result.ok && result.events.length > 0) {
      this.animations.push(...buildAnimationsFromEvents(result.events, before, this.state));
      if (this.animations.length > 32) {
        this.animations = this.animations.slice(-32);
      }
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

      const targetEntity = findEntityAtHex(this.state, hoveredHex);
      if (!targetEntity) {
        this.clearPendingCardTargeting(`Cancelled targeting for ${this.pendingCardTargeting.cardName}.`);
        this.notifyListeners();
        return;
      }

      const result = this.dispatch({
        type: "PLAY_CARD",
        playerId: this.pendingCardTargeting.playerId,
        cardInstanceId: this.pendingCardTargeting.cardInstanceId,
        targetStackItemId: this.pendingCardTargeting.targetStackItemId,
        targetEntityId: targetEntity.id,
      });
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
      return hexDistance(attacker.coord, entity.coord) <= attacker.attackRange;
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

  playCardFromHand(cardInstanceId: string, targetStackItemId?: string, targetEntityId?: string): DispatchResult {
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
    const needsEntityTarget = definition?.play.targetMode === "entity";
    if (needsEntityTarget && !targetEntityId) {
      this.pendingCardTargeting = {
        playerId,
        cardInstanceId,
        cardName: definition.name,
        targetStackItemId,
        prompt: `Select target for ${definition.name}.`,
      };
      this.state.log.push({
        turn: this.state.turn,
        text: `Select target for ${definition.name}.`,
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

  debugRespondStack(): void {
    const priorityPlayerId = this.state.priorityPlayerId;
    if (!priorityPlayerId) {
      return;
    }

    void this.dispatch({
      type: "RESPOND_STACK",
      playerId: priorityPlayerId,
      label: "Debug response",
      effectId: "noop_log",
    });
  }

  debugRespondDamageEnemyBase(): void {
    const priorityPlayerId = this.state.priorityPlayerId;
    if (!priorityPlayerId) {
      return;
    }

    void this.dispatch({
      type: "RESPOND_STACK",
      playerId: priorityPlayerId,
      label: "Debug Base Strike",
      effectId: "damage_enemy_base_2",
    });
  }

  debugRespondCounterTopItem(targetStackItemId?: string): void {
    const priorityPlayerId = this.state.priorityPlayerId;
    if (!priorityPlayerId) {
      return;
    }

    const resolvedTargetId = targetStackItemId ?? this.state.stack[this.state.stack.length - 1]?.id;

    void this.dispatch({
      type: "RESPOND_STACK",
      playerId: priorityPlayerId,
      label: "Debug Counter",
      effectId: "counter_top_item",
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

  private stepBotAutoplay(deltaSeconds: number): void {
    this.botActionCooldownSeconds = Math.max(0, this.botActionCooldownSeconds - deltaSeconds);
    if (this.botActionCooldownSeconds > 0 || this.state.winner) {
      return;
    }

    const priorityPlayerId = this.state.priorityPlayerId;
    if (!priorityPlayerId || !this.botAutoplayEnabled[priorityPlayerId]) {
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

    const frame: GameFrame = {
      context,
      viewport: this.viewport,
      deltaSeconds,
      transients: {
        animations: this.animations,
        timeSeconds: this.elapsedSeconds,
      },
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
