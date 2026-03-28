import { areSameHex, isWithinMapBounds } from "../model/hex";
import { HEX_DIRECTIONS } from "../model/queries";
import type { PlayerId } from "../model/ids";
import type { GameState, HexCoord, UnitEntity } from "../model/state";
import { hasRelayKeyword } from "./keywords";

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
  type CascadeBranch = {
    origin: HexCoord;
    totalWaves: number;
  };

  const visitedHexes = new Set<string>();
  const usedEchoUnits = new Set<string>();
  const usedRelayUnits = new Set<string>();
  const affected: HexCoord[] = [];
  const branchQueue: CascadeBranch[] = [{ origin: { ...origin }, totalWaves }];

  while (branchQueue.length > 0) {
    const branch = branchQueue.shift();
    if (!branch) {
      break;
    }

    let frontier: HexCoord[] = [{ ...branch.origin }];

    for (let wave = 0; wave < branch.totalWaves && frontier.length > 0; wave += 1) {
      const waveAreaSeen = new Set<string>();
      const waveArea: HexCoord[] = [];
      const waveAffected: HexCoord[] = [];

      for (const sourceHex of frontier) {
        for (const coord of getWaveArea(state, sourceHex)) {
          const waveKey = toHexKey(coord);
          if (!waveAreaSeen.has(waveKey)) {
            waveAreaSeen.add(waveKey);
            waveArea.push(coord);
          }

          const key = toHexKey(coord);
          if (visitedHexes.has(key)) {
            continue;
          }
          visitedHexes.add(key);
          waveAffected.push(coord);
          affected.push(coord);
        }
      }

      if (waveArea.length === 0) {
        break;
      }

      const relayedUnits = getFriendlyUnitsOnHexes(state, controllerId, waveAffected);
      for (const unit of relayedUnits) {
        if (!hasRelayKeyword(unit.keywords) || usedRelayUnits.has(unit.id)) {
          continue;
        }
        usedRelayUnits.add(unit.id);
        branchQueue.push({ origin: { ...unit.coord }, totalWaves: branch.totalWaves });
      }

      if (wave === branch.totalWaves - 1) {
        break;
      }

      const echoUnits = getFriendlyUnitsOnHexes(state, controllerId, waveArea);
      const nextFrontierSeen = new Set<string>();
      const nextFrontier: HexCoord[] = [];
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
  }

  return affected;
}
