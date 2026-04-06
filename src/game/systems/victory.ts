import { DRAW_RESULT_ID, type PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import { getLivePlayerIds, getNextLivePlayerId, getPriorityReturnPlayerId, isPlayerEliminated } from "../turn/playerOrder";
import { removeEffectsForEntity } from "./continuousEffects";

function getBaseHp(state: GameState, playerId: PlayerId): number | null {
  const player = state.players[playerId];
  if (!player) {
    return null;
  }

  const base = state.entities[player.baseEntityId];
  if (!base || base.kind !== "base") {
    return null;
  }

  return base.hp;
}

function eliminatePlayer(state: GameState, playerId: PlayerId): void {
  if (isPlayerEliminated(state, playerId)) {
    return;
  }

  const ownedEntityIds = Object.values(state.entities)
    .filter((entity) => entity.ownerId === playerId)
    .map((entity) => entity.id);

  if (state.selectedEntityId && ownedEntityIds.includes(state.selectedEntityId)) {
    state.selectedEntityId = null;
  }

  for (const entityId of ownedEntityIds) {
    removeEffectsForEntity(state, entityId);
    delete state.entities[entityId];
  }

  state.continuousEffects = state.continuousEffects.filter((effect) => effect.controllerId !== playerId);
  state.stack = state.stack.filter((item) =>
    item.controllerId !== playerId &&
    item.ownerId !== playerId &&
    item.sourceCardOwnerId !== playerId
  );
  state.map.resourceNodes = state.map.resourceNodes.map((node) =>
    node.controlledBy === playerId
      ? { ...node, controlledBy: null }
      : node
  );

  const zones = state.zones[playerId];
  if (zones) {
    zones.deck = [];
    zones.hand = [];
    zones.discard = [];
    zones.exile = [];
  }

  state.eliminatedPlayerIds = [...state.eliminatedPlayerIds, playerId];
  state.consecutivePriorityPasses = 0;

  const nextActivePlayerId = getNextLivePlayerId(state, playerId);
  if (state.activePlayerId === playerId && nextActivePlayerId) {
    state.activePlayerId = nextActivePlayerId;
  }

  if (state.priorityPlayerId === playerId || (state.priorityPlayerId && isPlayerEliminated(state, state.priorityPlayerId))) {
    state.priorityPlayerId = getPriorityReturnPlayerId(state);
  }

  state.log.push({
    turn: state.turn,
    text: `${playerId} was eliminated.`,
  });
}

export function resolveBaseHpVictory(state: GameState): PlayerId | null {
  const destroyedPlayers = getLivePlayerIds(state).filter((playerId) => {
    const baseHp = getBaseHp(state, playerId);
    return baseHp === null || baseHp <= 0;
  });

  for (const playerId of destroyedPlayers) {
    eliminatePlayer(state, playerId);
  }

  const livePlayers = getLivePlayerIds(state);
  if (livePlayers.length === 0) {
    if (state.winner !== DRAW_RESULT_ID) {
      state.winner = DRAW_RESULT_ID;
      state.priorityPlayerId = null;
      state.log.push({
        turn: state.turn,
        text: "Match ended in a draw.",
      });
    }
    return state.winner;
  }

  if (livePlayers.length > 1) {
    if (state.priorityPlayerId && isPlayerEliminated(state, state.priorityPlayerId)) {
      state.priorityPlayerId = getPriorityReturnPlayerId(state);
    }
    return state.winner;
  }

  const winner = livePlayers[0]!;
  if (state.winner !== winner) {
    state.winner = winner;
    state.log.push({
      turn: state.turn,
      text: `${winner} wins by outlasting all opponents.`,
    });
  }

  return state.winner;
}
