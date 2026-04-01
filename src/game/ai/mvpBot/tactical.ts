import type { GameCommand } from "../../actions/commands";
import { areSameHex, getMapAxialBounds, hexDistance, isWithinMapBounds } from "../../model/hex";
import type { PlayerId } from "../../model/ids";
import type { GameState, HexCoord, UnitEntity } from "../../model/state";
import { getEnemyEntities, getPlayerBase, getPlayerUnits, hasEntityAtCoord, HEX_DIRECTIONS } from "../../model/queries";
import {
  canAttackEntityDirectly,
  canUnitAttack,
  canUnitMove,
} from "../../rules/directInteraction";
import { resolveCombatAttack } from "../../systems/combat";
import { getOpponentPlayer } from "../../turn/stack";
import {
  AI_WEIGHTS,
  getClosestCoord,
  getPriorityResourceOrderFromHand,
  getSelectedOwnedUnit,
  shouldHarvestResourceType,
} from "./shared";

function chooseAttackCommand(state: GameState, botPlayerId: PlayerId, unit: UnitEntity): GameCommand | null {
  if (unit.role !== "combat" || unit.attacksRemaining <= 0 || !canUnitAttack(unit)) {
    return null;
  }

  const targets = getEnemyEntities(state, botPlayerId)
    .filter((target) => canAttackEntityDirectly(state, botPlayerId, target))
    .filter((target) => hexDistance(unit.coord, target.coord) <= unit.attackRange)
    .map((target) => {
      const preview = resolveCombatAttack(state, unit, target);
      const killScore = preview.targetDestroyed ? AI_WEIGHTS.attackKillScore : 0;
      const baseScore = target.kind === "base" ? AI_WEIGHTS.attackBaseScore : 0;
      const unitRoleScore =
        target.kind !== "unit"
          ? 0
          : target.role === "resource"
            ? AI_WEIGHTS.attackResourceUnitBonus
            : target.role === "utility"
              ? AI_WEIGHTS.attackUtilityUnitBonus
              : 0;
      const cargoScore = target.kind === "unit" && target.carries ? AI_WEIGHTS.attackCargoBonus : 0;

      return {
        target,
        score: killScore + baseScore + unitRoleScore + cargoScore + preview.finalDamage,
      };
    })
    .sort((a, b) => b.score - a.score || a.target.id.localeCompare(b.target.id));

  const best = targets[0];
  if (!best) {
    return null;
  }

  return {
    type: "ATTACK_UNIT",
    playerId: botPlayerId,
    attackerId: unit.id,
    targetId: best.target.id,
  };
}

function chooseHarvestCommand(state: GameState, botPlayerId: PlayerId, unit: UnitEntity): GameCommand | null {
  if (unit.role !== "resource" || unit.carries) {
    return null;
  }

  const node = state.map.resourceNodes.find((entry) => areSameHex(entry.coord, unit.coord));
  if (!node || node.controlledBy !== botPlayerId) {
    return null;
  }
  if (!shouldHarvestResourceType(state, botPlayerId, node.resourceType)) {
    return null;
  }

  return {
    type: "HARVEST_NODE",
    playerId: botPlayerId,
    entityId: unit.id,
    nodeId: node.id,
  };
}

function isSafeResourceNode(
  state: GameState,
  botPlayerId: PlayerId,
  node: GameState["map"]["resourceNodes"][number]
): boolean {
  const botBase = getPlayerBase(state, botPlayerId);
  const enemyBase = getPlayerBase(state, getOpponentPlayer(botPlayerId));
  if (!botBase || !enemyBase || botBase.kind !== "base" || enemyBase.kind !== "base") {
    return true;
  }

  const distanceToBotBase = hexDistance(botBase.coord, node.coord);
  const distanceToEnemyBase = hexDistance(enemyBase.coord, node.coord);
  return distanceToBotBase <= distanceToEnemyBase + 1;
}

function chooseResourceNodeObjective(state: GameState, botPlayerId: PlayerId, unit: UnitEntity): HexCoord | null {
  const resourcePriority = getPriorityResourceOrderFromHand(state, botPlayerId);

  for (const resource of resourcePriority) {
    const safeContestedNodes = state.map.resourceNodes
      .filter((node) => node.resourceType === resource && node.controlledBy !== botPlayerId && isSafeResourceNode(state, botPlayerId, node))
      .map((node) => node.coord);
    const safeContestedTarget = getClosestCoord(unit.coord, safeContestedNodes);
    if (safeContestedTarget) {
      return safeContestedTarget;
    }

    const safeControlledNodes = state.map.resourceNodes
      .filter((node) => node.resourceType === resource && node.controlledBy === botPlayerId && isSafeResourceNode(state, botPlayerId, node))
      .map((node) => node.coord);
    const safeControlledTarget = getClosestCoord(unit.coord, safeControlledNodes);
    if (safeControlledTarget) {
      return safeControlledTarget;
    }

    const contestedNodes = state.map.resourceNodes
      .filter((node) => node.resourceType === resource && node.controlledBy !== botPlayerId)
      .map((node) => node.coord);
    const contestedTarget = getClosestCoord(unit.coord, contestedNodes);
    if (contestedTarget) {
      return contestedTarget;
    }

    const controlledNodes = state.map.resourceNodes
      .filter((node) => node.resourceType === resource && node.controlledBy === botPlayerId)
      .map((node) => node.coord);
    const controlledTarget = getClosestCoord(unit.coord, controlledNodes);
    if (controlledTarget) {
      return controlledTarget;
    }
  }

  const safeAnyContested = getClosestCoord(
    unit.coord,
    state.map.resourceNodes.filter((node) => node.controlledBy !== botPlayerId && isSafeResourceNode(state, botPlayerId, node)).map((node) => node.coord)
  );
  if (safeAnyContested) {
    return safeAnyContested;
  }

  const safeAnyControlled = getClosestCoord(
    unit.coord,
    state.map.resourceNodes.filter((node) => node.controlledBy === botPlayerId && isSafeResourceNode(state, botPlayerId, node)).map((node) => node.coord)
  );
  if (safeAnyControlled) {
    return safeAnyControlled;
  }

  const anyContested = getClosestCoord(
    unit.coord,
    state.map.resourceNodes.filter((node) => node.controlledBy !== botPlayerId).map((node) => node.coord)
  );
  if (anyContested) {
    return anyContested;
  }

  return getClosestCoord(
    unit.coord,
    state.map.resourceNodes.filter((node) => node.controlledBy === botPlayerId).map((node) => node.coord)
  );
}

