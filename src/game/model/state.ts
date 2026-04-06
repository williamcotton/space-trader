import type { Faction, GamePhase, ResourceType, UnitRole } from "./enums";
import { DEFAULT_PLAYER_ORDER, type EntityId, type NodeId, type PlayerId } from "./ids";
import { ensureDefaultContentLoaded } from "../content/loader";
import { getStarterDeckCardIds, validateDeckCardIds } from "../content/decks/starterDecks";
import { getCardDefinition, getUnitCardKeywords } from "../content/cards/catalog";
import {
  findRegisteredRuntimeProfileForMap,
  getDefaultRuntimeProfile,
  getRegisteredFactionIds,
  getRegisteredFactionModule,
  getRegisteredCurrencyResourceId,
  getRegisteredMap,
  getRegisteredMaps,
  getRegisteredPrimaryResourceIdForFaction,
  getRegisteredRuntimeProfile,
  getRegisteredResourceIds,
  isRegisteredCurrencyResource,
} from "../content/registry";
import type { ContinuousEffect } from "../systems/continuousEffects";
import { initializeMechanicState } from "../mechanics";

export const OPENING_HAND_SIZE = 5;
export const MAX_HAND_SIZE = 7;
export const BASE_STARTING_HP = 20;
export const PLAYER_ONE_STARTING_CURRENCY = 2;
export const PLAYER_TWO_STARTING_CURRENCY = 5;
export const STARTING_PRIMARY_RESOURCE = 2;

export type HexCoord = {
  q: number;
  r: number;
};

export type ResourcePool = Record<ResourceType, number>;

export type CardInstance = {
  instanceId: string;
  cardId: string;
  ownerId: PlayerId;
};

export type PlayerZones = {
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  exile: CardInstance[];
};

export type MapResourceNode = {
  id: NodeId;
  coord: HexCoord;
  resourceType: ResourceType;
  displayName: string;
  controlledBy: PlayerId | null;
};

export type StartingUnitOffsets = {
  combat: HexCoord;
  resource: HexCoord;
};

export type MapState = {
  id: string;
  name: string;
  width: number;
  height: number;
  spawnPoints: Record<PlayerId, HexCoord>;
  startingUnitOffsets?: Partial<Record<PlayerId, StartingUnitOffsets>>;
  resourceNodes: MapResourceNode[];
};

export type GameRules = {
  currencyDepositAmount: number;
  primaryDepositAmount: number;
  economyCurrencyIncome: number;
  economyPrimaryIncome: number;
};

export type PlayerState = {
  id: PlayerId;
  name: string;
  faction: Faction;
  resources: ResourcePool;
  handSize: number;
  deckSize: number;
  baseEntityId: EntityId;
};

export type BaseEntity = {
  id: EntityId;
  kind: "base";
  name: string;
  ownerId: PlayerId;
  hp: number;
  maxHp: number;
  coord: HexCoord;
};

export type UnitEntity = {
  id: EntityId;
  kind: "unit";
  name: string;
  ownerId: PlayerId;
  role: UnitRole;
  hp: number;
  maxHp: number;
  attackDamage: number;
  siegeDamageBonus: number;
  armor: number;
  moveRange: number;
  attackRange: number;
  attackActionsPerTurn: number;
  coord: HexCoord;
  keywords?: string[];
  carries: ResourceType | null;
  sourceCardId: string | null;
  hasSummoningSickness: boolean;
  movesRemaining: number;
  attacksRemaining: number;
  temporaryAttackBonus: number;
  temporaryArmorBonus: number;
};

export type EntityState = BaseEntity | UnitEntity;

export interface StackItem {
  id: string;
  label: string;
  controllerId: PlayerId;
  ownerId: PlayerId;
  effectId: string;
  effectMagnitude: number;
  activeModifierIds?: string[];
  targetStackItemId: string | null;
  targetEntityId: EntityId | null;
  targetHex?: HexCoord | null;
  objectKind: "spell" | "ability";
  counterable: boolean;
  defaultCounterDestination: "discard" | "hand" | "exile" | "none";
  sourceCardInstanceId: string | null;
  sourceCardId: string | null;
  sourceCardOwnerId: PlayerId | null;
  pendingUnitEntityId: EntityId | null;
}

