import { getGameRuntime } from "../game/runtime";
import { useGameSnapshot } from "./useGameSnapshot";
import type { Faction, ResourceType } from "../game/model/enums";
import type { PlayerId } from "../game/model/ids";
import { formatFactionName, getPlayerLabel, getResourceTheme } from "../game/presentation";
import { PRIORITY_STOP_LABELS, type PriorityStopKey, type PriorityStopSettings } from "../game/turn/priorityStops";
import { ResourceIcon } from "./ResourceIcon";

const RESOURCE_ORDER: ResourceType[] = ["credits", "alloy", "flux", "biomass"];
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
  players: PlayerTopBarSnapshot[];
};

function readSnapshot(): TopBarSnapshot {
  const runtime = getGameRuntime();
  const state = runtime.state;

  return {
    mapName: state.map.name,
    turn: state.turn,
    activePlayerId: state.activePlayerId,
    priorityPlayerId: state.priorityPlayerId,
    players: (["player_1", "player_2"] as const).map((playerId) => ({
      id: playerId,
      faction: state.players[playerId].faction,
      resources: state.players[playerId].resources,
      hand: state.zones[playerId].hand.length,
      deck: state.zones[playerId].deck.length,
      botAutoplay: runtime.isBotAutoplayEnabled(playerId),
      priorityStops: runtime.getPriorityStopSettings(playerId),
    })),
  };
}

export function GameTopBar() {
  const runtime = getGameRuntime();
  const snapshot = useGameSnapshot(readSnapshot);

  return (
    <header className="game-top-bar" aria-label="Match controls and status">
      <div className="game-top-bar-line">
        <div className="game-top-bar-match">
          <span className="eyebrow">{snapshot.mapName}</span>
          <strong>Turn {snapshot.turn}</strong>
        </div>

        <div className="game-top-bar-players-inline">
          {snapshot.players.map((player) => (
            <article
              key={player.id}
              className={[
                "top-bar-player-pod",
                player.id === snapshot.activePlayerId ? "active" : "",
                player.id === snapshot.priorityPlayerId ? "priority" : "",
                player.id === "player_1" ? "player-one" : "player-two",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="top-bar-player-identity">
                <strong>{getPlayerLabel(player.id)}</strong>
                <span>{formatFactionName(player.faction)}</span>
              </div>
              <div className="top-bar-player-resources">
                {RESOURCE_ORDER.map((resource) => (
                  <span key={resource} className={`top-bar-resource-pill ${resource}`} title={getResourceTheme(resource).label}>
                    <ResourceIcon resource={resource} size={12} />
                    <strong>{player.resources[resource]}</strong>
                  </span>
                ))}
              </div>
              <div className="top-bar-player-meta">
                <button
                  type="button"
                  className={["top-bar-bot-toggle", player.botAutoplay ? "enabled" : "disabled"].join(" ")}
                  onClick={() => runtime.toggleBotAutoplay(player.id)}
                >
                  {player.botAutoplay ? "Bot On" : "Bot Off"}
                </button>
                <span className="top-bar-player-zones">
                  H{player.hand} D{player.deck}
                </span>
              </div>
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
            </article>
          ))}
        </div>
      </div>
    </header>
  );
}
