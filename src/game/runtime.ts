import type { GameCommand } from "./actions/commands";
import { dispatchCommand, type DispatchResult } from "./actions/reducers";
import { decideMvpBotCommand } from "./ai/mvpBot";
import { FRONTIER_BELT_MAP } from "./content/maps/frontierBelt";
import { getStackEffectDefinition } from "./content/stackEffects";
import { areSameHex, hexDistance, isWithinMapBounds, pixelToAxial } from "./model/hex";
import { OPENING_HAND_SIZE, createInitialGameState, createInitialZonesForPlayer } from "./model/state";
import type { PlayerId } from "./model/ids";
import { ensureEntityPresentation } from "./presentation";
import { captureAnimationSnapshot, buildAnimationsFromEvents, stepAnimations } from "./render/animations";
import { getHexMetrics } from "./render/layout";
import { renderGame, updateGame } from "./systems";
import type { GameState } from "./model/state";
import type { CanvasAnimation, GameFrame, GameViewport, RenderSystem, UpdateSystem } from "./types";

const INITIAL_VIEWPORT: GameViewport = {
  width: 1024,
  height: 768,
};

const CURRENT_STATE_VERSION = 10;
const BOT_ACTION_INTERVAL_SECONDS = 0.16;

type BotDecisionSystem = typeof decideMvpBotCommand;

function migratePhaseFourHarvesters(state: GameState): void {
  const playerOneHarvesterId = "unit_player_1_harvester";
  const playerTwoHarvesterId = "unit_player_2_harvester";

  if (!state.entities[playerOneHarvesterId]) {
    const spawn = state.map.spawnPoints.player_1;
    state.entities[playerOneHarvesterId] = {
      id: playerOneHarvesterId,
      kind: "unit",
      name: "Expedition Harvester",
      ownerId: "player_1",
      role: "resource",
      hp: 5,
      maxHp: 5,
      attackDamage: 1,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: { q: spawn.q, r: spawn.r + 1 },
      carries: null,
      sourceCardId: "expedition_harvester_card",
      hasSummoningSickness: false,
      movesRemaining: 2,
      attacksRemaining: 1,
    };
  }

  if (!state.entities[playerTwoHarvesterId]) {
    const spawn = state.map.spawnPoints.player_2;
    state.entities[playerTwoHarvesterId] = {
      id: playerTwoHarvesterId,
      kind: "unit",
      name: "Expedition Harvester",
      ownerId: "player_2",
      role: "resource",
      hp: 5,
      maxHp: 5,
      attackDamage: 1,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: { q: spawn.q, r: spawn.r - 1 },
      carries: null,
      sourceCardId: "expedition_harvester_card",
      hasSummoningSickness: false,
      movesRemaining: 2,
      attacksRemaining: 1,
    };
  }
}

