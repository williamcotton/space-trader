import type { GameCommand } from "../actions/commands";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import { decideMvpBotCommand } from "./mvpBot";
import { chooseBestActionPlan } from "./minimax/search";

export function decideMinimaxBotCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  if (state.winner || state.priorityPlayerId !== botPlayerId) {
    return null;
  }

  const bestPlan = chooseBestActionPlan(state, botPlayerId);
  if (bestPlan && bestPlan.commands[0]) {
    return bestPlan.commands[0];
  }

  return decideMvpBotCommand(state, botPlayerId);
}