export type MatchLogEntry = {
  turn: number;
  text: string;
};

export type MechanicStateBuckets = {
  match: Record<string, unknown>;
  turn: Record<string, unknown>;
  resolution: Record<string, unknown>;
};

export interface GameState {
  stateVersion: number;
  nextGeneratedIdCounter: number;
  matchId: string;
  turn: number;
  phase: GamePhase;
  playerOrder: PlayerId[];
  eliminatedPlayerIds: PlayerId[];
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  consecutivePriorityPasses: number;
  selectedEntityId: EntityId | null;
  rules: GameRules;
  map: MapState;
  players: Record<PlayerId, PlayerState>;
  zones: Record<PlayerId, PlayerZones>;
  entities: Record<EntityId, EntityState>;
  stack: StackItem[];
  continuousEffects: ContinuousEffect[];
  effectTimestampCounter: number;
  log: MatchLogEntry[];
  winner: PlayerId | null;
  lastRejectedReason: string | null;
  mechanicState: MechanicStateBuckets;
  tacticalHarvestEligibleUnitIds: EntityId[];
  tacticalHarvestedUnitIds: EntityId[];
}

export function getUnitKeywords(unit: UnitEntity): string[] {
  return unit.keywords ? [...unit.keywords] : [];
}

export function unitHasKeyword(unit: UnitEntity, keyword: string): boolean {
  return getUnitKeywords(unit).includes(keyword);
}

type CreateInitialGameStateOptions = {
  map?: MapState;
  mapId?: string;
  runtimeProfileId?: string;
  matchId?: string;
  randomSource?: () => number;
  rules?: Partial<GameRules>;
  playerOrder?: PlayerId[];
  factions?: Partial<Record<PlayerId, Faction>>;
};

export const DEFAULT_GAME_RULES: GameRules = {
  currencyDepositAmount: 2,
  primaryDepositAmount: 2,
  economyCurrencyIncome: 1,
  economyPrimaryIncome: 0,
};

export function createDefaultGameRules(): GameRules {
  return { ...DEFAULT_GAME_RULES };
}

export function getConfiguredDepositAmount(rules: GameRules, resourceType: ResourceType): number {
  return isRegisteredCurrencyResource(resourceType) ? rules.currencyDepositAmount : rules.primaryDepositAmount;
}

export function getCurrencyResourceId(): ResourceType {
  ensureDefaultContentLoaded();
  return getRegisteredCurrencyResourceId();
}

export function getPrimaryResourceForFaction(faction: Faction): ResourceType {
  ensureDefaultContentLoaded();
  return getRegisteredPrimaryResourceIdForFaction(faction);
}

export function createEmptyResourcePool(initialValue = 0): ResourcePool {
  ensureDefaultContentLoaded();
  return Object.fromEntries(getRegisteredResourceIds().map((resourceId) => [resourceId, initialValue])) as ResourcePool;
}

