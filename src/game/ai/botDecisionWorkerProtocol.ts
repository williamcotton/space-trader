import type { GameCommand } from "../actions/commands";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";

export type BotDecisionWorkerRequest = {
  type: "decide";
  requestId: number;
  stateVersion: number;
  playerId: PlayerId;
  builtInSetIds: string[];
  state: GameState;
};

export type BotDecisionWorkerResult = {
  type: "result";
  requestId: number;
  stateVersion: number;
  playerId: PlayerId;
  command: GameCommand | null;
};

export type BotDecisionWorkerError = {
  type: "error";
  requestId: number;
  stateVersion: number;
  playerId: PlayerId;
  message: string;
};

export type BotDecisionWorkerResponse = BotDecisionWorkerResult | BotDecisionWorkerError;
