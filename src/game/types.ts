import type { ResourceType } from "./model/enums";
import type { PlayerId } from "./model/ids";
import type { GameState, HexCoord } from "./model/state";

export type CanvasAnimation =
  | {
      id: string;
      kind: "move";
      playerId: PlayerId;
      ageSeconds: number;
      durationSeconds: number;
      from: HexCoord;
      to: HexCoord;
    }
  | {
      id: string;
      kind: "attack";
      playerId: PlayerId;
      ageSeconds: number;
      durationSeconds: number;
      from: HexCoord;
      to: HexCoord;
      damage: number;
      targetDestroyed: boolean;
    }
  | {
      id: string;
      kind: "harvest";
      playerId: PlayerId;
      ageSeconds: number;
      durationSeconds: number;
      coord: HexCoord;
      resourceType: ResourceType;
    }
  | {
      id: string;
      kind: "deploy";
      playerId: PlayerId;
      ageSeconds: number;
      durationSeconds: number;
      coord: HexCoord;
    }
  | {
      id: string;
      kind: "base_hit";
      playerId: PlayerId;
      ageSeconds: number;
      durationSeconds: number;
      coord: HexCoord;
      damage: number;
    }
  | {
      id: string;
      kind: "stack_cast";
      playerId: PlayerId;
      ageSeconds: number;
      durationSeconds: number;
      from: HexCoord;
      label: string;
      visual: "unit" | "counter" | "tactic" | "generic";
    }
  | {
      id: string;
      kind: "stack_counter";
      playerId: PlayerId;
      ageSeconds: number;
      durationSeconds: number;
      from: HexCoord;
      label: string;
      targetLabel: string;
      targetVisual: "unit" | "counter" | "tactic" | "generic";
      returnToHand: boolean;
    }
  | {
      id: string;
      kind: "spell_resolve";
      playerId: PlayerId;
      ageSeconds: number;
      durationSeconds: number;
      coord: HexCoord;
      visual: "damage" | "destroy" | "buff" | "base_damage";
      amount?: number;
      label: string;
    };

export type FrameTransients = {
  animations: CanvasAnimation[];
  timeSeconds: number;
};

export type GameViewport = {
  width: number;
  height: number;
};

export type GameFrame = {
  context: CanvasRenderingContext2D;
  viewport: GameViewport;
  deltaSeconds: number;
  transients: FrameTransients;
};

export type UpdateSystem = (state: GameState, frame: GameFrame) => void;
export type RenderSystem = (state: GameState, frame: GameFrame) => void;
