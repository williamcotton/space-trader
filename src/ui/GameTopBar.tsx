import { getGameRuntime } from "../game/runtime";
import { useGameSnapshot } from "./useGameSnapshot";
import { type Faction, type ResourceType } from "../game/model/enums";
import type { PlayerId } from "../game/model/ids";
import { getRegisteredFactionIds, getOrderedRegisteredResourceModules, getRegisteredRuntimeProfiles } from "../game/content/registry";
import { formatFactionName, getPlayerLabel, getResourceTheme } from "../game/presentation";
import { PRIORITY_STOP_LABELS, type PriorityStopKey, type PriorityStopSettings } from "../game/turn/priorityStops";
import { ResourceIcon } from "./ResourceIcon";

const PRIORITY_STOP_ORDER: PriorityStopKey[] = ["opponentMain", "opponentTactical", "opponentStack"];

type PlayerTopBarSnapshot = {
  id: PlayerId;
  faction: Faction;
  resources: Record<ResourceType, number>;
  hand: number;
  deck: number;
  botAutoplay: boolean;
  priorityStops: PriorityStopSettings;
};

type TopBarSnapshot = {
  mapName: string;
  turn: number;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  networked: boolean;
  networkLocalPlayerId: PlayerId | null;
  runtimeProfileId: string | null;
  players: PlayerTopBarSnapshot[];
};

type GameTopBarProps = {
  onOpenMenu?: () => void;
};

function readSnapshot(): TopBarSnapshot {
  const runtime = getGameRuntime();
  const state = runtime.state;

  return {
    mapName: state.map.name,
    turn: state.turn,
    activePlayerId: state.activePlayerId,
    priorityPlayerId: state.priorityPlayerId,
    networked: runtime.isNetworkedMatch(),
    networkLocalPlayerId: runtime.getNetworkLocalPlayerId(),
    runtimeProfileId: runtime.getRuntimeProfileId(),
    players: state.playerOrder
      .filter((playerId) => Boolean(state.players[playerId] && state.zones[playerId]))
      .map((playerId) => ({
        id: playerId,
        faction: state.players[playerId]!.faction,
        resources: { ...state.players[playerId]!.resources },
        hand: state.zones[playerId]!.hand.length,
        deck: state.zones[playerId]!.deck.length,
        botAutoplay: runtime.isBotAutoplayEnabled(playerId),
        priorityStops: runtime.getPriorityStopSettings(playerId),
      })),
  };
}

