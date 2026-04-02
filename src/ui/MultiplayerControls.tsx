import { useEffect, useState } from "react";
import { getRegisteredFactionIds } from "../game/content/registry";
import type { Faction } from "../game/model/enums";
import { formatFactionName, getPlayerLabel } from "../game/presentation";
import { getMultiplayerClient } from "../network/client";
import { useMultiplayerSnapshot } from "../network/useMultiplayerSnapshot";

function describeStatus(status: ReturnType<typeof useMultiplayerSnapshot>["status"]): string {
  switch (status) {
    case "offline":
      return "Offline";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "queued":
      return "Searching";
    case "in_match":
      return "Live Match";
    case "reconnecting":
      return "Reconnecting";
    case "error":
      return "Error";
    default:
      return status;
  }
}

export function MultiplayerControls() {
  const client = getMultiplayerClient();
  const snapshot = useMultiplayerSnapshot();
  const [serverUrl, setServerUrl] = useState(snapshot.serverUrl);
  const [faction, setFaction] = useState<Faction>(snapshot.selectedFaction);
  const factionIds = getRegisteredFactionIds();

  useEffect(() => {
    setServerUrl(snapshot.serverUrl);
  }, [snapshot.serverUrl]);

  useEffect(() => {
    setFaction(snapshot.selectedFaction);
  }, [snapshot.selectedFaction]);

  const queuedDescription = snapshot.status === "queued"
    ? `${snapshot.queuedPlayers} queued · ${formatFactionName(snapshot.queuedFaction ?? snapshot.selectedFaction)}`
    : snapshot.localPlayerId
      ? `You are ${getPlayerLabel(snapshot.localPlayerId)}`
      : null;
  const canFindMatch = snapshot.status !== "queued" && snapshot.status !== "in_match" && snapshot.status !== "connecting";
  const canQuitMatch = snapshot.status === "in_match" || snapshot.status === "reconnecting";
  const canDisconnect = !canQuitMatch && snapshot.status !== "offline" && snapshot.status !== "connecting";

  return (
    <section className="multiplayer-bar" aria-label="Multiplayer controls">
      <div className="multiplayer-bar-main">
        <div className="multiplayer-bar-header">
          <strong>Network Match</strong>
          <span className={`multiplayer-status-pill ${snapshot.status}`}>{describeStatus(snapshot.status)}</span>
          {queuedDescription ? <span className="multiplayer-bar-meta">{queuedDescription}</span> : null}
        </div>
        <div className="multiplayer-bar-controls">
          <label className="multiplayer-field multiplayer-field-url">
            <span className="multiplayer-field-label">Server</span>
            <input
              className="multiplayer-input"
              type="text"
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              onBlur={() => client.setServerUrl(serverUrl)}
              placeholder="http://127.0.0.1:4310"
            />
          </label>
          <label className="multiplayer-field multiplayer-field-faction">
            <span className="multiplayer-field-label">Faction</span>
            <select
              className="multiplayer-select"
              value={faction}
              onChange={(event) => {
                const nextFaction = event.target.value as Faction;
                setFaction(nextFaction);
                client.setSelectedFaction(nextFaction);
              }}
              disabled={snapshot.status === "queued" || snapshot.status === "in_match"}
            >
              {factionIds.map((factionId) => (
                <option key={factionId} value={factionId}>
                  {formatFactionName(factionId)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="multiplayer-button primary"
            disabled={!canFindMatch}
            onClick={() => {
              client.setServerUrl(serverUrl);
              void client.joinQueue(faction);
            }}
          >
            Find Match
          </button>
          <button
            type="button"
            className="multiplayer-button"
            disabled={snapshot.status !== "queued"}
            onClick={() => {
              void client.leaveQueue();
            }}
          >
            Leave Queue
          </button>
          <button
            type="button"
            className="multiplayer-button"
            disabled={!canQuitMatch}
            onClick={() => {
              void client.quitMatch();
            }}
          >
            Quit Match
          </button>
          <button
            type="button"
            className="multiplayer-button"
            disabled={!canDisconnect}
            onClick={() => client.disconnect()}
          >
            Disconnect
          </button>
        </div>
      </div>
      {snapshot.error ? <p className="multiplayer-error">{snapshot.error}</p> : null}
    </section>
  );
}