function shuffleCards<T>(cards: T[], randomSource: () => number): T[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomSource() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createStartingResources(playerId: PlayerId, startingPlayerId: PlayerId, faction: Faction): ResourcePool {
  const primary = getPrimaryResourceForFaction(faction);
  const currency = getCurrencyResourceId();
  const resources = createEmptyResourcePool();
  resources[currency] = playerId === startingPlayerId ? PLAYER_ONE_STARTING_CURRENCY : PLAYER_TWO_STARTING_CURRENCY;
  resources[primary] = STARTING_PRIMARY_RESOURCE;
  return resources;
}

function resolveRuntimeProfile(options: CreateInitialGameStateOptions) {
  if (options.runtimeProfileId) {
    const explicitRuntimeProfile = getRegisteredRuntimeProfile(options.runtimeProfileId);
    if (!explicitRuntimeProfile) {
      throw new Error(`Unknown runtime profile ${options.runtimeProfileId}.`);
    }
    return explicitRuntimeProfile;
  }

  if (options.map) {
    return findRegisteredRuntimeProfileForMap(options.map.id) ?? getDefaultRuntimeProfile();
  }

  if (options.mapId) {
    return findRegisteredRuntimeProfileForMap(options.mapId) ?? getDefaultRuntimeProfile();
  }

  return getDefaultRuntimeProfile();
}

function cloneMap(map: MapState): MapState {
  return {
    ...map,
    spawnPoints: Object.fromEntries(
      Object.entries(map.spawnPoints).map(([playerId, coord]) => [playerId, { ...coord }])
    ) as Record<PlayerId, HexCoord>,
    startingUnitOffsets: map.startingUnitOffsets
      ? Object.fromEntries(
          Object.entries(map.startingUnitOffsets).map(([playerId, offsets]) => [
            playerId,
            offsets
              ? {
                  combat: { ...offsets.combat },
                  resource: { ...offsets.resource },
                }
              : offsets,
          ])
        ) as Partial<Record<PlayerId, StartingUnitOffsets>>
      : undefined,
    resourceNodes: map.resourceNodes.map((node) => ({
      ...node,
      coord: { ...node.coord },
    })),
  };
}

function resolveInitialPlayerOrder(map: MapState, options: CreateInitialGameStateOptions): PlayerId[] {
  if (options.playerOrder && options.playerOrder.length > 0) {
    return [...options.playerOrder];
  }

  const mapPlayers = Object.keys(map.spawnPoints).sort();
  if (mapPlayers.length > 0) {
    return mapPlayers;
  }

  return [...DEFAULT_PLAYER_ORDER];
}

function resolveInitialMap(options: CreateInitialGameStateOptions): MapState {
  if (options.map) {
    return cloneMap(options.map);
  }

  if (options.mapId) {
    const map = getRegisteredMap(options.mapId);
    if (!map) {
      throw new Error(`Unknown map id ${options.mapId}.`);
    }
    return cloneMap(map);
  }

  const runtimeProfile = resolveRuntimeProfile(options);
  if (runtimeProfile) {
    const runtimeMap = getRegisteredMap(runtimeProfile.defaultMapId);
    if (!runtimeMap) {
      throw new Error(`Runtime profile ${runtimeProfile.id} references unknown default map ${runtimeProfile.defaultMapId}.`);
    }
    return cloneMap(runtimeMap);
  }

  const fallbackMap = Object.values(getRegisteredMaps())
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!fallbackMap) {
    throw new Error("No registered maps are available.");
  }
  return cloneMap(fallbackMap);
}

export function createInitialZonesForPlayer(
  playerId: PlayerId,
  faction: Faction,
  openingHandSize = OPENING_HAND_SIZE,
  randomSource?: () => number
): PlayerZones {
  ensureDefaultContentLoaded();
  const deckCardIds = getStarterDeckCardIds(faction);
  const deckErrors = validateDeckCardIds(deckCardIds);
  if (deckErrors.length > 0) {
    throw new Error(`Invalid starter deck for ${faction}: ${deckErrors.join(" ")}`);
  }

  const allInstances: CardInstance[] = deckCardIds.map((cardId, index) => ({
    instanceId: `${playerId}_card_${index + 1}`,
    cardId,
    ownerId: playerId,
  }));
  const orderedInstances = randomSource ? shuffleCards(allInstances, randomSource) : allInstances;

  const hand = orderedInstances.slice(0, openingHandSize);
  const deck = orderedInstances.slice(openingHandSize);

  return {
    deck,
    hand,
    discard: [],
    exile: [],
  };
}

