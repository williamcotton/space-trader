import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";

function getBaseHp(state: GameState, playerId: PlayerId): number | null {
  const baseId = state.players[playerId].baseEntityId;
  const base = state.entities[baseId];
  if (!base || base.kind !== "base") {
    return null;
  }
  return base.hp;
}

function resolveWinnerByBaseHp(state: GameState): PlayerId | null {
  const p1BaseHp = getBaseHp(state, "player_1");
  const p2BaseHp = getBaseHp(state, "player_2");
  if (p1BaseHp === null || p2BaseHp === null) {
    return null;
  }

  const p1Destroyed = p1BaseHp <= 0;
  const p2Destroyed = p2BaseHp <= 0;

  if (p1Destroyed && !p2Destroyed) {
    return "player_2";
  }
  if (p2Destroyed && !p1Destroyed) {
    return "player_1";
  }
  if (p1Destroyed && p2Destroyed) {
    // Tie-break for MVP: active player wins simultaneous base kill states.
    return state.activePlayerId;
  }

  return null;
}

export function resolveBaseHpVictory(state: GameState): PlayerId | null {
  const winner = resolveWinnerByBaseHp(state);
  if (!winner) {
    return state.winner;
  }

  if (state.winner !== winner) {
    state.winner = winner;
    state.log.push({
      turn: state.turn,
      text: `${winner} wins by destroying the enemy base.`,
    });
  }

  return state.winner;
}
