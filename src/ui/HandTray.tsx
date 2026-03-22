import type { CSSProperties } from "react";
import { getResourceTheme } from "../game/presentation";
import { getGameRuntime } from "../game/runtime";
import type { PlayerId } from "../game/model/ids";
import { MAX_HAND_SIZE } from "../game/model/state";
import { getCardDisplayInfo, type CardTag, type CostEntry, type UnitStatEntry } from "../game/model/selectors";
import { ResourceIcon } from "./ResourceIcon";
import { useGameSnapshot } from "./useGameSnapshot";

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
  const visiblePlayerId = state.activePlayerId as PlayerId;
  const discardPhase = state.phase === "discard";

  const cards = [...state.zones[visiblePlayerId].hand].reverse().map((card) =>
    getCardDisplayInfo(state, visiblePlayerId, card.cardId, card.instanceId)
  );

  return {
    visiblePlayerId,
    cards,
    deckCount: state.zones[visiblePlayerId].deck.length,
    discardPhase,
    requiredDiscards: Math.max(0, state.zones[visiblePlayerId].hand.length - MAX_HAND_SIZE),
    pendingTargetingCardInstanceId: discardPhase ? null : pendingTargeting?.cardInstanceId ?? null,
    pendingTargetingPrompt: discardPhase ? null : pendingTargeting?.prompt ?? null,
  };
}

export function HandTray() {
  const runtime = getGameRuntime();
  const snapshot = useGameSnapshot(readSnapshot);
  const discardPrompt = snapshot.discardPhase
    ? `Discard ${snapshot.requiredDiscards} card${snapshot.requiredDiscards === 1 ? "" : "s"} to reach ${MAX_HAND_SIZE}.`
    : null;

  return (
    <section className="hand-tray" aria-label="Hand tray">
      <header className="hand-tray-header">
        <span>Hand - {snapshot.visiblePlayerId}</span>
        <span>
          Hand {snapshot.cards.length} | Deck {snapshot.deckCount}
        </span>
      </header>
      {discardPrompt ? <p className="hand-tray-targeting-hint">{discardPrompt}</p> : null}
      {snapshot.pendingTargetingPrompt ? <p className="hand-tray-targeting-hint">{snapshot.pendingTargetingPrompt}</p> : null}
      <div className="hand-tray-cards">
        {snapshot.cards.length === 0 ? (
          <p className="hand-tray-empty">No cards in hand.</p>
        ) : (
          snapshot.cards.map((card) => (
            <button
              key={card.instanceId}
              type="button"
              className={[
                "hand-card",
                snapshot.discardPhase || card.playable ? "playable" : "blocked",
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
          ))
        )}
      </div>
    </section>
  );
}