export function syncPlayerZoneCounts(state: Pick<GameState, "players" | "zones">): void {
  for (const playerId of Object.keys(state.players)) {
    const player = state.players[playerId];
    const zones = state.zones[playerId];
    if (!player || !zones) {
      continue;
    }
    player.handSize = zones.hand.length;
    player.deckSize = zones.deck.length;
  }
}

const STARTING_UNIT_OFFSETS: Array<{ combat: HexCoord; resource: HexCoord }> = [
  { combat: { q: 1, r: 0 }, resource: { q: 0, r: 1 } },
  { combat: { q: -1, r: 0 }, resource: { q: 0, r: -1 } },
  { combat: { q: 0, r: -1 }, resource: { q: 1, r: 0 } },
  { combat: { q: 0, r: 1 }, resource: { q: -1, r: 0 } },
];

function getStartingUnitOffsets(seatIndex: number): { combat: HexCoord; resource: HexCoord } {
  return STARTING_UNIT_OFFSETS[seatIndex] ?? STARTING_UNIT_OFFSETS[seatIndex % STARTING_UNIT_OFFSETS.length]!;
}

function pickStartingPlayerId(playerOrder: PlayerId[], randomSource?: () => number): PlayerId {
  if (playerOrder.length <= 2) {
    return playerOrder[0]!;
  }
  const source = randomSource ?? Math.random;
  const index = Math.floor(source() * playerOrder.length);
  return playerOrder[index] ?? playerOrder[0]!;
}

