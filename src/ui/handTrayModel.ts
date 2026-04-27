import type { GamePhase } from "../game/model/enums";
import { PLAYER_ONE, type PlayerId } from "../game/model/ids";

type VisibleHandContext = {
  phase: GamePhase;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  localPlayerId?: PlayerId | null;
  networkLocalPlayerId?: PlayerId | null;
  revealNonLocalHands?: boolean;
};

export type VisibleHandState = {
  visiblePlayerId: PlayerId;
  showingPriorityHand: boolean;
};

export function getVisibleHandState({
  phase,
  activePlayerId,
  priorityPlayerId,
  localPlayerId,
  networkLocalPlayerId,
  revealNonLocalHands = false,
}: VisibleHandContext): VisibleHandState {
  if (networkLocalPlayerId) {
    return {
      visiblePlayerId: networkLocalPlayerId,
      showingPriorityHand: false,
    };
  }

  if (!revealNonLocalHands) {
    return {
      visiblePlayerId: localPlayerId ?? PLAYER_ONE,
      showingPriorityHand: false,
    };
  }

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
