import { useEffect, useMemo, useState } from "react";
import { getGameRuntime } from "../game/runtime";
import type { Faction, GamePhase, ResourceType } from "../game/model/enums";
import type { PlayerId } from "../game/model/ids";
import { formatFactionName, getPlayerLabel, getResourceTheme } from "../game/presentation";
import { ResourceIcon } from "./ResourceIcon";

const PHASE_ORDER: GamePhase[] = ["start", "economy", "main", "tactical", "end"];
const RESOURCE_ORDER: ResourceType[] = ["credits", "alloy", "flux", "biomass"];

type PlayerTopBarSnapshot = {
  id: PlayerId;
  faction: Faction;
  resources: Record<ResourceType, number>;
  hand: number;
  deck: number;
  botAutoplay: boolean;
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
  latestEconomyFeedback: string | null;
  players: PlayerTopBarSnapshot[];
};

function getLatestEconomyFeedback(): string | null {
  const runtime = getGameRuntime();
  const { log } = runtime.state;
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const text = log[index]?.text ?? "";
    if (text.includes("deposited") || text.includes("captured") || text.includes("seized") || text.includes("cargo lost")) {
      return text;
    }
  }
  return null;
}

function readSnapshot(): TopBarSnapshot {
  const runtime = getGameRuntime();
  const state = runtime.state;
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
    latestEconomyFeedback: getLatestEconomyFeedback(),
    players: (["player_1", "player_2"] as const).map((playerId) => ({
      id: playerId,
      faction: state.players[playerId].faction,
      resources: state.players[playerId].resources,
      hand: state.zones[playerId].hand.length,
      deck: state.zones[playerId].deck.length,
      botAutoplay: runtime.isBotAutoplayEnabled(playerId),
    })),
  };
}

export function GameTopBar() {
  const runtime = getGameRuntime();
  const [snapshot, setSnapshot] = useState<TopBarSnapshot>(() => readSnapshot());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSnapshot(readSnapshot());
    }, 120);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const phaseIndex = PHASE_ORDER.indexOf(snapshot.phase);
  const phaseLabel = snapshot.phase.charAt(0).toUpperCase() + snapshot.phase.slice(1);
  const statusMessage = useMemo(() => {
    if (snapshot.winner) {
      return `${snapshot.winner} wins the match.`;
    }
    if (snapshot.lastRejectedReason) {
      return `Last reject: ${snapshot.lastRejectedReason}`;
    }
    if (snapshot.latestEconomyFeedback) {
      return snapshot.latestEconomyFeedback;
    }
    return "Ready.";
  }, [snapshot.lastRejectedReason, snapshot.latestEconomyFeedback, snapshot.winner]);

  return (
    <header className="game-top-bar" aria-label="Match controls and status">
      <div className="game-top-bar-main">
        <div className="game-top-bar-title-block">
          <div className="game-top-bar-title">
            <span className="eyebrow">{snapshot.mapName}</span>
            <strong>Turn {snapshot.turn}</strong>
          </div>
          <div className="game-top-bar-meta">
            <span className="game-top-bar-chip active-phase">Phase {phaseLabel}</span>
            <span className="game-top-bar-chip">Active {getPlayerLabel(snapshot.activePlayerId)}</span>
            <span className="game-top-bar-chip">
              Priority {snapshot.priorityPlayerId ? getPlayerLabel(snapshot.priorityPlayerId) : "none"}
            </span>
            <span className="game-top-bar-chip">Stack {snapshot.stackSize}</span>
            <span className="game-top-bar-chip">Pass {snapshot.consecutivePasses}</span>
          </div>
        </div>

        <ol className="game-phase-track">
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
              {phase}
            </li>
          ))}
        </ol>

        <div className="game-top-bar-actions">
          <button type="button" disabled={Boolean(snapshot.winner)} onClick={() => runtime.debugAdvancePhase()}>
            End Phase
          </button>
          <button
            type="button"
            disabled={Boolean(snapshot.winner) || !snapshot.priorityPlayerId}
            onClick={() => runtime.debugPassPriority()}
          >
            Pass Priority
          </button>
          <button type="button" disabled={Boolean(snapshot.winner)} onClick={() => runtime.debugSelectFirstActiveUnit()}>
            Select Unit
          </button>
        </div>
      </div>

      <div className="game-top-bar-players">
        {snapshot.players.map((player) => (
          <article
            key={player.id}
            className={[
              "player-resource-card",
              player.id === snapshot.activePlayerId ? "active" : "",
              player.id === "player_1" ? "player-one" : "player-two",
            ].join(" ")}
          >
            <div className="player-resource-header">
              <div className="player-resource-identity">
                <strong>{getPlayerLabel(player.id)}</strong>
                <span>{formatFactionName(player.faction)}</span>
              </div>
              <div className="player-resource-flags">
                {player.id === snapshot.activePlayerId ? <span className="player-state-badge active">Active</span> : null}
                {player.id === snapshot.priorityPlayerId ? <span className="player-state-badge priority">Priority</span> : null}
                <span className={["player-state-badge", "bot", player.botAutoplay ? "enabled" : "disabled"].join(" ")}>
                  Bot {player.botAutoplay ? "On" : "Off"}
                </span>
              </div>
            </div>
            <div className="player-resource-values">
              {RESOURCE_ORDER.map((resource) => (
                <span key={resource} className={`player-resource-chip ${resource}`}>
                  <span className="player-resource-symbol">
                    <ResourceIcon resource={resource} size={16} />
                  </span>
                  <strong>{player.resources[resource]}</strong>
                  <small>{getResourceTheme(resource).shortLabel}</small>
                </span>
              ))}
            </div>
            <div className="player-zone-values">
              <span>Hand {player.hand}</span>
              <span>Deck {player.deck}</span>
            </div>
          </article>
        ))}
      </div>

      <p className={["game-top-bar-message", snapshot.lastRejectedReason ? "warning" : ""].join(" ")}>{statusMessage}</p>
    </header>
  );
}