function migrateRuntimeState(state: GameState): void {
  if (typeof state.consecutivePriorityPasses !== "number") {
    state.consecutivePriorityPasses = 0;
  }

  if (typeof state.hoveredHex === "undefined") {
    state.hoveredHex = null;
  }

  for (const stackItem of state.stack) {
    if (typeof stackItem.effectId === "undefined") {
      stackItem.effectId = "noop_log";
    }
    const definition = getStackEffectDefinition(stackItem.effectId);
    if (typeof stackItem.effectMagnitude !== "number") {
      if (definition?.resolution.type === "damage_enemy_base") {
        stackItem.effectMagnitude = definition.resolution.amount;
      } else {
        stackItem.effectMagnitude = 0;
      }
    }
    if (typeof stackItem.targetStackItemId === "undefined") {
      stackItem.targetStackItemId = null;
    }
    if (typeof stackItem.ownerId === "undefined") {
      stackItem.ownerId = stackItem.controllerId;
    }
    if (typeof stackItem.objectKind === "undefined") {
      stackItem.objectKind = definition?.object.kind ?? "ability";
    }
    if (typeof stackItem.counterable === "undefined") {
      stackItem.counterable = definition?.object.counterable ?? false;
    }
    if (typeof stackItem.defaultCounterDestination === "undefined") {
      stackItem.defaultCounterDestination = definition?.object.defaultCounterDestination ?? "none";
    }
    if (typeof stackItem.sourceCardInstanceId === "undefined") {
      stackItem.sourceCardInstanceId = null;
    }
    if (typeof stackItem.sourceCardId === "undefined") {
      stackItem.sourceCardId = null;
    }
    if (typeof stackItem.sourceCardOwnerId === "undefined") {
      stackItem.sourceCardOwnerId = null;
    }
  }

  for (const entity of Object.values(state.entities)) {
    ensureEntityPresentation(entity, state);

    if (typeof entity.maxHp !== "number") {
      entity.maxHp = entity.hp;
    }

    if (entity.kind === "unit" && typeof entity.carries === "undefined") {
      entity.carries = null;
    }
  }

  migratePhaseFourHarvesters(state);

  if (typeof state.zones === "undefined") {
    state.zones = {
      player_1: createInitialZonesForPlayer("player_1", state.players.player_1.faction, state.players.player_1.handSize || OPENING_HAND_SIZE),
      player_2: createInitialZonesForPlayer("player_2", state.players.player_2.faction, state.players.player_2.handSize || OPENING_HAND_SIZE),
    };
  }

  for (const playerId of ["player_1", "player_2"] as const) {
    if (!state.zones[playerId]) {
      state.zones[playerId] = createInitialZonesForPlayer(
        playerId,
        state.players[playerId].faction,
        state.players[playerId].handSize || OPENING_HAND_SIZE
      );
    }
    if (!Array.isArray(state.zones[playerId].deck)) {
      state.zones[playerId].deck = [];
    }
    if (!Array.isArray(state.zones[playerId].hand)) {
      state.zones[playerId].hand = [];
    }
    if (!Array.isArray(state.zones[playerId].discard)) {
      state.zones[playerId].discard = [];
    }
    if (!Array.isArray(state.zones[playerId].exile)) {
      state.zones[playerId].exile = [];
    }

    state.players[playerId].handSize = state.zones[playerId].hand.length;
    state.players[playerId].deckSize = state.zones[playerId].deck.length;
  }

  if (typeof state.stateVersion !== "number") {
    state.stateVersion = 0;
  }

  if (state.stateVersion < CURRENT_STATE_VERSION) {
    state.stateVersion = CURRENT_STATE_VERSION;
    state.log.push({
      turn: state.turn,
      text: "State migrated to v10 (presentation metadata and render animation update).",
    });
  }
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
  readonly state: GameState;

  constructor(state: GameState = createInitialGameState({ map: FRONTIER_BELT_MAP })) {
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
  }

  toggleBotAutoplay(playerId: PlayerId): boolean {
    const next = !this.botAutoplayEnabled[playerId];
    this.setBotAutoplayEnabled(playerId, next);
    return next;
  }

  private findEntityAtHex(coord: { q: number; r: number }): GameState["entities"][string] | undefined {
    return Object.values(this.state.entities).find((entity) => areSameHex(entity.coord, coord));
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
    this.state.hoveredHex = this.getHexAtScreenPoint(pixelX, pixelY);
  }

  clearHoveredHex(): void {
    this.state.hoveredHex = null;
  }

  selectUnitFromScreenPoint(pixelX: number, pixelY: number): void {
    const hoveredHex = this.getHexAtScreenPoint(pixelX, pixelY);
    this.state.hoveredHex = hoveredHex;

    if (!hoveredHex) {
      if (this.state.selectedEntityId) {
        void this.dispatch({
          type: "CLEAR_SELECTION",
          playerId: this.state.activePlayerId,
          reason: "clicked_outside_map",
        });
      }
      return;
    }

    const entity = this.findEntityAtHex(hoveredHex);
    if (!entity || entity.kind !== "unit" || entity.ownerId !== this.state.activePlayerId) {
      if (this.state.selectedEntityId) {
        void this.dispatch({
          type: "CLEAR_SELECTION",
          playerId: this.state.activePlayerId,
          reason: "clicked_empty_or_enemy_tile",
        });
      }
      return;
    }

    if (this.state.selectedEntityId === entity.id) {
      void this.dispatch({
        type: "CLEAR_SELECTION",
        playerId: this.state.activePlayerId,
        reason: "clicked_selected_unit",
      });
      return;
    }

    void this.dispatch({
      type: "SELECT_ENTITY",
      playerId: this.state.activePlayerId,
      entityId: entity.id,
    });
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

  playCardFromHand(cardInstanceId: string, targetStackItemId?: string): DispatchResult {
    const playerId = this.state.priorityPlayerId ?? this.state.activePlayerId;
    return this.dispatch({
      type: "PLAY_CARD",
      playerId,
      cardInstanceId,
      targetStackItemId,
    });
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
      label: "Orbital Ping",
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
      label: "Counter Pulse",
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

  step(context: CanvasRenderingContext2D, deltaSeconds: number): void {
    this.elapsedSeconds += deltaSeconds;
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