function chooseObjectiveCoord(state: GameState, botPlayerId: PlayerId, unit: UnitEntity): HexCoord | null {
  const opponentId = getOpponentPlayer(botPlayerId);
  const botBase = state.entities[state.players[botPlayerId].baseEntityId];
  const enemyBase = state.entities[state.players[opponentId].baseEntityId];

  if (unit.role === "resource") {
    if (unit.carries && botBase && botBase.kind === "base") {
      const dropoffTiles = HEX_DIRECTIONS.map((dir) => ({ q: botBase.coord.q + dir.q, r: botBase.coord.r + dir.r })).filter((coord) =>
        isWithinMapBounds(coord, state.map)
      );
      return getClosestCoord(unit.coord, dropoffTiles);
    }

    return chooseResourceNodeObjective(state, botPlayerId, unit);
  }

  if (unit.role === "combat") {
    if (botBase && botBase.kind === "base") {
      const nearbyEnemies = getEnemyEntities(state, botPlayerId)
        .filter((entity) => entity.kind === "unit" && hexDistance(entity.coord, botBase.coord) <= AI_WEIGHTS.nearbyEnemyRadius)
        .map((entity) => entity.coord);
      if (nearbyEnemies.length > 0) {
        return getClosestCoord(unit.coord, nearbyEnemies);
      }
    }

    if (enemyBase && enemyBase.kind === "base") {
      return enemyBase.coord;
    }
  }

  return enemyBase && enemyBase.kind === "base" ? enemyBase.coord : null;
}

function chooseMoveCommand(state: GameState, botPlayerId: PlayerId, unit: UnitEntity): GameCommand | null {
  if (!canUnitMove(unit) || unit.movesRemaining <= 0) {
    return null;
  }

  const objective = chooseObjectiveCoord(state, botPlayerId, unit);
  if (!objective || areSameHex(unit.coord, objective)) {
    return null;
  }

  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  const candidateSteps: { coord: HexCoord; distance: number; moveDistance: number }[] = [];
  for (let r = rMin; r <= rMax; r += 1) {
    for (let q = qMin; q <= qMax; q += 1) {
      const coord = { q, r };
      if (!isWithinMapBounds(coord, state.map) || areSameHex(coord, unit.coord) || hasEntityAtCoord(state, coord)) {
        continue;
      }

      const moveDistance = hexDistance(unit.coord, coord);
      if (moveDistance > unit.movesRemaining) {
        continue;
      }

      candidateSteps.push({
        coord,
        distance: hexDistance(coord, objective),
        moveDistance,
      });
    }
  }

  candidateSteps.sort(
    (a, b) => a.distance - b.distance || b.moveDistance - a.moveDistance || a.coord.q - b.coord.q || a.coord.r - b.coord.r
  );

  const best = candidateSteps[0];
  if (!best) {
    return null;
  }

  return {
    type: "MOVE_UNIT",
    playerId: botPlayerId,
    entityId: unit.id,
    to: best.coord,
  };
}

function chooseSelectionCommand(state: GameState, botPlayerId: PlayerId): GameCommand | null {
  const units = getPlayerUnits(state, botPlayerId);

  const attackers = units.filter((unit) => chooseAttackCommand(state, botPlayerId, unit) !== null);
  if (attackers.length > 0) {
    return {
      type: "SELECT_ENTITY",
      playerId: botPlayerId,
      entityId: attackers[0].id,
    };
  }

  const harvesters = units.filter((unit) => chooseHarvestCommand(state, botPlayerId, unit) !== null);
  if (harvesters.length > 0) {
    return {
      type: "SELECT_ENTITY",
      playerId: botPlayerId,
      entityId: harvesters[0].id,
    };
  }

  const movers = units.filter((unit) => chooseMoveCommand(state, botPlayerId, unit) !== null);
  if (movers.length > 0) {
    return {
      type: "SELECT_ENTITY",
      playerId: botPlayerId,
      entityId: movers[0].id,
    };
  }

  return null;
}

export function chooseTacticalCommand(state: GameState, botPlayerId: PlayerId): GameCommand {
  const selected = getSelectedOwnedUnit(state, botPlayerId);

  if (selected) {
    const attack = chooseAttackCommand(state, botPlayerId, selected);
    if (attack) {
      return attack;
    }

    const harvest = chooseHarvestCommand(state, botPlayerId, selected);
    if (harvest) {
      return harvest;
    }

    const move = chooseMoveCommand(state, botPlayerId, selected);
    if (move) {
      return move;
    }
  }

  const select = chooseSelectionCommand(state, botPlayerId);
  if (select) {
    return select;
  }

  return {
    type: "END_PHASE",
    playerId: botPlayerId,
  };
}
