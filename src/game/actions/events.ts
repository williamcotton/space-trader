import type { EntityId, PlayerId } from "../model/ids";
import type { GamePhase, ResourceType } from "../model/enums";
import type { HexCoord } from "../model/state";

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

export type UnitMovedEventPayload = Omit<UnitMovedEvent, "type">;

export type UnitMovedEventWithCargo = UnitMovedEvent & {
  carriedCargo: ResourceType | null;
};

export type GameEvent = PhaseAdvancedEvent | EntitySelectedEvent | UnitMovedEvent | UnitAttackDeclaredEvent;
