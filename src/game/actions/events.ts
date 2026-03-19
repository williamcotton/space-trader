import type { EntityId, NodeId, PlayerId } from "../model/ids";
import type { GamePhase, ResourceType } from "../model/enums";
import type { HexCoord } from "../model/state";
import type { CardCost, UnitTemplate } from "../content/cards/catalog";

export type PhaseAdvancedEvent = {
  type: "PHASE_ADVANCED";
  activePlayerId: PlayerId;
  turn: number;
  phase: GamePhase;
};

export type EntitySelectedEvent = {
  type: "ENTITY_SELECTED";
  playerId: PlayerId;
  entityId: EntityId;
};

export type SelectionClearedEvent = {
  type: "SELECTION_CLEARED";
  playerId: PlayerId;
  previousEntityId: EntityId | null;
  reason: "clicked_outside_map" | "clicked_empty_or_enemy_tile" | "clicked_selected_unit";
};

export type UnitMovedEvent = {
  type: "UNIT_MOVED";
  playerId: PlayerId;
  entityId: EntityId;
  from: HexCoord;
  to: HexCoord;
  movesRemaining: number;
};

export type UnitAttackDeclaredEvent = {
  type: "UNIT_ATTACK_DECLARED";
  playerId: PlayerId;
  attackerId: EntityId;
  targetId: EntityId;
  attacksRemaining: number;
  damageDealt: number;
  targetHpRemaining: number;
  targetDestroyed: boolean;
  winnerPlayerId: PlayerId | null;
};

export type UnitHarvestedNodeEvent = {
  type: "UNIT_HARVESTED_NODE";
  playerId: PlayerId;
  entityId: EntityId;
  nodeId: NodeId;
  resourceType: ResourceType;
};

export type CardPlayedToStackEvent = {
  type: "CARD_PLAYED_TO_STACK";
  playerId: PlayerId;
  cardInstanceId: string;
  cardId: string;
  cardName: string;
  cost: CardCost;
  stackItemId: string;
  effectId: string;
  effectMagnitude: number;
  targetStackItemId: string | null;
  objectKind: "spell" | "ability";
  counterable: boolean;
  defaultCounterDestination: "discard" | "hand" | "exile" | "none";
  nextPriorityPlayerId: PlayerId;
};

export type CardPlayedToBattlefieldEvent = {
  type: "CARD_PLAYED_TO_BATTLEFIELD";
  playerId: PlayerId;
  cardInstanceId: string;
  cardId: string;
  cardName: string;
  cost: CardCost;
  unitEntityId: EntityId;
  spawnCoord: HexCoord;
  unit: UnitTemplate;
};

export type PriorityPassedEvent = {
  type: "PRIORITY_PASSED";
  playerId: PlayerId;
  nextPriorityPlayerId: PlayerId;
  consecutivePasses: number;
};

export type StackItemPushedEvent = {
  type: "STACK_ITEM_PUSHED";
  playerId: PlayerId;
  itemId: string;
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
  nextPriorityPlayerId: PlayerId;
};

export type StackItemResolvedEvent = {
  type: "STACK_ITEM_RESOLVED";
  itemId: string;
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
};

export type UnitMovedEventPayload = Omit<UnitMovedEvent, "type">;

export type UnitMovedEventWithCargo = UnitMovedEvent & {
  carriedCargo: ResourceType | null;
};

export type GameEvent =
  | PhaseAdvancedEvent
  | EntitySelectedEvent
  | SelectionClearedEvent
  | UnitMovedEvent
  | UnitAttackDeclaredEvent
  | UnitHarvestedNodeEvent
  | CardPlayedToStackEvent
  | CardPlayedToBattlefieldEvent
  | PriorityPassedEvent
  | StackItemPushedEvent
  | StackItemResolvedEvent;
