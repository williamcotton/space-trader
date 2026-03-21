import { useEffect, useMemo, useState } from "react";
import { getCardDefinition } from "../game/content/cards/catalog";
import { getStackEffectDefinition } from "../game/content/stackEffects";
import { getPlayerLabel } from "../game/presentation";
import { getGameRuntime } from "../game/runtime";

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

type BotAutoplaySnapshot = {
  player_1: boolean;
  player_2: boolean;
};

function readStackSnapshot(): StackPreviewItem[] {
  const runtime = getGameRuntime();
  return runtime.state.stack.map((item) => ({
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
      if (sourceCard?.kind === "unit" && item.effectId === "deploy_unit_card") {
        return `${sourceCard.unit.role} · ${sourceCard.unit.hp} HP · deploy near base on resolve`;
      }
      if (sourceCard?.kind === "tactic") {
        return sourceCard.text;
      }
      const effect = getStackEffectDefinition(item.effectId);
      if (effect?.resolution.type === "counter") {
        return effect.resolution.destination === "hand" ? "Counter target spell and return it to hand." : "Counter target spell.";
      }
      if (effect?.resolution.type === "damage_enemy_base") {
        return `Deal ${effect.resolution.amount} damage to the enemy base.`;
      }
      return effect?.label ?? item.effectId;
    })(),
    ownerLabel: getPlayerLabel(item.controllerId === "player_1" ? "player_1" : "player_2"),
  }));
}

function readBotAutoplaySnapshot(): BotAutoplaySnapshot {
  const runtime = getGameRuntime();
  return {
    player_1: runtime.isBotAutoplayEnabled("player_1"),
    player_2: runtime.isBotAutoplayEnabled("player_2"),
  };
}

export function DebugStackControls() {
  const runtime = getGameRuntime();
  const [stackItems, setStackItems] = useState<StackPreviewItem[]>(() => readStackSnapshot());
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [botAutoplay, setBotAutoplay] = useState<BotAutoplaySnapshot>(() => readBotAutoplaySnapshot());

  useEffect(() => {
    const refresh = () => {
      const next = readStackSnapshot();
      setStackItems(next);
      setBotAutoplay(readBotAutoplaySnapshot());
      if (selectedTargetId && !next.some((item) => item.id === selectedTargetId)) {
        setSelectedTargetId(null);
      }
    };

    const timer = window.setInterval(refresh, 120);
    return () => {
      window.clearInterval(timer);
    };
  }, [selectedTargetId]);

  const topStackItem = stackItems[stackItems.length - 1] ?? null;
  const selectedTarget = useMemo(
    () => (selectedTargetId ? stackItems.find((item) => item.id === selectedTargetId) ?? null : null),
    [selectedTargetId, stackItems]
  );

  const counterTargetForCast = selectedTarget?.id ?? topStackItem?.id;

  return (
    <aside className="debug-stack-controls">
      <div className="debug-stack-header">
        <div>
          <p className="debug-stack-title">Command Stack</p>
          <p className="debug-stack-subtitle">{stackItems.length > 0 ? `${stackItems.length} item${stackItems.length === 1 ? "" : "s"} pending` : "Empty"}</p>
        </div>
        <span className={["debug-stack-target-badge", selectedTarget ? "selected" : topStackItem ? "top" : "none"].join(" ")}>
          {selectedTarget ? "Counter Target Selected" : topStackItem ? "Top Item Armed" : "No Target"}
        </span>
      </div>

      <div className="debug-stack-buttons">
        <button type="button" onClick={() => runtime.debugPassPriority()}>
          Pass
        </button>
        <button type="button" onClick={() => runtime.debugRespondStack()}>
          No-op
        </button>
        <button type="button" onClick={() => runtime.debugRespondDamageEnemyBase()}>
          Ping Base
        </button>
        <button type="button" onClick={() => runtime.debugRespondCounterTopItem(counterTargetForCast)}>
          {selectedTarget ? "Counter Selected" : "Counter Top"}
        </button>
      </div>

      <p className="debug-stack-target">
        Target: {selectedTarget ? `${selectedTarget.label}` : topStackItem ? `${topStackItem.label} [top]` : "none"}
      </p>

      <div className="debug-bot-buttons">
        <button type="button" onClick={() => runtime.toggleBotAutoplay("player_1")}>
          Bot P1: {botAutoplay.player_1 ? "ON" : "OFF"}
        </button>
        <button type="button" onClick={() => runtime.toggleBotAutoplay("player_2")}>
          Bot P2: {botAutoplay.player_2 ? "ON" : "OFF"}
        </button>
      </div>
      <ul className="debug-stack-list">
        {stackItems.length === 0 ? (
          <li className="debug-stack-empty">Stack empty</li>
        ) : (
          stackItems.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={[
                  "debug-stack-item",
                  item.counterable ? "counterable" : "uncounterable",
                  selectedTargetId === item.id ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelectedTargetId((current) => (current === item.id ? null : item.id))}
              >
                <span className="debug-stack-item-order">{index === stackItems.length - 1 ? "Top" : "Stack"}</span>
                <span className="debug-stack-item-main">
                  <strong>{item.label}</strong>
                  <span className="debug-stack-item-meta">
                    <span>{item.kindLabel}</span>
                    <span>{item.ownerLabel}</span>
                    <span>{item.counterable ? "Counterable" : "Locked"}</span>
                  </span>
                </span>
                <span className="debug-stack-item-detail">{item.detail}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