export function createInitialGameState(options: CreateInitialGameStateOptions): GameState {
  ensureDefaultContentLoaded();
  const map = resolveInitialMap(options);
  const playerOrder = resolveInitialPlayerOrder(map, options);
  const registeredFactions = getRegisteredFactionIds();
  if (registeredFactions.length === 0) {
    throw new Error("No registered factions are available.");
  }
  if (playerOrder.length === 0) {
    throw new Error("Cannot create a match without at least one player.");
  }
  const startingPlayerId = pickStartingPlayerId(playerOrder, options.randomSource);
  const runtimeProfile = resolveRuntimeProfile({
    ...options,
    map,
  });
  const factionsByPlayer = Object.fromEntries(
    playerOrder.map((playerId, seatIndex) => {
      const fallbackFaction = registeredFactions[seatIndex] ?? registeredFactions[0];
      return [
        playerId,
        options.factions?.[playerId] ??
          runtimeProfile?.defaultFactions?.[playerId] ??
          fallbackFaction,
      ];
    })
  ) as Record<PlayerId, Faction>;
  const rules = {
    ...createDefaultGameRules(),
    ...(options.rules ?? {}),
  };
  const createStartingUnit = (
    id: EntityId,
    ownerId: PlayerId,
    cardId: string,
    coord: HexCoord,
    overrides?: {
      name?: string;
      hp?: number;
      attackDamage?: number;
      siegeDamageBonus?: number;
      armor?: number;
      moveRange?: number;
      attackRange?: number;
      attackActionsPerTurn?: number;
      keywords?: string[];
    }
  ): UnitEntity => {
    const cardDefinition = getCardDefinition(cardId);
    if (!cardDefinition || cardDefinition.kind !== "unit") {
      throw new Error(`Expected starting unit card ${cardId} to be a unit.`);
    }

    const maxHp = overrides?.hp ?? cardDefinition.unit.hp;
    const attackActionsPerTurn = overrides?.attackActionsPerTurn ?? cardDefinition.unit.attackActionsPerTurn;
    const moveRange = overrides?.moveRange ?? cardDefinition.unit.moveRange;

    return {
      id,
      kind: "unit",
      name: overrides?.name ?? cardDefinition.name,
      ownerId,
      role: cardDefinition.unit.role,
      hp: maxHp,
      maxHp,
      attackDamage: overrides?.attackDamage ?? cardDefinition.unit.attackDamage,
      siegeDamageBonus: overrides?.siegeDamageBonus ?? cardDefinition.unit.siegeDamageBonus,
      armor: overrides?.armor ?? cardDefinition.unit.armor,
      moveRange,
      attackRange: overrides?.attackRange ?? cardDefinition.unit.attackRange,
      attackActionsPerTurn,
      coord,
      keywords: overrides?.keywords ?? getUnitCardKeywords(cardId),
      carries: null,
      sourceCardId: cardId,
      hasSummoningSickness: false,
      movesRemaining: moveRange,
      attacksRemaining: attackActionsPerTurn,
      temporaryAttackBonus: 0,
      temporaryArmorBonus: 0,
    };
  };

  const entities: Record<EntityId, EntityState> = {};
  const zones = {} as Record<PlayerId, PlayerZones>;
  const players = {} as Record<PlayerId, PlayerState>;

  for (let seatIndex = 0; seatIndex < playerOrder.length; seatIndex += 1) {
    const playerId = playerOrder[seatIndex]!;
    const faction = factionsByPlayer[playerId];
    const factionModule = getRegisteredFactionModule(faction);
    if (!factionModule) {
      throw new Error(`Missing faction module configuration for ${faction}.`);
    }

    const spawn = map.spawnPoints[playerId];
    if (!spawn) {
      throw new Error(`Missing spawn point for ${playerId} on map ${map.id}.`);
    }

    const offsets = map.startingUnitOffsets?.[playerId] ?? getStartingUnitOffsets(seatIndex);
    const baseId: EntityId = `base_${playerId}`;
    const combatUnitId: EntityId = `unit_${playerId}_scout`;
    const resourceUnitId: EntityId = `unit_${playerId}_harvester`;

    entities[baseId] = {
      id: baseId,
      kind: "base",
      name: `Player ${seatIndex + 1} Base`,
      ownerId: playerId,
      hp: BASE_STARTING_HP,
      maxHp: BASE_STARTING_HP,
      coord: { ...spawn },
    };
    entities[combatUnitId] = createStartingUnit(
      combatUnitId,
      playerId,
      factionModule.startingCombatUnitCardId,
      {
        q: spawn.q + offsets.combat.q,
        r: spawn.r + offsets.combat.r,
      },
      factionModule.startingCombatUnitOverrides
    );
    entities[resourceUnitId] = createStartingUnit(
      resourceUnitId,
      playerId,
      factionModule.startingResourceUnitCardId,
      {
        q: spawn.q + offsets.resource.q,
        r: spawn.r + offsets.resource.r,
      },
      factionModule.startingResourceUnitOverrides
    );

    zones[playerId] = createInitialZonesForPlayer(playerId, faction, OPENING_HAND_SIZE, options.randomSource);
    players[playerId] = {
      id: playerId,
      name: `Player ${seatIndex + 1}`,
      faction,
      resources: createStartingResources(playerId, startingPlayerId, faction),
      handSize: zones[playerId].hand.length,
      deckSize: zones[playerId].deck.length,
      baseEntityId: baseId,
    };
  }
  const matchIdPrefix = runtimeProfile?.matchIdPrefix ?? map.id;
  const initialMatchId = options.matchId ?? `match_${matchIdPrefix}`;

  const state = {
    stateVersion: 26,
    nextGeneratedIdCounter: 1,
    matchId: initialMatchId,
    turn: 1,
    phase: "start",
    playerOrder,
    eliminatedPlayerIds: [],
    activePlayerId: startingPlayerId,
    priorityPlayerId: startingPlayerId,
    consecutivePriorityPasses: 0,
    selectedEntityId: null,
    rules,
    map,
    players,
    zones,
    entities,
    stack: [],
    continuousEffects: [],
    effectTimestampCounter: 0,
    log: [
      {
        turn: 1,
        text: `Match initialized on ${map.name}.`,
      },
    ],
    winner: null,
    lastRejectedReason: null,
    mechanicState: {
      match: {},
      turn: {},
      resolution: {},
    },
    tacticalHarvestEligibleUnitIds: [],
    tacticalHarvestedUnitIds: [],
  } as unknown as GameState;

  initializeMechanicState(state);
  return state;
}