export function GameTopBar({ onOpenMenu }: GameTopBarProps) {
  const runtime = getGameRuntime();
  const snapshot = useGameSnapshot(readSnapshot);
  const factionIds = getRegisteredFactionIds();
  const runtimeProfiles = getRegisteredRuntimeProfiles();
  const resourceOrder = getOrderedRegisteredResourceModules().map((resource) => resource.id);
  const hasManyPlayers = snapshot.players.length > 2;
  const showDeveloperControls = import.meta.env.DEV && !snapshot.networked;

  return (
    <header className={["game-top-bar", hasManyPlayers ? "many-players" : ""].filter(Boolean).join(" ")} aria-label="Match controls and status">
      <div className="game-top-bar-line">
        <div className="game-top-bar-match">
          <span className="eyebrow">{snapshot.mapName}</span>
          <strong>Turn {snapshot.turn}</strong>
          {showDeveloperControls ? (
            <label className="game-top-bar-profile-select-wrap">
              <span className="eyebrow">Mode</span>
              <select
                className="top-bar-faction-select game-top-bar-profile-select"
                value={snapshot.runtimeProfileId ?? ""}
                onChange={(e) => {
                  const runtimeProfileId = e.target.value;
                  runtime.resetWithContent({
                    runtimeProfileId: runtimeProfileId || undefined,
                  });
                }}
              >
                {runtimeProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          {snapshot.networked && snapshot.networkLocalPlayerId ? (
            <span className="game-top-bar-priority-chip">Online · {getPlayerLabel(snapshot.networkLocalPlayerId)}</span>
          ) : null}
          {onOpenMenu ? (
            <button type="button" className="game-top-bar-menu-button" onClick={onOpenMenu}>
              Menu
            </button>
          ) : null}
        </div>

        <div
          className={[
            "game-top-bar-players-inline",
            hasManyPlayers ? "many-players" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {snapshot.players.map((player) => (
            <article
              key={player.id}
              className={[
                "top-bar-player-pod",
                player.id === snapshot.activePlayerId ? "active" : "",
                player.id === snapshot.priorityPlayerId ? "priority" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="top-bar-player-identity">
                <strong>{getPlayerLabel(player.id)}</strong>
                {showDeveloperControls ? (
                  <select
                    className="top-bar-faction-select"
                    value={player.faction}
                    disabled={snapshot.networked}
                    onChange={(e) => {
                      const faction = e.target.value as Faction;
                      runtime.resetWithFactions(
                        Object.fromEntries(
                          snapshot.players.map((entry) => [entry.id, entry.id === player.id ? faction : entry.faction])
                        ) as Partial<Record<PlayerId, Faction>>
                      );
                    }}
                  >
                    {factionIds.map((f) => (
                      <option key={f} value={f}>{formatFactionName(f)}</option>
                    ))}
                  </select>
                ) : (
                  <span>{formatFactionName(player.faction)}</span>
                )}
              </div>
              <div className="top-bar-player-resources">
                {resourceOrder.map((resource) => (
                  <span key={resource} className={`top-bar-resource-pill ${resource}`} title={getResourceTheme(resource).label}>
                    <ResourceIcon resource={resource} size={12} />
                    <strong>{player.resources[resource] ?? 0}</strong>
                  </span>
                ))}
              </div>
              <div className="top-bar-player-meta">
                {showDeveloperControls ? (
                  <div className="top-bar-player-actions">
                    <button
                      type="button"
                      className={["top-bar-bot-toggle", player.botAutoplay ? "enabled" : "disabled"].join(" ")}
                      onClick={() => runtime.toggleBotAutoplay(player.id)}
                    >
                      {player.botAutoplay ? "Bot On" : "Bot Off"}
                    </button>
                    <button
                      type="button"
                      className="top-bar-debug-resource"
                      onClick={() => runtime.debugAddTestResources(player.id)}
                      title="Add 100 of each resource"
                      aria-label={`Add 100 of each resource to ${getPlayerLabel(player.id)}`}
                    >
                      +100
                    </button>
                    <button
                      type="button"
                      className="top-bar-debug-kill"
                      onClick={() => runtime.debugKillTestUnit(player.id)}
                      title="Destroy the selected or first unit for this player"
                      aria-label={`Destroy a ${getPlayerLabel(player.id)} unit for testing`}
                    >
                      Kill
                    </button>
                    <button
                      type="button"
                      className="top-bar-debug-win"
                      onClick={() => runtime.debugWinTestGame(player.id)}
                      title="Declare this player the winner for testing"
                      aria-label={`Declare ${getPlayerLabel(player.id)} the winner for testing`}
                    >
                      Win
                    </button>
                  </div>
                ) : null}
                <span className="top-bar-player-zones">
                  H{player.hand} D{player.deck}
                </span>
              </div>
              {showDeveloperControls ? (
                <div className="top-bar-priority-stops">
                  <span className="top-bar-priority-stops-label">Yield</span>
                  {PRIORITY_STOP_ORDER.map((stopKey) => (
                    <button
                      key={stopKey}
                      type="button"
                      className={["top-bar-priority-stop", player.priorityStops[stopKey] ? "enabled" : "disabled"].join(" ")}
                      onClick={() => runtime.togglePriorityStopSetting(player.id, stopKey)}
                    >
                      {PRIORITY_STOP_LABELS[stopKey]}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </header>
  );
}
