import type { EntityId, PlayerId } from "../model/ids";
import type { ResourceType } from "../model/enums";
import type { GameState, HexCoord, StackItem } from "../model/state";
import type {
  ContinuousEffectPayload,
  EffectExpiry,
  EffectTargetFilter,
} from "../systems/continuousEffects";
import type { CounterDestination } from "../content/stackEffects";

// --- Atomic instruction types ---

export type GameInstruction =
  | { type: "DEAL_DAMAGE"; targetEntityId: EntityId; amount: number; sourceLabel: string }
  | { type: "DESTROY_ENTITY"; targetEntityId: EntityId; sourceLabel: string }
  | { type: "DEPLOY_UNIT"; cardId: string; controllerId: PlayerId; entityId?: string; spawnCoord?: HexCoord }
  | { type: "TRIGGER_BLOOM"; unitIds: EntityId[]; sourceLabel: string; sourceItemId: string; excludeEffectIdPrefix?: string }
  | {
      type: "APPLY_CONTINUOUS_EFFECT";
      effectId: string;
      sourceEntityId: EntityId | null;
      sourceCardId: string | null;
      controllerId: PlayerId;
      payload: ContinuousEffectPayload;
      target: EffectTargetFilter;
      expiry: EffectExpiry;
      layer: number;
    }
  | { type: "DRAW_CARDS"; playerId: PlayerId; count: number }
  | { type: "GAIN_RESOURCES"; playerId: PlayerId; resources: Partial<Record<ResourceType, number>> }
  | { type: "COUNTER_STACK_ITEM"; targetStackItemId: string; destination: CounterDestination; sourceLabel: string }
  | { type: "LOG"; text: string };

// --- Context provided to onResolve functions ---

export type InstructionContext = {
  state: Readonly<GameState>;
  item: StackItem;
  controllerId: PlayerId;
  targetEntityId: EntityId | null;
  targetStackItemId: string | null;
  targetHex: HexCoord | null;
};
