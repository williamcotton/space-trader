import type { GameCommand } from "../actions/commands";
import type { DispatchResult } from "../actions/reducers";
import type { decideMinimaxBotCommand } from "../ai/minimaxBot";
import type { PlayerId } from "../model/ids";
import type { GameState, HexCoord } from "../model/state";

export type BotDecisionSystem = typeof decideMinimaxBotCommand;

export type PendingCardTargeting = {
  playerId: PlayerId;
  cardInstanceId: string;
  cardName: string;
  targetMode: "entity" | "hex";
  targetStackItemId?: string;
  prompt: string;
};

export type PendingAttackTargeting = {
  playerId: PlayerId;
  attackerId: string;
  attackerName: string;
  prompt: string;
};

export type RuntimeNetworkSession = {
  matchId: string;
  localPlayerId: PlayerId;
  submitCommand: (command: GameCommand) => void;
  canSubmitCommand?: () => boolean;
  getBlockedReason?: () => string | null;
};

export type RuntimeDispatchOptions = {
  scheduleAutomation?: boolean;
  animate?: boolean;
};

export type RuntimeCommandDispatcher = {
  dispatch(command: GameCommand): DispatchResult;
};

export type RuntimeTargetingHost = RuntimeCommandDispatcher & {
  state: GameState;
  canLocalPlayerActAs(playerId: PlayerId): boolean;
  getNetworkLocalPlayerId(): PlayerId | null;
  isNetworkedMatch(): boolean;
  notifyStateChanged(): void;
  notifyTransientChanged(): void;
};

export type RuntimeTransientSnapshot = {
  hoveredHex: HexCoord | null;
  pendingAttackTargeting: PendingAttackTargeting | null;
};
