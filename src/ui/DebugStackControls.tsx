import { useEffect, useMemo, useState } from "react";
import { getGameRuntime } from "../game/runtime";

type StackPreviewItem = {
  id: string;
  label: string;
  controllerId: string;
  effectId: string;
  counterable: boolean;
};

function readStackSnapshot(): StackPreviewItem[] {
  const runtime = getGameRuntime();
  return runtime.state.stack.map((item) => ({
    id: item.id,
    label: item.label,
    controllerId: item.controllerId,
    effectId: item.effectId,
    counterable: item.counterable,
  }));
}

export function DebugStackControls() {
  const runtime = getGameRuntime();
  const [stackItems, setStackItems] = useState<StackPreviewItem[]>(() => readStackSnapshot());
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const next = readStackSnapshot();
      setStackItems(next);
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
      <p className="debug-stack-title">Stack Debug</p>
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
        Target: {selectedTarget ? `${selectedTarget.label} (${selectedTarget.id})` : topStackItem ? `${topStackItem.label} [top]` : "none"}
      </p>
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
                <span>{index === stackItems.length - 1 ? "Top" : "Item"}</span>
                <span>{item.label}</span>
                <span>{item.effectId}</span>
                <span>{item.counterable ? "counterable" : "uncounterable"}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
