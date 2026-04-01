import type { PlayerId } from "../model/ids";
import type { GameCommand } from "../actions/commands";
import type { GameState } from "../model/state";
import {
  chooseCounterCommand,
  chooseDiscardCardCommand,
  chooseMainPhaseCardCommand,
  chooseTacticCardCommand,
} from "./mvpBot/cardChoices";
import { chooseTacticalCommand } from "./mvpBot/tactical";

export function decideMvpBotCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  if (state.winner) {
    return null;
  }

  if (state.priorityPlayerId !== botPlayerId) {
    return null;
  }

  if (state.activePlayerId !== botPlayerId) {
    const reaction = chooseCounterCommand(state, botPlayerId);
    if (reaction) {
      return reaction;
    }

    return {
      type: "PASS_PRIORITY",
      playerId: botPlayerId,
    };
  }

  if (state.stack.length > 0) {
    const reaction = chooseCounterCommand(state, botPlayerId);
    if (reaction) {
      return reaction;
    }

    return {
      type: "PASS_PRIORITY",
      playerId: botPlayerId,
    };
  }

  if (state.phase === "main") {
    const tactic = chooseTacticCardCommand(state, botPlayerId);
    if (tactic) {
      return tactic;
    }

    const playCard = chooseMainPhaseCardCommand(state, botPlayerId);
    if (playCard) {
      return playCard;
    }
  }

  if (state.phase === "tactical") {
    const tactic = chooseTacticCardCommand(state, botPlayerId);
    if (tactic) {
      return tactic;
    }

    return chooseTacticalCommand(state, botPlayerId);
  }

  if (state.phase === "discard") {
    const discard = chooseDiscardCardCommand(state, botPlayerId);
    if (discard) {
      return discard;
    }
  }

  return {
    type: "END_PHASE",
    playerId: botPlayerId,
  };
}
