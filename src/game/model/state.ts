import type { Faction, GamePhase, ResourceType, UnitRole } from "./enums";
import { PLAYER_ONE, PLAYER_TWO, type EntityId, type NodeId, type PlayerId } from "./ids";
import { ensureBaseContentLoaded } from "../content/loader";
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

export type MapState = {
  id: string;
  name: string;
  width: number;
  height: number;
  spawnPoints: Record<PlayerId, HexCoord>;
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
  matchId: string;
  turn: number;
  phase: GamePhase;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  consecutivePriorityPasses: number;
  hoveredHex: HexCoord | null;
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
  factions?: { player_1: Faction; player_2: Faction };
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
  ensureBaseContentLoaded();
  return getRegisteredCurrencyResourceId();
}

export function getPrimaryResourceForFaction(faction: Faction): ResourceType {
  ensureBaseContentLoaded();
  return getRegisteredPrimaryResourceIdForFaction(faction);
}

export function createEmptyResourcePool(initialValue = 0): ResourcePool {
  ensureBaseContentLoaded();
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

function createStartingResources(playerId: PlayerId, faction: Faction): ResourcePool {
  const primary = getPrimaryResourceForFaction(faction);
  const currency = getCurrencyResourceId();
  const resources = createEmptyResourcePool();
  resources[currency] = playerId === PLAYER_ONE ? PLAYER_ONE_STARTING_CURRENCY : PLAYER_TWO_STARTING_CURRENCY;
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
    spawnPoints: {
      player_1: { ...map.spawnPoints.player_1 },
      player_2: { ...map.spawnPoints.player_2 },
    },
    resourceNodes: map.resourceNodes.map((node) => ({
      ...node,
      coord: { ...node.coord },
    })),
  };
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
  ensureBaseContentLoaded();
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
  state.players.player_1.handSize = state.zones.player_1.hand.length;
  state.players.player_1.deckSize = state.zones.player_1.deck.length;
  state.players.player_2.handSize = state.zones.player_2.hand.length;
  state.players.player_2.deckSize = state.zones.player_2.deck.length;
}

export function createInitialGameState(options: CreateInitialGameStateOptions): GameState {
  ensureBaseContentLoaded();
  const map = resolveInitialMap(options);
  const registeredFactions = getRegisteredFactionIds();
  if (registeredFactions.length === 0) {
    throw new Error("No registered factions are available.");
  }
  const runtimeProfile = resolveRuntimeProfile({
    ...options,
    map,
  });
  const factionOne =
    options.factions?.player_1 ??
    runtimeProfile?.defaultFactions?.player_1 ??
    registeredFactions[0];
  const factionTwo =
    options.factions?.player_2 ??
    runtimeProfile?.defaultFactions?.player_2 ??
    registeredFactions[1] ??
    registeredFactions[0] ??
    factionOne;
  const factionOneModule = getRegisteredFactionModule(factionOne);
  const factionTwoModule = getRegisteredFactionModule(factionTwo);
  if (!factionOneModule || !factionTwoModule) {
    throw new Error(`Missing faction module configuration for ${!factionOneModule ? factionOne : factionTwo}.`);
  }
  const rules = {
    ...createDefaultGameRules(),
    ...(options.rules ?? {}),
  };
  const baseOneId: EntityId = "base_player_1";
  const baseTwoId: EntityId = "base_player_2";
  const unitOneId: EntityId = "unit_player_1_scout";
  const unitTwoId: EntityId = "unit_player_2_scout";
  const harvesterOneId: EntityId = "unit_player_1_harvester";
  const harvesterTwoId: EntityId = "unit_player_2_harvester";
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

  const entities: Record<EntityId, EntityState> = {
    [baseOneId]: {
      id: baseOneId,
      kind: "base",
      name: "Player 1 Base",
      ownerId: PLAYER_ONE,
      hp: BASE_STARTING_HP,
      maxHp: BASE_STARTING_HP,
      coord: { ...map.spawnPoints.player_1 },
    },
    [baseTwoId]: {
      id: baseTwoId,
      kind: "base",
      name: "Player 2 Base",
      ownerId: PLAYER_TWO,
      hp: BASE_STARTING_HP,
      maxHp: BASE_STARTING_HP,
      coord: { ...map.spawnPoints.player_2 },
    },
    [unitOneId]: createStartingUnit(unitOneId, PLAYER_ONE, factionOneModule.startingCombatUnitCardId, {
        q: map.spawnPoints.player_1.q + 1,
        r: map.spawnPoints.player_1.r,
      }, factionOneModule.startingCombatUnitOverrides),
    [unitTwoId]: createStartingUnit(unitTwoId, PLAYER_TWO, factionTwoModule.startingCombatUnitCardId, {
        q: map.spawnPoints.player_2.q - 1,
        r: map.spawnPoints.player_2.r,
      }, factionTwoModule.startingCombatUnitOverrides),
    [harvesterOneId]: createStartingUnit(harvesterOneId, PLAYER_ONE, factionOneModule.startingResourceUnitCardId, {
        q: map.spawnPoints.player_1.q,
        r: map.spawnPoints.player_1.r + 1,
      }, factionOneModule.startingResourceUnitOverrides),
    [harvesterTwoId]: createStartingUnit(harvesterTwoId, PLAYER_TWO, factionTwoModule.startingResourceUnitCardId, {
        q: map.spawnPoints.player_2.q,
        r: map.spawnPoints.player_2.r - 1,
      }, factionTwoModule.startingResourceUnitOverrides),
  };

  const zones = {
    player_1: createInitialZonesForPlayer(PLAYER_ONE, factionOne, OPENING_HAND_SIZE, options.randomSource),
    player_2: createInitialZonesForPlayer(PLAYER_TWO, factionTwo, OPENING_HAND_SIZE, options.randomSource),
  } satisfies Record<PlayerId, PlayerZones>;
  const matchIdPrefix = runtimeProfile?.matchIdPrefix ?? map.id;
  const initialMatchId = options.matchId ?? `match_${matchIdPrefix}`;

  const state = {
    stateVersion: 24,
    matchId: initialMatchId,
    turn: 1,
    phase: "start",
    activePlayerId: PLAYER_ONE,
    priorityPlayerId: PLAYER_ONE,
    consecutivePriorityPasses: 0,
    hoveredHex: null,
    selectedEntityId: null,
    rules,
    map,
    players: {
      player_1: {
        id: PLAYER_ONE,
        name: "Player 1",
        faction: factionOne,
        resources: createStartingResources(PLAYER_ONE, factionOne),
        handSize: zones.player_1.hand.length,
        deckSize: zones.player_1.deck.length,
        baseEntityId: baseOneId,
      },
      player_2: {
        id: PLAYER_TWO,
        name: "Player 2",
        faction: factionTwo,
        resources: createStartingResources(PLAYER_TWO, factionTwo),
        handSize: zones.player_2.hand.length,
        deckSize: zones.player_2.deck.length,
        baseEntityId: baseTwoId,
      },
    },
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
