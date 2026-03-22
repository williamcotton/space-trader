import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getCardDefinition, type CardCost } from "../game/content/cards/catalog";
import { isCounterResponse } from "../game/content/stackEffects";
import type { ResourceType } from "../game/model/enums";
import { formatFactionName, getResourceTheme, getUnitRoleTheme } from "../game/presentation";
import { getGameRuntime } from "../game/runtime";
import type { GameState } from "../game/model/state";
import { canAffordCost, getFirstOpenBaseAdjacentTile } from "../game/model/queries";
import { ResourceIcon } from "./ResourceIcon";

type HandCardView = {
  instanceId: string;
  cardId: string;
};

type UnitStatEntry = {
  label: string;
  value: number;
};

type CardTag = {
  label: string;
  tone: "neutral" | "speed" | "role";
  accent?: string;
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
  pendingTargetingCardInstanceId: string | null;
  pendingTargetingPrompt: string | null;
};

function getCostEntries(cost: CardCost): Array<{ resource: ResourceType; amount: number }> {
  return (["credits", "alloy", "flux", "biomass"] as const)
    .map((resource) => ({
      resource,
      amount: cost[resource] ?? 0,
    }))
    .filter((entry) => entry.amount > 0);
}

function readSnapshot(): HandSnapshot {
  const runtime = getGameRuntime();
  const state = runtime.state;
  const pendingTargeting = runtime.getPendingCardTargeting();
  const visiblePlayerId = state.activePlayerId as "player_1" | "player_2";
  const hand = [...state.zones[visiblePlayerId].hand].reverse().map((card) => ({
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
    hasOpenBaseAdjacentTile: !!getFirstOpenBaseAdjacentTile(state, visiblePlayerId),
    pendingTargetingCardInstanceId: pendingTargeting?.cardInstanceId ?? null,
    pendingTargetingPrompt: pendingTargeting?.prompt ?? null,
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
            subtitle: "Unknown",
            tags: [{ label: "Unknown Card", tone: "neutral" }] as CardTag[],
            costEntries: [] as Array<{ resource: ResourceType; amount: number }>,
            unitStats: [] as UnitStatEntry[],
            text: "Unknown card",
            counterTarget: undefined as string | undefined,
          };
        }

        const affordable = canAffordCost(snapshot.resources, definition.cost);
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

        const roleTag =
          definition.kind === "unit"
            ? (() => {
                const roleTheme = getUnitRoleTheme(definition.unit.role);
                return {
                  label: `${roleTheme.label} Unit`,
                  tone: "role" as const,
                  accent: roleTheme.accent,
                };
              })()
            : null;
        const tags: CardTag[] = [];
        if (definition.kind === "tactic") {
          tags.push({ label: "Tactic", tone: "neutral" });
        }
        if (roleTag) {
          tags.push(roleTag);
        }
        tags.push({ label: definition.speed === "instant" ? "Instant" : "Main", tone: "speed" });

        return {
          ...card,
          playable: !snapshot.winner && affordable && speedOk && deploymentOk && counterOk,
          title: definition.name,
          subtitle: formatFactionName(definition.faction),
          tags,
          costEntries: getCostEntries(definition.cost),
          unitStats:
            definition.kind === "unit"
              ? [
                  { label: "HP", value: definition.unit.hp },
                  { label: "ATK", value: definition.unit.attackDamage },
                  { label: "ARM", value: definition.unit.armor },
                  { label: "RNG", value: definition.unit.attackRange },
                  { label: "MOV", value: definition.unit.moveRange },
                  { label: "SG", value: definition.unit.siegeDamageBonus },
                ]
              : [],
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
      {snapshot.pendingTargetingPrompt ? <p className="hand-tray-targeting-hint">{snapshot.pendingTargetingPrompt}</p> : null}
      <div className="hand-tray-cards">
        {cards.length === 0 ? (
          <p className="hand-tray-empty">No cards in hand.</p>
        ) : (
          cards.map((card) => (
            <button
              key={card.instanceId}
              type="button"
              className={[
                "hand-card",
                card.playable ? "playable" : "blocked",
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
