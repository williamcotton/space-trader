import { areSameHex, isWithinMapBounds } from "../model/hex";
import { HEX_DIRECTIONS } from "../model/queries";
import type { PlayerId } from "../model/ids";
import type { GameState, HexCoord, UnitEntity } from "../model/state";

function toHexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

function getWaveArea(state: Readonly<GameState>, origin: HexCoord): HexCoord[] {
  const coords = [origin, ...HEX_DIRECTIONS.map((dir) => ({ q: origin.q + dir.q, r: origin.r + dir.r }))];
  return coords.filter((coord) => isWithinMapBounds(coord, state.map));
}

function getFriendlyUnitsOnHexes(
  state: Readonly<GameState>,
  controllerId: PlayerId,
  hexes: readonly HexCoord[]
): UnitEntity[] {
  return Object.values(state.entities)
    .filter((entity): entity is UnitEntity =>
      entity.kind === "unit" &&
      entity.ownerId === controllerId &&
      hexes.some((coord) => areSameHex(entity.coord, coord))
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getCascadeAffectedHexes(
  state: Readonly<GameState>,
  controllerId: PlayerId,
  origin: HexCoord,
  totalWaves: number
): HexCoord[] {
  const visitedHexes = new Set<string>();
  const usedEchoUnits = new Set<string>();
  const affected: HexCoord[] = [];
  let frontier: HexCoord[] = [{ ...origin }];

  for (let wave = 0; wave < totalWaves && frontier.length > 0; wave += 1) {
    const waveAffected: HexCoord[] = [];

    for (const sourceHex of frontier) {
      for (const coord of getWaveArea(state, sourceHex)) {
        const key = toHexKey(coord);
        if (visitedHexes.has(key)) {
          continue;
        }
        visitedHexes.add(key);
        waveAffected.push(coord);
        affected.push(coord);
      }
    }

    if (wave === totalWaves - 1 || waveAffected.length === 0) {
      break;
    }

    const nextFrontierSeen = new Set<string>();
    const nextFrontier: HexCoord[] = [];
    const echoUnits = getFriendlyUnitsOnHexes(state, controllerId, waveAffected);
    for (const unit of echoUnits) {
      if (usedEchoUnits.has(unit.id)) {
        continue;
      }
      usedEchoUnits.add(unit.id);
      const key = toHexKey(unit.coord);
      if (nextFrontierSeen.has(key)) {
        continue;
      }
      nextFrontierSeen.add(key);
      nextFrontier.push({ ...unit.coord });
    }

    frontier = nextFrontier;
  }

  return affected;
}
