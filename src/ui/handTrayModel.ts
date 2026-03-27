import type { GamePhase } from "../game/model/enums";
import type { PlayerId } from "../game/model/ids";

type VisibleHandContext = {
  phase: GamePhase;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
};

export type VisibleHandState = {
  visiblePlayerId: PlayerId;
  showingPriorityHand: boolean;
};

export function getVisibleHandState({
  phase,
  activePlayerId,
  priorityPlayerId,
}: VisibleHandContext): VisibleHandState {
  if (phase === "discard") {
    return {
      visiblePlayerId: activePlayerId,
      showingPriorityHand: false,
    };
  }

  const visiblePlayerId = priorityPlayerId ?? activePlayerId;
  return {
    visiblePlayerId,
    showingPriorityHand: visiblePlayerId !== activePlayerId,
  };
}
