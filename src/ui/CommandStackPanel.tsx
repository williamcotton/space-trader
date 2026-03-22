import { useState } from "react";
import { getCardDefinition } from "../game/content/cards/catalog";
import { getStackEffectDefinition } from "../game/content/stackEffects";
import { getEntityDisplayName, getPlayerLabel } from "../game/presentation";
import { getGameRuntime } from "../game/runtime";
import { useGameSnapshot } from "./useGameSnapshot";

type StackPreviewItem = {
  id: string;
  label: string;
  controllerId: string;
  effectId: string;
  counterable: boolean;
  kindLabel: string;
  detail: string;
  ownerLabel: string;
};

type HistoryEntry = {
  id: string;
  turn: number;
  text: string;
};

type CommandStackSnapshot = {
  stackItems: StackPreviewItem[];
  historyEntries: HistoryEntry[];
};

function readPanelSnapshot(): CommandStackSnapshot {
  const runtime = getGameRuntime();
  const currentState = runtime.state;
  const stackItems = runtime.state.stack.map((item) => ({
    id: item.id,
    label: item.label,
    controllerId: item.controllerId,
    effectId: item.effectId,
    counterable: item.counterable,
    kindLabel: (() => {
      const sourceCard = item.sourceCardId ? getCardDefinition(item.sourceCardId) : undefined;
      if (sourceCard?.kind === "unit" && item.effectId === "deploy_unit_card") {
        return "Unit Spell";
      }
      if (sourceCard?.kind === "tactic") {
        return "Tactic";
      }
      const effect = getStackEffectDefinition(item.effectId);
      if (effect?.resolution.type === "counter") {
        return "Counter";
      }
      if (effect?.resolution.type === "damage_enemy_base") {
        return "Strike";
      }
      return item.objectKind === "ability" ? "Ability" : "Spell";
    })(),
    detail: (() => {
      const sourceCard = item.sourceCardId ? getCardDefinition(item.sourceCardId) : undefined;
      const targetEntity = item.targetEntityId ? currentState.entities[item.targetEntityId] : null;
      const targetStackItem = item.targetStackItemId ? currentState.stack.find((stackItem) => stackItem.id === item.targetStackItemId) : null;
      if (sourceCard?.kind === "unit" && item.effectId === "deploy_unit_card") {
        return `${sourceCard.unit.role} · ${sourceCard.unit.hp} HP · deploy near base on resolve`;
      }
      if (sourceCard?.kind === "tactic") {
        if (targetEntity) {
          return `${sourceCard.text} Target: ${getEntityDisplayName(targetEntity, { players: currentState.players })}.`;
        }
        if (targetStackItem) {
          return `${sourceCard.text} Target: ${targetStackItem.label}.`;
        }
        return sourceCard.text;
      }
      const effect = getStackEffectDefinition(item.effectId);
      if (effect?.resolution.type === "counter") {
        const baseText = effect.resolution.destination === "hand" ? "Counter target spell and return it to hand." : "Counter target spell.";
        return targetStackItem ? `${baseText} Target: ${targetStackItem.label}.` : baseText;
      }
      if (effect?.resolution.type === "damage_enemy_base") {
        return `Deal ${effect.resolution.amount} damage to the enemy base.`;
      }
      if (targetEntity) {
        return `${effect?.label ?? item.effectId} targeting ${getEntityDisplayName(targetEntity, { players: currentState.players })}.`;
      }
      return effect?.label ?? item.effectId;
    })(),
    ownerLabel: getPlayerLabel(item.controllerId === "player_1" ? "player_1" : "player_2"),
  }));
  const historyWindow = runtime.state.log.slice(-18);
  const historyEntries = historyWindow
    .map((entry, index) => ({
      id: `log_${runtime.state.log.length - historyWindow.length + index}_${entry.turn}`,
      turn: entry.turn,
      text: entry.text,
    }))
    .reverse();

  return {
    stackItems,
    historyEntries,
  };
}

export function CommandStackPanel() {
  const snapshot = useGameSnapshot(readPanelSnapshot);
  const [viewMode, setViewMode] = useState<"stack" | "history">("stack");

  return (
    <aside className="command-stack-panel">
      <div className="command-stack-header">
        <div>
          <p className="command-stack-title">Command Stack</p>
          <p className="command-stack-subtitle">
            {viewMode === "stack"
              ? snapshot.stackItems.length > 0
                ? `${snapshot.stackItems.length} item${snapshot.stackItems.length === 1 ? "" : "s"} pending`
                : "Empty"
              : `${snapshot.historyEntries.length} recent event${snapshot.historyEntries.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="command-stack-header-actions">
          <div className="command-stack-view-toggle" role="tablist" aria-label="Command stack views">
            <button
              type="button"
              className={viewMode === "stack" ? "active" : ""}
              onClick={() => setViewMode("stack")}
            >
              Stack
            </button>
            <button
              type="button"
              className={viewMode === "history" ? "active" : ""}
              onClick={() => setViewMode("history")}
            >
              History
            </button>
          </div>
          <span className={["command-stack-badge", snapshot.stackItems.length > 0 ? "top" : "none"].join(" ")}>
            {viewMode === "stack"
              ? snapshot.stackItems.length > 0
                ? "Top Resolves First"
                : "No Stack"
              : "Recent Log"}
          </span>
        </div>
      </div>

      {viewMode === "stack" ? (
      <ul className="command-stack-list">
        {snapshot.stackItems.length === 0 ? (
          <li className="command-stack-empty">Stack empty</li>
        ) : (
          snapshot.stackItems.map((item, index) => (
            <li key={item.id}>
              <div className={["command-stack-item", item.counterable ? "counterable" : "uncounterable"].filter(Boolean).join(" ")}>
                <span className="command-stack-item-order">{index === snapshot.stackItems.length - 1 ? "Top" : "Stack"}</span>
                <span className="command-stack-item-main">
                  <strong>{item.label}</strong>
                  <span className="command-stack-item-meta">
                    <span>{item.kindLabel}</span>
                    <span>{item.ownerLabel}</span>
                    <span>{item.counterable ? "Counterable" : "Locked"}</span>
                  </span>
                </span>
                <span className="command-stack-item-detail">{item.detail}</span>
              </div>
            </li>
          ))
        )}
      </ul>
      ) : (
        <ul className="command-stack-history-list">
          {snapshot.historyEntries.length === 0 ? (
            <li className="command-stack-empty">No history yet.</li>
          ) : (
            snapshot.historyEntries.map((entry) => (
              <li key={entry.id} className="command-stack-history-item">
                <span className="command-stack-history-turn">T{entry.turn}</span>
                <span className="command-stack-history-text">{entry.text}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </aside>
  );
}
