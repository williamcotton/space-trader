import type { Faction, GamePhase, ResourceType, UnitRole } from "./enums";
import { PLAYER_ONE, PLAYER_TWO, type EntityId, type NodeId, type PlayerId } from "./ids";
import { getStarterDeckCardIds, validateDeckCardIds } from "../content/decks/starterDecks";

export const OPENING_HAND_SIZE = 5;
export const MAX_HAND_SIZE = 7;
export const BASE_STARTING_HP = 20;

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
  carries: ResourceType | null;
  sourceCardId: string | null;
  hasSummoningSickness: boolean;
  movesRemaining: number;
  attacksRemaining: number;
};

export type EntityState = BaseEntity | UnitEntity;

export type StackItem = {
  id: string;
  label: string;
  controllerId: PlayerId;
  ownerId: PlayerId;
  effectId: string;
  effectMagnitude: number;
  targetStackItemId: string | null;
  objectKind: "spell" | "ability";
  counterable: boolean;
  defaultCounterDestination: "discard" | "hand" | "exile" | "none";
  sourceCardInstanceId: string | null;
  sourceCardId: string | null;
  sourceCardOwnerId: PlayerId | null;
  pendingUnitEntityId: EntityId | null;
};

export type MatchLogEntry = {
  turn: number;
  text: string;
};

export type GameState = {
  stateVersion: number;
  matchId: string;
  turn: number;
  phase: GamePhase;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  consecutivePriorityPasses: number;
  hoveredHex: HexCoord | null;
  selectedEntityId: EntityId | null;
  map: MapState;
  players: Record<PlayerId, PlayerState>;
  zones: Record<PlayerId, PlayerZones>;
  entities: Record<EntityId, EntityState>;
  stack: StackItem[];
  log: MatchLogEntry[];
  winner: PlayerId | null;
  lastRejectedReason: string | null;
};

type CreateInitialGameStateOptions = {
  map: MapState;
  matchId?: string;
};

function createStartingResources(faction: Faction): ResourcePool {
  return {
    credits: 4,
    alloy: faction === "alloy_clan" ? 2 : 0,
    flux: faction === "flux_collective" ? 2 : 0,
    biomass: faction === "biomass_swarm" ? 2 : 0,
  };
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

export function createInitialZonesForPlayer(playerId: PlayerId, faction: Faction, openingHandSize = OPENING_HAND_SIZE): PlayerZones {
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

  const hand = allInstances.slice(0, openingHandSize);
  const deck = allInstances.slice(openingHandSize);

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
  const map = cloneMap(options.map);
  const baseOneId: EntityId = "base_player_1";
  const baseTwoId: EntityId = "base_player_2";
  const unitOneId: EntityId = "unit_player_1_scout";
  const unitTwoId: EntityId = "unit_player_2_scout";
  const harvesterOneId: EntityId = "unit_player_1_harvester";
  const harvesterTwoId: EntityId = "unit_player_2_harvester";

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
    [unitOneId]: {
      id: unitOneId,
      kind: "unit",
      name: "Frontline Scout",
      ownerId: PLAYER_ONE,
      role: "combat",
      hp: 6,
      maxHp: 6,
      attackDamage: 2,
      siegeDamageBonus: 1,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: {
        q: map.spawnPoints.player_1.q + 1,
        r: map.spawnPoints.player_1.r,
      },
      carries: null,
      sourceCardId: "frontline_scout_card",
      hasSummoningSickness: false,
      movesRemaining: 2,
      attacksRemaining: 1,
    },
    [unitTwoId]: {
      id: unitTwoId,
      kind: "unit",
      name: "Command Runner",
      ownerId: PLAYER_TWO,
      role: "combat",
      hp: 6,
      maxHp: 6,
      attackDamage: 2,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: {
        q: map.spawnPoints.player_2.q - 1,
        r: map.spawnPoints.player_2.r,
      },
      carries: null,
      sourceCardId: "flux_runner_card",
      hasSummoningSickness: false,
      movesRemaining: 2,
      attacksRemaining: 1,
    },
    [harvesterOneId]: {
      id: harvesterOneId,
      kind: "unit",
      name: "Expedition Harvester",
      ownerId: PLAYER_ONE,
      role: "resource",
      hp: 5,
      maxHp: 5,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: {
        q: map.spawnPoints.player_1.q,
        r: map.spawnPoints.player_1.r + 1,
      },
      carries: null,
      sourceCardId: "expedition_harvester_card",
      hasSummoningSickness: false,
      movesRemaining: 2,
      attacksRemaining: 1,
    },
    [harvesterTwoId]: {
      id: harvesterTwoId,
      kind: "unit",
      name: "Expedition Harvester",
      ownerId: PLAYER_TWO,
      role: "resource",
      hp: 5,
      maxHp: 5,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: {
        q: map.spawnPoints.player_2.q,
        r: map.spawnPoints.player_2.r - 1,
      },
      carries: null,
      sourceCardId: "expedition_harvester_card",
      hasSummoningSickness: false,
      movesRemaining: 2,
      attacksRemaining: 1,
    },
  };

  const zones = {
    player_1: createInitialZonesForPlayer(PLAYER_ONE, "alloy_clan"),
    player_2: createInitialZonesForPlayer(PLAYER_TWO, "flux_collective"),
  } satisfies Record<PlayerId, PlayerZones>;

  return {
    stateVersion: 13,
    matchId: options.matchId ?? "match_frontier_belt",
    turn: 1,
    phase: "start",
    activePlayerId: PLAYER_ONE,
    priorityPlayerId: PLAYER_ONE,
    consecutivePriorityPasses: 0,
    hoveredHex: null,
    selectedEntityId: null,
    map,
    players: {
      player_1: {
        id: PLAYER_ONE,
        name: "Player 1",
        faction: "alloy_clan",
        resources: createStartingResources("alloy_clan"),
        handSize: zones.player_1.hand.length,
        deckSize: zones.player_1.deck.length,
        baseEntityId: baseOneId,
      },
      player_2: {
        id: PLAYER_TWO,
        name: "Player 2",
        faction: "flux_collective",
        resources: createStartingResources("flux_collective"),
        handSize: zones.player_2.hand.length,
        deckSize: zones.player_2.deck.length,
        baseEntityId: baseTwoId,
      },
    },
    zones,
    entities,
    stack: [],
    log: [
      {
        turn: 1,
        text: "Match initialized on Frontier Belt.",
      },
    ],
    winner: null,
    lastRejectedReason: null,
  };
}
