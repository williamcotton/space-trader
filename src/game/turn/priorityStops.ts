import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import { getOpponentPlayer } from "./stack";
import { hasAnyPlayableCard } from "./playableCards";

export type PriorityStopKey = "opponentMain" | "opponentTactical" | "opponentStack";

export type PriorityStopSettings = Record<PriorityStopKey, boolean>;
export type PlayerPriorityStopSettings = Record<PlayerId, PriorityStopSettings>;

export type PriorityStopWindow = {
  key: string;
  priorityPlayerId: PlayerId;
  yieldedToPlayerId: PlayerId;
  stopKey: PriorityStopKey;
};

export const PRIORITY_STOP_LABELS: Record<PriorityStopKey, string> = {
  opponentMain: "Opp Main",
  opponentTactical: "Opp Tac",
  opponentStack: "Opp Stack",
};

export function createDefaultPriorityStopSettings(): PriorityStopSettings {
  return {
    opponentMain: false,
    opponentTactical: false,
    opponentStack: false,
  };
}

export function createDefaultPlayerPriorityStopSettings(): PlayerPriorityStopSettings {
  return {
    player_1: {
      opponentMain: true,
      opponentTactical: true,
      opponentStack: true,
    },
    player_2: createDefaultPriorityStopSettings(),
  };
}

function createPhaseStopWindow(
  state: Readonly<GameState>,
  priorityPlayerId: PlayerId,
  yieldedToPlayerId: PlayerId,
  stopKey: PriorityStopKey
): PriorityStopWindow {
  return {
    key: `${stopKey}:${state.turn}:${state.phase}:${priorityPlayerId}`,
    priorityPlayerId,
    yieldedToPlayerId,
    stopKey,
  };
}

function createStackStopWindow(
  state: Readonly<GameState>,
  priorityPlayerId: PlayerId,
  yieldedToPlayerId: PlayerId
): PriorityStopWindow | null {
  const topItemId = state.stack[state.stack.length - 1]?.id;
  if (!topItemId) {
    return null;
  }

  return {
    key: `opponentStack:${state.turn}:${topItemId}:${priorityPlayerId}`,
    priorityPlayerId,
    yieldedToPlayerId,
    stopKey: "opponentStack",
  };
}

export function getPriorityStopWindow(
  state: Readonly<GameState>,
  botAutoplayEnabled: Readonly<Record<PlayerId, boolean>>,
  playerPriorityStopSettings: Readonly<PlayerPriorityStopSettings>
): PriorityStopWindow | null {
  const priorityPlayerId = state.priorityPlayerId;
  if (!priorityPlayerId || !botAutoplayEnabled[priorityPlayerId]) {
    return null;
  }

  const yieldedToPlayerId = getOpponentPlayer(priorityPlayerId);
  if (botAutoplayEnabled[yieldedToPlayerId]) {
    return null;
  }
  if (!hasAnyPlayableCard(state, yieldedToPlayerId, { assumePriorityPlayerId: yieldedToPlayerId })) {
    return null;
  }

  const settings = playerPriorityStopSettings[yieldedToPlayerId];
  if (state.stack.length > 0) {
    return settings.opponentStack ? createStackStopWindow(state, priorityPlayerId, yieldedToPlayerId) : null;
  }

  if (priorityPlayerId !== state.activePlayerId) {
    return null;
  }

  if (state.phase === "main" && settings.opponentMain) {
    return createPhaseStopWindow(state, priorityPlayerId, yieldedToPlayerId, "opponentMain");
  }

  if (state.phase === "tactical" && settings.opponentTactical) {
    return createPhaseStopWindow(state, priorityPlayerId, yieldedToPlayerId, "opponentTactical");
  }

  return null;
}
