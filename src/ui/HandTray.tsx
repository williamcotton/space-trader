import type { CSSProperties } from "react";
import { getResourceTheme } from "../game/presentation";
import { getPlayerLabel } from "../game/presentation";
import { getGameRuntime } from "../game/runtime";
import { PLAYER_ONE, type PlayerId } from "../game/model/ids";
import { MAX_HAND_SIZE } from "../game/model/state";
import { getCardDisplayInfo, type CardTag, type CostEntry, type UnitStatEntry } from "../game/model/selectors";
import { ResourceIcon } from "./ResourceIcon";
import { getVisibleHandState } from "./handTrayModel";
import { useGameSnapshot } from "./useGameSnapshot";

const REVEAL_NON_LOCAL_HANDS = import.meta.env.DEV && import.meta.env.VITE_BOOT_FLOW === "direct_match";

type HandCardSnapshot = {
  instanceId: string;
  cardId: string;
  playable: boolean;
  title: string;
  subtitle: string;
  tags: CardTag[];
  costEntries: CostEntry[];
  unitStats: UnitStatEntry[];
  text: string;
  counterTarget: string | undefined;
};

type HandSnapshot = {
  visiblePlayerId: PlayerId;
  showingPriorityHand: boolean;
  cards: HandCardSnapshot[];
  deckCount: number;
  discardPhase: boolean;
  requiredDiscards: number;
  pendingTargetingCardInstanceId: string | null;
  pendingTargetingPrompt: string | null;
};

function readSnapshot(): HandSnapshot {
  const runtime = getGameRuntime();
  const state = runtime.state;
  const pendingTargeting = runtime.getPendingCardTargeting();
  const discardPhase = state.phase === "discard";
  const { visiblePlayerId, showingPriorityHand } = getVisibleHandState({
    phase: state.phase,
    activePlayerId: state.activePlayerId,
    priorityPlayerId: state.priorityPlayerId,
    localPlayerId: PLAYER_ONE,
    networkLocalPlayerId: runtime.getNetworkLocalPlayerId(),
    revealNonLocalHands: REVEAL_NON_LOCAL_HANDS,
  });
  const canDiscardFromVisibleHand = discardPhase && visiblePlayerId === state.activePlayerId;
  const localPlayerId = runtime.getNetworkLocalPlayerId() ?? PLAYER_ONE;
  const canVisiblePlayerAct =
    REVEAL_NON_LOCAL_HANDS ||
    (visiblePlayerId === localPlayerId &&
      (discardPhase ? state.activePlayerId === visiblePlayerId : state.priorityPlayerId === visiblePlayerId));

  const cards = [...state.zones[visiblePlayerId].hand].reverse().map((card) => {
    const displayInfo = getCardDisplayInfo(state, visiblePlayerId, card.cardId, card.instanceId);
    return canVisiblePlayerAct ? displayInfo : { ...displayInfo, playable: false, counterTarget: undefined };
  });

  return {
    visiblePlayerId,
    showingPriorityHand,
    cards,
    deckCount: state.zones[visiblePlayerId].deck.length,
    discardPhase: canDiscardFromVisibleHand,
    requiredDiscards: canDiscardFromVisibleHand ? Math.max(0, state.zones[visiblePlayerId].hand.length - MAX_HAND_SIZE) : 0,
    pendingTargetingCardInstanceId: discardPhase ? null : pendingTargeting?.cardInstanceId ?? null,
    pendingTargetingPrompt: discardPhase ? null : pendingTargeting?.prompt ?? null,
  };
}

export function HandTray() {
  const runtime = getGameRuntime();
  const snapshot = useGameSnapshot(readSnapshot);
  const priorityPrompt = snapshot.showingPriorityHand
    ? `Response window: showing ${getPlayerLabel(snapshot.visiblePlayerId)} because they currently hold priority.`
    : null;
  const discardPrompt = snapshot.discardPhase
    ? `Discard ${snapshot.requiredDiscards} card${snapshot.requiredDiscards === 1 ? "" : "s"} to reach ${MAX_HAND_SIZE}.`
    : null;

  return (
    <section className="hand-tray" aria-label="Hand tray">
      <header className="hand-tray-header">
        <span>
          {getPlayerLabel(snapshot.visiblePlayerId)} Hand
          {snapshot.showingPriorityHand ? " · Priority" : ""}
          {priorityPrompt ? <span className="hand-tray-targeting-hint"> {priorityPrompt}</span> : null}
          {discardPrompt ? <span className="hand-tray-targeting-hint"> {discardPrompt}</span> : null}
          {snapshot.pendingTargetingPrompt ? <span className="hand-tray-targeting-hint"> {snapshot.pendingTargetingPrompt}</span> : null}
        </span>
        <span>
          {snapshot.cards.length} in hand · {snapshot.deckCount} in deck
        </span>
      </header>
      <div className="hand-tray-cards">
        {snapshot.cards.length === 0 ? (
          <p className="hand-tray-empty">No cards in hand.</p>
        ) : (
          snapshot.cards.map((card) => {
            const canUseCard = snapshot.discardPhase || card.playable;
            return (
              <button
                key={card.instanceId}
                type="button"
                disabled={!canUseCard}
                className={[
                  "hand-card",
                  canUseCard ? "playable" : "blocked",
                  snapshot.pendingTargetingCardInstanceId === card.instanceId ? "targeting" : "",
                ].join(" ")}
                onClick={() => runtime.playCardFromHand(card.instanceId, card.counterTarget)}
              >
                <span className="hand-card-title">{card.title}</span>
                <span className="hand-card-subtitle">{card.subtitle}</span>
                <span className="hand-card-tags">
                  {card.tags.map((tag) => (
                    <span
                      key={tag.label}
                      className={`hand-card-tag ${tag.tone}`}
                      style={tag.accent ? ({ "--hand-card-tag-accent": tag.accent } as CSSProperties) : undefined}
                    >
                      {tag.label}
                    </span>
                  ))}
                </span>
                <span className="hand-card-cost">
                  {card.costEntries.length === 0 ? (
                    <span className="resource-cost-chip free">Free</span>
                  ) : (
                    card.costEntries.map((entry) => (
                      <span key={entry.resource} className="resource-cost-chip" title={getResourceTheme(entry.resource).label}>
                        <ResourceIcon resource={entry.resource} />
                        <strong>{entry.amount}</strong>
                      </span>
                    ))
                  )}
                </span>
                {card.unitStats.length > 0 ? (
                  <span className="hand-card-stats">
                    {card.unitStats.map((stat) => (
                      <span key={stat.label} className="hand-card-stat">
                        <small>{stat.label}</small>
                        <strong>{stat.value}</strong>
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className="hand-card-text">{card.text}</span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
