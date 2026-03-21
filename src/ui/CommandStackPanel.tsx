import { useEffect, useState } from "react";
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

export function CommandStackPanel() {
  const [stackItems, setStackItems] = useState<StackPreviewItem[]>(() => readStackSnapshot());

  useEffect(() => {
    const refresh = () => {
      setStackItems(readStackSnapshot());
    };

    const timer = window.setInterval(refresh, 120);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <aside className="command-stack-panel">
      <div className="command-stack-header">
        <div>
          <p className="command-stack-title">Command Stack</p>
          <p className="command-stack-subtitle">{stackItems.length > 0 ? `${stackItems.length} item${stackItems.length === 1 ? "" : "s"} pending` : "Empty"}</p>
        </div>
        <span className={["command-stack-badge", stackItems.length > 0 ? "top" : "none"].join(" ")}>
          {stackItems.length > 0 ? "Top Resolves First" : "No Stack"}
        </span>
      </div>

      <ul className="command-stack-list">
        {stackItems.length === 0 ? (
          <li className="command-stack-empty">Stack empty</li>
        ) : (
          stackItems.map((item, index) => (
            <li key={item.id}>
              <div className={["command-stack-item", item.counterable ? "counterable" : "uncounterable"].filter(Boolean).join(" ")}>
                <span className="command-stack-item-order">{index === stackItems.length - 1 ? "Top" : "Stack"}</span>
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
    </aside>
  );
}
