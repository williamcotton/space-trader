import type { EntityId, PlayerId } from "../model/ids";
import type { HexCoord } from "../model/state";

export type AdvancePhaseCommand = {
  type: "ADVANCE_PHASE";
  playerId: PlayerId;
};

export type EndPhaseCommand = {
  type: "END_PHASE";
  playerId: PlayerId;
};

export type SelectEntityCommand = {
  type: "SELECT_ENTITY";
  playerId: PlayerId;
  entityId: EntityId;
};

export type MoveUnitCommand = {
  type: "MOVE_UNIT";
  playerId: PlayerId;
  entityId: EntityId;
  to: HexCoord;
};

export type AttackUnitCommand = {
  type: "ATTACK_UNIT";
  playerId: PlayerId;
  attackerId: EntityId;
  targetId: EntityId;
};

export type GameCommand =
  | AdvancePhaseCommand
  | EndPhaseCommand
  | SelectEntityCommand
  | MoveUnitCommand
  | AttackUnitCommand;
