import { useEffect, useMemo, useState } from "react";
import { getCardDefinition, type CardCost } from "../game/content/cards/catalog";
import { isCounterResponse } from "../game/content/stackEffects";
import type { ResourceType } from "../game/model/enums";
import { formatFactionName, getResourceTheme } from "../game/presentation";
import { getGameRuntime } from "../game/runtime";
import type { GameState } from "../game/model/state";
import { ResourceIcon } from "./ResourceIcon";

type HandCardView = {
  instanceId: string;
  cardId: string;
};

type HandSnapshot = {
  visiblePlayerId: "player_1" | "player_2";
  activePlayerId: "player_1" | "player_2";
  phase: GameState["phase"];
  hasPriority: boolean;
  stackTopId: string | null;
  resources: GameState["players"]["player_1"]["resources"];
  hand: HandCardView[];
  deckCount: number;
  stackSize: number;
  winner: GameState["winner"];
  hasOpenBaseAdjacentTile: boolean;
};

function getCostEntries(cost: CardCost): Array<{ resource: ResourceType; amount: number }> {
  return (["credits", "alloy", "flux", "biomass"] as const)
    .map((resource) => ({
      resource,
      amount: cost[resource] ?? 0,
    }))
    .filter((entry) => entry.amount > 0);
}

function canAfford(resources: HandSnapshot["resources"], cost: CardCost): boolean {
  return (
    resources.credits >= (cost.credits ?? 0) &&
    resources.alloy >= (cost.alloy ?? 0) &&
    resources.flux >= (cost.flux ?? 0) &&
    resources.biomass >= (cost.biomass ?? 0)
  );
}

function hasOpenBaseAdjacentTile(state: GameState, playerId: "player_1" | "player_2"): boolean {
  const baseId = state.players[playerId].baseEntityId;
  const base = state.entities[baseId];
  if (!base || base.kind !== "base") {
    return false;
  }

  const candidates = [
    { q: base.coord.q + 1, r: base.coord.r },
    { q: base.coord.q + 1, r: base.coord.r - 1 },
    { q: base.coord.q, r: base.coord.r - 1 },
    { q: base.coord.q - 1, r: base.coord.r },
    { q: base.coord.q - 1, r: base.coord.r + 1 },
    { q: base.coord.q, r: base.coord.r + 1 },
  ];

  return candidates.some((coord) => {
    if (coord.q < -Math.floor(state.map.width / 2) || coord.q > Math.floor(state.map.width / 2)) {
      return false;
    }
    if (coord.r < -Math.floor(state.map.height / 2) || coord.r > Math.floor(state.map.height / 2)) {
      return false;
    }
    return !Object.values(state.entities).some((entity) => entity.coord.q === coord.q && entity.coord.r === coord.r);
  });
}

function readSnapshot(): HandSnapshot {
  const runtime = getGameRuntime();
  const state = runtime.state;
  const visiblePlayerId = state.activePlayerId as "player_1" | "player_2";
  const hand = state.zones[visiblePlayerId].hand.map((card) => ({
    instanceId: card.instanceId,
    cardId: card.cardId,
  }));

  return {
    visiblePlayerId,
    activePlayerId: state.activePlayerId,
    phase: state.phase,
    hasPriority: state.priorityPlayerId === visiblePlayerId,
    stackTopId: state.stack[state.stack.length - 1]?.id ?? null,
    resources: state.players[visiblePlayerId].resources,
    hand,
    deckCount: state.zones[visiblePlayerId].deck.length,
    stackSize: state.stack.length,
    winner: state.winner,
    hasOpenBaseAdjacentTile: hasOpenBaseAdjacentTile(state, visiblePlayerId),
  };
}

export function HandTray() {
  const runtime = getGameRuntime();
  const [snapshot, setSnapshot] = useState<HandSnapshot>(() => readSnapshot());

  useEffect(() => {
    const refresh = () => {
      setSnapshot(readSnapshot());
    };

    const timer = window.setInterval(refresh, 120);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const cards = useMemo(
    () =>
      snapshot.hand.map((card) => {
        const definition = getCardDefinition(card.cardId);
        if (!definition) {
          return {
            ...card,
            playable: false,
            title: card.cardId,
            subtitle: "unknown",
            costEntries: [] as Array<{ resource: ResourceType; amount: number }>,
            text: "Unknown card",
            counterTarget: undefined as string | undefined,
          };
        }

        const affordable = canAfford(snapshot.resources, definition.cost);
        const speedOk = definition.speed === "instant" ? snapshot.hasPriority : snapshot.activePlayerId === snapshot.visiblePlayerId && snapshot.phase === "main" && snapshot.stackSize === 0;
        const deploymentOk = definition.kind === "unit" ? snapshot.hasOpenBaseAdjacentTile : true;
        const counterTarget =
          definition.kind === "tactic" && isCounterResponse(definition.stackEffectId)
            ? snapshot.stackTopId ?? undefined
            : undefined;
        const counterOk =
          definition.kind === "tactic" && isCounterResponse(definition.stackEffectId)
            ? Boolean(counterTarget)
            : true;

        return {
          ...card,
          playable: !snapshot.winner && affordable && speedOk && deploymentOk && counterOk,
          title: definition.name,
          subtitle: `${formatFactionName(definition.faction)} · ${definition.kind} · ${definition.speed}`,
          costEntries: getCostEntries(definition.cost),
          text: definition.text,
          counterTarget,
        };
      }),
    [snapshot]
  );

  return (
    <section className="hand-tray" aria-label="Hand tray">
      <header className="hand-tray-header">
        <span>Hand - {snapshot.visiblePlayerId}</span>
        <span>
          Hand {snapshot.hand.length} | Deck {snapshot.deckCount}
        </span>
      </header>
      <div className="hand-tray-cards">
        {cards.length === 0 ? (
          <p className="hand-tray-empty">No cards in hand.</p>
        ) : (
          cards.map((card) => (
            <button
              key={card.instanceId}
              type="button"
              className={["hand-card", card.playable ? "playable" : "blocked"].join(" ")}
              onClick={() => runtime.playCardFromHand(card.instanceId, card.counterTarget)}
            >
              <span className="hand-card-title">{card.title}</span>
              <span className="hand-card-subtitle">{card.subtitle}</span>
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
              <span className="hand-card-text">{card.text}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
