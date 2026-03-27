import { getCardDefinition } from "../content/cards/catalog";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import { hasLegalPlayCardTargetOption } from "../rules/cardPlayOptions";

type PlayableCardOptions = {
  assumePriorityPlayerId?: PlayerId;
};

export function hasAnyPlayableCard(
  state: Readonly<GameState>,
  playerId: PlayerId,
  options: PlayableCardOptions = {}
): boolean {
  const playableState: Readonly<GameState> = options.assumePriorityPlayerId
    ? { ...state, priorityPlayerId: options.assumePriorityPlayerId }
    : state;

  for (const cardInstance of playableState.zones[playerId].hand) {
    const card = getCardDefinition(cardInstance.cardId);
    if (!card) {
      continue;
    }

    if (hasLegalPlayCardTargetOption(playableState, playerId, cardInstance.instanceId, card)) {
      return true;
    }
  }

  return false;
}
