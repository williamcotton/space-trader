import type { Faction, GamePhase, ResourceType, UnitRole } from "./enums";
import { PLAYER_ONE, PLAYER_TWO, type EntityId, type NodeId, type PlayerId } from "./ids";

export type HexCoord = {
  q: number;
  r: number;
};

export type ResourcePool = Record<ResourceType, number>;

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
  ownerId: PlayerId;
  hp: number;
  coord: HexCoord;
};

export type UnitEntity = {
  id: EntityId;
  kind: "unit";
  ownerId: PlayerId;
  role: UnitRole;
  coord: HexCoord;
  carries: ResourceType | null;
  hasSummoningSickness: boolean;
  movesRemaining: number;
  attacksRemaining: number;
};

export type EntityState = BaseEntity | UnitEntity;

export type StackItem = {
  id: string;
  label: string;
  controllerId: PlayerId;
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
  map: MapState;
  players: Record<PlayerId, PlayerState>;
  entities: Record<EntityId, EntityState>;
  stack: StackItem[];
  log: MatchLogEntry[];
  winner: PlayerId | null;
};

type CreateInitialGameStateOptions = {
  map: MapState;
  matchId?: string;
};

function createEmptyResources(): ResourcePool {
  return {
    credits: 0,
    alloy: 0,
    flux: 0,
    biomass: 0,
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

export function createInitialGameState(options: CreateInitialGameStateOptions): GameState {
  const map = cloneMap(options.map);
  const baseOneId: EntityId = "base_player_1";
  const baseTwoId: EntityId = "base_player_2";

  const entities: Record<EntityId, EntityState> = {
    [baseOneId]: {
      id: baseOneId,
      kind: "base",
      ownerId: PLAYER_ONE,
      hp: 100,
      coord: { ...map.spawnPoints.player_1 },
    },
    [baseTwoId]: {
      id: baseTwoId,
      kind: "base",
      ownerId: PLAYER_TWO,
      hp: 100,
      coord: { ...map.spawnPoints.player_2 },
    },
  };

  return {
    stateVersion: 1,
    matchId: options.matchId ?? "match_frontier_belt",
    turn: 1,
    phase: "start",
    activePlayerId: PLAYER_ONE,
    priorityPlayerId: PLAYER_ONE,
    map,
    players: {
      player_1: {
        id: PLAYER_ONE,
        name: "Player 1",
        faction: "alloy_clan",
        resources: createEmptyResources(),
        handSize: 7,
        deckSize: 60,
        baseEntityId: baseOneId,
      },
      player_2: {
        id: PLAYER_TWO,
        name: "Player 2",
        faction: "flux_collective",
        resources: createEmptyResources(),
        handSize: 7,
        deckSize: 60,
        baseEntityId: baseTwoId,
      },
    },
    entities,
    stack: [],
    log: [
      {
        turn: 1,
        text: "Match initialized on Frontier Belt.",
      },
    ],
    winner: null,
  };
}
