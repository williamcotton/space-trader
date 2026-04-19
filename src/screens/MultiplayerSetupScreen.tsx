import { useEffect, useState } from "react";
import { getRegisteredFactionIds } from "../game/content/registry";
import type { Faction } from "../game/model/enums";
import { formatFactionName } from "../game/presentation";
import type { MultiplayerSnapshot } from "../network/client";
import { ONLINE_MATCH_FORMATS, type OnlineMatchFormat } from "../network/protocol";

type MultiplayerSetupScreenProps = {
  snapshot: MultiplayerSnapshot;
  onSetSelectedFaction: (faction: Faction) => void;
  onSetSelectedFormat: (format: OnlineMatchFormat) => void;
  onSetServerUrl: (serverUrl: string) => void;
  onFindMatch: () => Promise<void>;
  onBack: () => void;
};

function describeStatus(status: MultiplayerSnapshot["status"]): string {
  switch (status) {
    case "offline":
      return "Offline";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Ready";
    case "queued":
      return "Searching";
    case "in_match":
      return "Live Match";
    case "reconnecting":
      return "Reconnecting";
    case "error":
      return "Connection Problem";
    default:
      return status;
  }
}

export function MultiplayerSetupScreen({
  snapshot,
  onSetSelectedFaction,
  onSetSelectedFormat,
  onSetServerUrl,
  onFindMatch,
  onBack,
}: MultiplayerSetupScreenProps) {
  const factionIds = getRegisteredFactionIds();
  const [serverUrl, setServerUrl] = useState(snapshot.serverUrl);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const busy = snapshot.status === "connecting" || snapshot.status === "queued" || snapshot.status === "reconnecting";

  useEffect(() => {
    setServerUrl(snapshot.serverUrl);
  }, [snapshot.serverUrl]);

  return (
    <main className="menu-shell">
      <section className="setup-panel">
        <div className="screen-status-row">
          <p className="menu-kicker">Play Online</p>
          <span className={`screen-status-pill ${snapshot.status}`}>{describeStatus(snapshot.status)}</span>
        </div>
        <h1>Queue for a live match.</h1>
        <p className="menu-hero-copy">
          Choose a format, lock your faction, and queue when you are ready. Advanced network controls stay tucked away.
        </p>

        <div className="setup-grid">
          <label className="menu-field setup-field">
            <span className="menu-field-label">Format</span>
            <select
              className="menu-select"
              value={snapshot.selectedFormat}
              disabled={busy}
              onChange={(event) => onSetSelectedFormat(event.target.value as OnlineMatchFormat)}
            >
              {Object.entries(ONLINE_MATCH_FORMATS).map(([formatId, config]) => (
                <option key={formatId} value={formatId}>
                  {config.label}
                </option>
              ))}
            </select>
          </label>

          <label className="menu-field setup-field">
            <span className="menu-field-label">Faction</span>
            <select
              className="menu-select"
              value={snapshot.selectedFaction}
              disabled={busy}
              onChange={(event) => onSetSelectedFaction(event.target.value as Faction)}
            >
              {factionIds.map((factionId) => (
                <option key={factionId} value={factionId}>
                  {formatFactionName(factionId)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="advanced-block">
          <button type="button" className="menu-inline-button" onClick={() => setShowAdvanced((value) => !value)}>
            {showAdvanced ? "Hide Advanced" : "Advanced"}
          </button>
          {showAdvanced ? (
            <label className="menu-field setup-field advanced-field">
              <span className="menu-field-label">Server URL</span>
              <input
                className="menu-input"
                type="text"
                value={serverUrl}
                onChange={(event) => setServerUrl(event.target.value)}
                onBlur={() => onSetServerUrl(serverUrl)}
                placeholder="http://127.0.0.1:4310"
              />
            </label>
          ) : null}
        </div>

        {snapshot.error ? <p className="menu-error">{snapshot.error}</p> : null}

        <div className="setup-actions">
          <button
            type="button"
            className="menu-cta primary"
            disabled={busy}
            onClick={async () => {
              onSetServerUrl(serverUrl);
              await onFindMatch();
            }}
          >
            Find Match
          </button>
          <button type="button" className="menu-cta secondary" disabled={snapshot.status === "connecting"} onClick={onBack}>
            Back
          </button>
        </div>
      </section>
    </main>
  );
}
