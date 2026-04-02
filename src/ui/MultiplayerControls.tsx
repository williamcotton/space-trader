import { useEffect, useState } from "react";
import { getRegisteredFactionIds } from "../game/content/registry";
import type { Faction } from "../game/model/enums";
import { formatFactionName } from "../game/presentation";
import { getMultiplayerClient } from "../network/client";
import { useMultiplayerSnapshot } from "../network/useMultiplayerSnapshot";

const DEFAULT_FACTION = "alloy_clan" as Faction;

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
  const [faction, setFaction] = useState<Faction>(snapshot.queuedFaction ?? DEFAULT_FACTION);
  const factionIds = getRegisteredFactionIds();

  useEffect(() => {
    setServerUrl(snapshot.serverUrl);
  }, [snapshot.serverUrl]);

  useEffect(() => {
    if (snapshot.queuedFaction) {
      setFaction(snapshot.queuedFaction);
    }
  }, [snapshot.queuedFaction]);

  const queuedDescription = snapshot.status === "queued"
    ? `${snapshot.queuedPlayers} queued`
    : snapshot.localPlayerId
      ? `You are ${snapshot.localPlayerId}`
      : null;

  return (
    <section className="multiplayer-bar" aria-label="Multiplayer controls">
      <div className="multiplayer-bar-main">
        <div className="multiplayer-bar-header">
          <strong>Network Match</strong>
          <span className={`multiplayer-status-pill ${snapshot.status}`}>{describeStatus(snapshot.status)}</span>
          {queuedDescription ? <span className="multiplayer-bar-meta">{queuedDescription}</span> : null}
        </div>
        <div className="multiplayer-bar-controls">
          <input
            className="multiplayer-input"
            type="text"
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            onBlur={() => client.setServerUrl(serverUrl)}
            placeholder="http://127.0.0.1:4310"
          />
          <select
            className="multiplayer-select"
            value={faction}
            onChange={(event) => setFaction(event.target.value as Faction)}
            disabled={snapshot.status === "queued" || snapshot.status === "in_match"}
          >
            {factionIds.map((factionId) => (
              <option key={factionId} value={factionId}>
                {formatFactionName(factionId)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="multiplayer-button primary"
            disabled={snapshot.status === "queued" || snapshot.status === "in_match" || snapshot.status === "connecting"}
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
            disabled={snapshot.status === "offline" || snapshot.status === "connecting"}
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
