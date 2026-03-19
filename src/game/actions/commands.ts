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

export type PassPriorityCommand = {
  type: "PASS_PRIORITY";
  playerId: PlayerId;
};

export type RespondStackCommand = {
  type: "RESPOND_STACK";
  playerId: PlayerId;
  label: string;
  effectId: string;
  targetStackItemId?: string;
};

export type SelectEntityCommand = {
  type: "SELECT_ENTITY";
  playerId: PlayerId;
  entityId: EntityId;
};

export type ClearSelectionCommand = {
  type: "CLEAR_SELECTION";
  playerId: PlayerId;
  reason: "clicked_outside_map" | "clicked_empty_or_enemy_tile" | "clicked_selected_unit";
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
  | PassPriorityCommand
  | RespondStackCommand
  | SelectEntityCommand
  | ClearSelectionCommand
  | MoveUnitCommand
  | AttackUnitCommand;
