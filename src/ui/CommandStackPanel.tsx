import { useState } from "react";
import { getGameRuntime } from "../game/runtime";
import type { GamePhase } from "../game/model/enums";
import { DRAW_RESULT_ID, type PlayerId } from "../game/model/ids";
import { getStackItemPreview, type StackPreviewItem } from "../game/model/selectors";
import { getPlayerLabel } from "../game/presentation";
import { useGameSnapshot } from "./useGameSnapshot";

const PHASE_ORDER: GamePhase[] = ["start", "economy", "main", "tactical", "end", "discard"];
const PHASE_LABELS: Record<GamePhase, string> = {
  start: "Start",
  economy: "Eco",
  main: "Main",
  tactical: "Tac",
  end: "End",
  discard: "Disc",
};

type HistoryEntry = {
  id: string;
  turn: number;
  text: string;
};

type CommandStackSnapshot = {
  phase: GamePhase;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  consecutivePasses: number;
  winner: PlayerId | null;
  lastRejectedReason: string | null;
  networked: boolean;
  networkLocalPlayerId: PlayerId | null;
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
    phase: state.phase,
    activePlayerId: state.activePlayerId,
    priorityPlayerId: state.priorityPlayerId,
    consecutivePasses: state.consecutivePriorityPasses,
    winner: state.winner,
    lastRejectedReason: state.lastRejectedReason,
    networked: runtime.isNetworkedMatch(),
    networkLocalPlayerId: runtime.getNetworkLocalPlayerId(),
    stackItems,
    historyEntries,
  };
}

export function CommandStackPanel() {
  const runtime = getGameRuntime();
  const snapshot = useGameSnapshot(readPanelSnapshot);
  const [viewMode, setViewMode] = useState<"stack" | "history">("stack");
  const phaseIndex = PHASE_ORDER.indexOf(snapshot.phase);
  const responseWindowOpen = Boolean(snapshot.priorityPlayerId && snapshot.priorityPlayerId !== snapshot.activePlayerId);
  const priorityLabel = snapshot.priorityPlayerId ? `Priority ${getPlayerLabel(snapshot.priorityPlayerId)}` : "Priority None";
  const priorityDetail = !snapshot.priorityPlayerId
    ? "No player can act right now."
    : responseWindowOpen
      ? `${getPlayerLabel(snapshot.priorityPlayerId)} can act during ${getPlayerLabel(snapshot.activePlayerId)}'s turn.`
      : `${getPlayerLabel(snapshot.activePlayerId)} is holding priority.`;
  const statusMessage = snapshot.winner
    ? snapshot.winner === DRAW_RESULT_ID
      ? "Match ended in a draw"
      : `${getPlayerLabel(snapshot.winner)} wins`
    : snapshot.lastRejectedReason
      ? `Reject: ${snapshot.lastRejectedReason}`
      : null;
  const activePlayerControlsLocked =
    Boolean(snapshot.winner) ||
    snapshot.stackItems.length > 0 ||
    !snapshot.priorityPlayerId ||
    snapshot.priorityPlayerId !== snapshot.activePlayerId ||
    Boolean(snapshot.networkLocalPlayerId && snapshot.networkLocalPlayerId !== snapshot.activePlayerId);
  const passPriorityLocked =
    Boolean(snapshot.winner) ||
    !snapshot.priorityPlayerId ||
    (snapshot.stackItems.length === 0 && snapshot.consecutivePasses === 0) ||
    Boolean(snapshot.networkLocalPlayerId && snapshot.networkLocalPlayerId !== snapshot.priorityPlayerId);

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

      <section className="command-stack-controls" aria-label="Turn controls">
        <div className="command-stack-controls-head">
          <div className="command-stack-controls-status">
            <span
              className={["command-stack-badge", "priority", responseWindowOpen ? "response-window" : ""].join(" ")}
              title={priorityDetail}
            >
              {priorityLabel}
            </span>
            {statusMessage ? <span className="command-stack-badge status">{statusMessage}</span> : null}
          </div>
          <div className="command-stack-controls-metrics">
            <span className="command-stack-badge metric">Stack {snapshot.stackItems.length}</span>
            <span className="command-stack-badge metric">Pass {snapshot.consecutivePasses}</span>
          </div>
        </div>
        <ol className="game-phase-track command-stack-phase-track">
          {PHASE_ORDER.map((phase, index) => (
            <li
              key={phase}
              className={[
                index < phaseIndex ? "done" : "",
                index === phaseIndex ? "active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {PHASE_LABELS[phase]}
            </li>
          ))}
        </ol>
        <div className="command-stack-controls-actions">
          <button type="button" disabled={activePlayerControlsLocked} onClick={() => runtime.endPhase()}>
            End Phase
          </button>
          <button
            type="button"
            disabled={passPriorityLocked}
            onClick={() => runtime.passPriority()}
          >
            Pass Priority
          </button>
        </div>
      </section>
    </aside>
  );
}
