import { useMemo } from "react";
import { getGameRuntime } from "../game/runtime";
import { useGameSnapshot } from "./useGameSnapshot";
import type { Faction, GamePhase, ResourceType } from "../game/model/enums";
import type { PlayerId } from "../game/model/ids";
import { formatFactionName, getPlayerLabel, getResourceTheme } from "../game/presentation";
import { PRIORITY_STOP_LABELS, type PriorityStopKey, type PriorityStopSettings } from "../game/turn/priorityStops";
import { ResourceIcon } from "./ResourceIcon";

const PHASE_ORDER: GamePhase[] = ["start", "economy", "main", "tactical", "end", "discard"];
const PHASE_LABELS: Record<GamePhase, string> = {
  start: "Start",
  economy: "Eco",
  main: "Main",
  tactical: "Tac",
  end: "End",
  discard: "Disc",
};
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
  phase: GamePhase;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  stackSize: number;
  consecutivePasses: number;
  winner: PlayerId | null;
  lastRejectedReason: string | null;
  priorityLabel: string;
  priorityDetail: string;
  responseWindowOpen: boolean;
  players: PlayerTopBarSnapshot[];
};

function readSnapshot(): TopBarSnapshot {
  const runtime = getGameRuntime();
  const state = runtime.state;
  const responseWindowOpen = Boolean(state.priorityPlayerId && state.priorityPlayerId !== state.activePlayerId);
  const priorityLabel = state.priorityPlayerId ? `Priority ${getPlayerLabel(state.priorityPlayerId)}` : "Priority None";
  const priorityDetail = !state.priorityPlayerId
    ? "No player can act right now."
    : responseWindowOpen
      ? `${getPlayerLabel(state.priorityPlayerId)} can act during ${getPlayerLabel(state.activePlayerId)}'s turn.`
      : `${getPlayerLabel(state.activePlayerId)} is holding priority.`;

  return {
    mapName: state.map.name,
    turn: state.turn,
    phase: state.phase,
    activePlayerId: state.activePlayerId,
    priorityPlayerId: state.priorityPlayerId,
    stackSize: state.stack.length,
    consecutivePasses: state.consecutivePriorityPasses,
    winner: state.winner,
    lastRejectedReason: state.lastRejectedReason,
    priorityLabel,
    priorityDetail,
    responseWindowOpen,
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
  const activePlayerControlsLocked =
    Boolean(snapshot.winner) ||
    snapshot.stackSize > 0 ||
    !snapshot.priorityPlayerId ||
    snapshot.priorityPlayerId !== snapshot.activePlayerId;

  const phaseIndex = PHASE_ORDER.indexOf(snapshot.phase);
  const statusMessage = useMemo(() => {
    if (snapshot.winner) {
      return `${getPlayerLabel(snapshot.winner)} wins`;
    }
    if (snapshot.lastRejectedReason) {
      return `Reject: ${snapshot.lastRejectedReason}`;
    }
    return null;
  }, [snapshot.lastRejectedReason, snapshot.winner]);

  return (
    <header className="game-top-bar" aria-label="Match controls and status">
      <div className="game-top-bar-line">
        <div className="game-top-bar-match">
          <span className="eyebrow">{snapshot.mapName}</span>
          <strong>Turn {snapshot.turn}</strong>
          <span
            className={["game-top-bar-priority-chip", snapshot.responseWindowOpen ? "response-window" : ""].join(" ")}
            title={snapshot.priorityDetail}
          >
            {snapshot.priorityLabel}
          </span>
          {statusMessage ? <span className="game-top-bar-inline-status">{statusMessage}</span> : null}
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

        <div className="game-top-bar-phase-cluster">
          <div className="game-top-bar-mini-metrics">
            <span className="game-top-bar-chip">Stack {snapshot.stackSize}</span>
            <span className="game-top-bar-chip">Pass {snapshot.consecutivePasses}</span>
          </div>
          <ol className="game-phase-track compact">
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
        </div>

        <div className="game-top-bar-actions">
          <button type="button" disabled={activePlayerControlsLocked} onClick={() => runtime.debugAdvancePhase()}>
            End Phase
          </button>
          <button
            type="button"
            disabled={Boolean(snapshot.winner) || !snapshot.priorityPlayerId}
            onClick={() => runtime.debugPassPriority()}
          >
            Pass Priority
          </button>
        </div>
      </div>
    </header>
  );
}
