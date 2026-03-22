import { useState } from "react";
import { getGameRuntime } from "../game/runtime";
import { getStackItemPreview, type StackPreviewItem } from "../game/model/selectors";
import { useGameSnapshot } from "./useGameSnapshot";

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
  const state = runtime.state;
  const stackItems = state.stack.map((item) => getStackItemPreview(item, state));
  const historyWindow = state.log.slice(-18);
  const historyEntries = historyWindow
    .map((entry, index) => ({
      id: `log_${state.log.length - historyWindow.length + index}_${entry.turn}`,
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
