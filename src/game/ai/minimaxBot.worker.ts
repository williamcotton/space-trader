import type { BotDecisionWorkerRequest, BotDecisionWorkerResponse } from "./botDecisionWorkerProtocol";
import { decideMinimaxBotCommand } from "./minimaxBot";

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<BotDecisionWorkerRequest>) => void) | null;
  postMessage: (message: BotDecisionWorkerResponse) => void;
};

workerScope.onmessage = (event: MessageEvent<BotDecisionWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "decide") {
    return;
  }

  try {
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
