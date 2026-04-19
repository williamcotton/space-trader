import { useEffect, useState } from "react";
import { LEARN_QUICK_TIPS } from "../app/learnContent";
import type { MultiplayerSnapshot } from "../network/client";
import { ONLINE_MATCH_FORMATS } from "../network/protocol";
import { formatFactionName } from "../game/presentation";

type MultiplayerQueueScreenProps = {
  snapshot: MultiplayerSnapshot;
  onCancel: () => Promise<void>;
};

function describeQueueStatus(snapshot: MultiplayerSnapshot): string {
  switch (snapshot.status) {
    case "queued":
      return `Searching for ${ONLINE_MATCH_FORMATS[snapshot.queuedFormat ?? snapshot.selectedFormat].label}.`;
    case "reconnecting":
      return "Trying to reconnect to matchmaking.";
    case "error":
      return snapshot.error ?? "Connection problem.";
    default:
      return "Holding your matchmaking state.";
  }
}

export function MultiplayerQueueScreen({ snapshot, onCancel }: MultiplayerQueueScreenProps) {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTipIndex((index) => (index + 1) % LEARN_QUICK_TIPS.length);
    }, 4500);
    return () => window.clearInterval(interval);
  }, []);

  const queuedFormat = ONLINE_MATCH_FORMATS[snapshot.queuedFormat ?? snapshot.selectedFormat];
  const queuedFaction = formatFactionName(snapshot.queuedFaction ?? snapshot.selectedFaction);

  return (
    <main className="menu-shell">
      <section className="setup-panel queue-panel">
        <p className="menu-kicker">Searching</p>
        <h1>Searching for Match</h1>
        <p className="menu-hero-copy">{describeQueueStatus(snapshot)}</p>

        <div className="queue-summary">
          <div>
            <span className="menu-field-label">Format</span>
            <strong>{queuedFormat.label}</strong>
          </div>
          <div>
            <span className="menu-field-label">Faction</span>
            <strong>{queuedFaction}</strong>
          </div>
          <div>
            <span className="menu-field-label">Queue</span>
            <strong>
              {snapshot.queuedPlayers}/{snapshot.requiredPlayers || queuedFormat.requiredPlayers}
            </strong>
          </div>
        </div>

        {snapshot.error ? <p className="menu-error">{snapshot.error}</p> : null}

        <article className="queue-tip">
          <p className="menu-card-eyebrow">Tip</p>
          <p>{LEARN_QUICK_TIPS[tipIndex]}</p>
        </article>

        <div className="setup-actions">
          <button type="button" className="menu-cta secondary" onClick={() => void onCancel()}>
            Cancel Search
          </button>
        </div>
      </section>
    </main>
  );
}
