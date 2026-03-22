import type { PlayCardCommand } from "../actions/commands";
import type { CardDefinition } from "../content/cards/catalog";
import { getMapAxialBounds, isWithinMapBounds } from "../model/hex";
import type { PlayerId } from "../model/ids";
import type { GameState, HexCoord } from "../model/state";
import { validateCommand } from "./validators";

export type PlayCardTargetOption = Pick<PlayCardCommand, "targetStackItemId" | "targetEntityId" | "targetHex">;

function getCandidateHexes(state: Readonly<GameState>): HexCoord[] {
  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  const hexes: HexCoord[] = [];
  for (let q = qMin; q <= qMax; q += 1) {
    for (let r = rMin; r <= rMax; r += 1) {
      const coord = { q, r };
      if (isWithinMapBounds(coord, state.map)) {
        hexes.push(coord);
      }
    }
  }
  return hexes;
}

function getCandidateTargetOptions(
  state: Readonly<GameState>,
  definition: CardDefinition
): PlayCardTargetOption[] {
  switch (definition.play.targetMode) {
    case "none":
      return [{}];
    case "stack_item": {
      const topItemId = state.stack[state.stack.length - 1]?.id;
      return topItemId ? [{ targetStackItemId: topItemId }] : [];
    }
    case "entity":
      return Object.values(state.entities)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((entity) => ({ targetEntityId: entity.id }));
    case "hex":
      return getCandidateHexes(state).map((targetHex) => ({ targetHex }));
  }
}

export function getLegalPlayCardTargetOptions(
  state: Readonly<GameState>,
  playerId: PlayerId,
  cardInstanceId: string,
  definition: CardDefinition
): PlayCardTargetOption[] {
  return getCandidateTargetOptions(state, definition).filter((targeting) =>
    validateCommand(state as GameState, {
      type: "PLAY_CARD",
      playerId,
      cardInstanceId,
      ...targeting,
    }).ok
  );
}

export function hasLegalPlayCardTargetOption(
  state: Readonly<GameState>,
  playerId: PlayerId,
  cardInstanceId: string,
  definition: CardDefinition
): boolean {
  return getLegalPlayCardTargetOptions(state, playerId, cardInstanceId, definition).length > 0;
}
