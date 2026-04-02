import type { BotDecisionWorkerRequest, BotDecisionWorkerResponse } from "./botDecisionWorkerProtocol";
import { decideMinimaxBotCommand } from "./minimaxBot";
import { getLoadedContentSetIds, loadConfiguredContentSets } from "../content/loader";

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<BotDecisionWorkerRequest>) => void) | null;
  postMessage: (message: BotDecisionWorkerResponse) => void;
};

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
}

function ensureWorkerContentLoaded(builtInSetIds: readonly string[]): void {
  const current = getLoadedContentSetIds().sort();
  const requested = [...builtInSetIds].sort();
  if (arraysEqual(current, requested)) {
    return;
  }

  loadConfiguredContentSets({
    builtInSetIds: requested,
    reset: true,
  });
}

workerScope.onmessage = (event: MessageEvent<BotDecisionWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "decide") {
    return;
  }

  try {
    ensureWorkerContentLoaded(request.builtInSetIds);
    const command = decideMinimaxBotCommand(request.state, request.playerId);
    const response: BotDecisionWorkerResponse = {
      type: "result",
      requestId: request.requestId,
      stateVersion: request.stateVersion,
      playerId: request.playerId,
      command,
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: BotDecisionWorkerResponse = {
      type: "error",
      requestId: request.requestId,
      stateVersion: request.stateVersion,
      playerId: request.playerId,
      message: error instanceof Error ? error.message : "Unknown bot worker failure.",
    };
    workerScope.postMessage(response);
  }
};

export {};
