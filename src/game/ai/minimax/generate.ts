import type { GameCommand } from "../../actions/commands";
import { getCardDefinition } from "../../content/cards/catalog";
import { areSameHex, getMapAxialBounds, hexDistance, isWithinMapBounds } from "../../model/hex";
import { getEnemyEntities, getPlayerBase, getPlayerUnits, hasEntityAtCoord, HEX_DIRECTIONS } from "../../model/queries";
import type { PlayerId } from "../../model/ids";
import type { GameState, HexCoord, UnitEntity } from "../../model/state";
import { canAttackEntityDirectly, canUnitAttack, canUnitMove } from "../../rules/directInteraction";
import { canUnitHarvestNode, getResourceNodeAtCoord } from "../../systems/harvesting";
import { resolveCombatAttack } from "../../systems/combat";
import { getOpponentPlayer } from "../../turn/stack";
import {
  rankDiscardCardCommands,
  rankMainPhaseCardCommands,
  rankTacticCardCommands,
} from "../mvpBot/cardChoices";
import {
  AI_WEIGHTS,
  getClosestCoord,
  getPriorityResourceOrderFromHand,
  shouldHarvestResourceType,
} from "../mvpBot/shared";
import type { SearchActionPlan } from "./types";

const MAX_DISCARD_PLANS = 4;
const MAX_TACTIC_CARD_PLANS = 4;
const MAX_MAIN_PHASE_CARD_PLANS = 4;
const MAX_ATTACK_PLANS_PER_UNIT = 3;
const MAX_MOVE_PLANS_PER_UNIT = 3;
const MAX_TOTAL_TACTICAL_PLANS = 18;

function serializeCommand(command: GameCommand): string {
  switch (command.type) {
    case "SELECT_ENTITY":
      return `select:${command.entityId}`;
    case "MOVE_UNIT":
      return `move:${command.entityId}:${command.to.q}:${command.to.r}`;
    case "ATTACK_UNIT":
      return `attack:${command.attackerId}:${command.targetId}`;
    case "HARVEST_NODE":
      return `harvest:${command.entityId}:${command.nodeId}`;
    case "PLAY_CARD":
      return `play:${command.cardInstanceId}:${command.targetStackItemId ?? ""}:${command.targetEntityId ?? ""}:${command.targetHex?.q ?? ""}:${command.targetHex?.r ?? ""}`;
    case "DISCARD_CARD":
      return `discard:${command.cardInstanceId}`;
    case "PASS_PRIORITY":
      return `pass:${command.playerId}`;
    case "END_PHASE":
      return `end:${command.playerId}`;
    case "ADVANCE_PHASE":
      return `advance:${command.playerId}`;
    case "RESPOND_STACK":
      return `respond:${command.effectId}:${command.targetStackItemId ?? ""}`;
    case "CLEAR_SELECTION":
      return `clear:${command.reason}`;
  }
}

function createPlan(commands: GameCommand[], scoreHint: number, label: string): SearchActionPlan {
  return {
    key: commands.map(serializeCommand).join("|"),
    commands,
    scoreHint,
    label,
  };
}

function pushBestPlan(planMap: Map<string, SearchActionPlan>, plan: SearchActionPlan): void {
  const existing = planMap.get(plan.key);
  if (!existing || plan.scoreHint > existing.scoreHint) {
    planMap.set(plan.key, plan);
  }
}

function isSafeResourceNode(
  state: Readonly<GameState>,
  playerId: PlayerId,
  node: GameState["map"]["resourceNodes"][number]
): boolean {
  const ownBase = getPlayerBase(state as GameState, playerId);
  const enemyBase = getPlayerBase(state as GameState, getOpponentPlayer(playerId));
  if (!ownBase || !enemyBase) {
    return true;
  }

  return hexDistance(ownBase.coord, node.coord) <= hexDistance(enemyBase.coord, node.coord) + 1;
}

function chooseResourceNodeObjective(state: Readonly<GameState>, playerId: PlayerId, unit: UnitEntity): HexCoord | null {
  const resourcePriority = getPriorityResourceOrderFromHand(state as GameState, playerId);

  for (const resource of resourcePriority) {
    const safeContested = state.map.resourceNodes
      .filter((node) => node.resourceType === resource && node.controlledBy !== playerId && isSafeResourceNode(state, playerId, node))
      .map((node) => node.coord);
    const safeContestedTarget = getClosestCoord(unit.coord, safeContested);
    if (safeContestedTarget) {
      return safeContestedTarget;
    }

    const safeControlled = state.map.resourceNodes
      .filter((node) => node.resourceType === resource && node.controlledBy === playerId && isSafeResourceNode(state, playerId, node))
      .map((node) => node.coord);
    const safeControlledTarget = getClosestCoord(unit.coord, safeControlled);
    if (safeControlledTarget) {
      return safeControlledTarget;
    }

    const contested = state.map.resourceNodes
      .filter((node) => node.resourceType === resource && node.controlledBy !== playerId)
      .map((node) => node.coord);
    const contestedTarget = getClosestCoord(unit.coord, contested);
    if (contestedTarget) {
      return contestedTarget;
    }
  }

  return getClosestCoord(
    unit.coord,
    state.map.resourceNodes
      .filter((node) => node.controlledBy !== playerId)
      .map((node) => node.coord)
  );
}

function chooseObjectiveCoord(state: Readonly<GameState>, playerId: PlayerId, unit: UnitEntity): HexCoord | null {
  const ownBase = getPlayerBase(state as GameState, playerId);
  const opponentId = getOpponentPlayer(playerId);
  const enemyBase = getPlayerBase(state as GameState, opponentId);

  if (unit.role === "resource") {
    if (unit.carries && ownBase) {
      const dropoffTiles = HEX_DIRECTIONS
        .map((dir) => ({ q: ownBase.coord.q + dir.q, r: ownBase.coord.r + dir.r }))
        .filter((coord) => isWithinMapBounds(coord, state.map));
      return getClosestCoord(unit.coord, dropoffTiles);
    }

    return chooseResourceNodeObjective(state, playerId, unit);
  }

  if (unit.role === "combat") {
    const priorityEnemies = getEnemyEntities(state as GameState, playerId)
      .filter((entity) => entity.kind === "unit" && entity.role === "resource")
      .map((entity) => entity.coord);
    const resourceTarget = getClosestCoord(unit.coord, priorityEnemies);
    if (resourceTarget) {
      return resourceTarget;
    }

    if (ownBase) {
      const nearbyThreats = getEnemyEntities(state as GameState, playerId)
        .filter((entity) => entity.kind === "unit" && hexDistance(entity.coord, ownBase.coord) <= AI_WEIGHTS.nearbyEnemyRadius)
        .map((entity) => entity.coord);
      const defenseTarget = getClosestCoord(unit.coord, nearbyThreats);
      if (defenseTarget) {
        return defenseTarget;
      }
    }
  }

  return enemyBase ? enemyBase.coord : null;
}

function scoreAttackPlan(state: Readonly<GameState>, unit: UnitEntity, targetId: string): number {
  const target = state.entities[targetId];
  if (!target) {
    return Number.NEGATIVE_INFINITY;
  }

  const preview = resolveCombatAttack(state as GameState, unit, target);
  const killScore = preview.targetDestroyed ? 180 : 0;
  const baseScore = target.kind === "base" ? 220 : 0;
  const roleScore =
    target.kind !== "unit"
      ? 0
      : target.role === "resource"
        ? 55
        : target.role === "utility"
          ? 24
          : 0;
  const cargoScore = target.kind === "unit" && target.carries ? 35 : 0;
  return killScore + baseScore + roleScore + cargoScore + preview.finalDamage * 18;
}

function scoreMovePlan(state: Readonly<GameState>, playerId: PlayerId, unit: UnitEntity, coord: HexCoord): number {
  const objective = chooseObjectiveCoord(state, playerId, unit);
  let score = 0;

  if (objective) {
    const currentDistance = hexDistance(unit.coord, objective);
    const nextDistance = hexDistance(coord, objective);
    score += (currentDistance - nextDistance) * 20;
    score -= nextDistance * 2;
  }

  if (unit.role === "resource") {
    const node = state.map.resourceNodes.find((entry) => areSameHex(entry.coord, coord));
    if (unit.carries) {
      const ownBase = getPlayerBase(state as GameState, playerId);
      if (ownBase && hexDistance(ownBase.coord, coord) === 1) {
        score += 100;
      }
    } else if (node) {
      if (node.controlledBy !== playerId) {
        score += 48;
      } else {
        score += 24;
      }
      if (shouldHarvestResourceType(state as GameState, playerId, node.resourceType)) {
        score += 26;
      }
      if (isSafeResourceNode(state, playerId, node)) {
        score += 16;
      }
    }
  }

  if (unit.role === "combat") {
    const attackTargets = getEnemyEntities(state as GameState, playerId).filter((target) =>
      canAttackEntityDirectly(state, playerId, target) &&
      hexDistance(coord, target.coord) <= unit.attackRange
    );
    score += attackTargets.length * 32;

    const enemyBase = getPlayerBase(state as GameState, getOpponentPlayer(playerId));
    if (enemyBase && canAttackEntityDirectly(state, playerId, enemyBase) && hexDistance(coord, enemyBase.coord) <= unit.attackRange) {
      score += 90;
    }
  }

  if (unit.role === "utility") {
    const allies = getPlayerUnits(state as GameState, playerId).filter((ally) => ally.role === "combat" && ally.id !== unit.id);
    const nearestCombat = allies
      .map((ally) => hexDistance(coord, ally.coord))
      .sort((a, b) => a - b)[0];
    if (typeof nearestCombat === "number") {
      score += Math.max(0, 4 - nearestCombat) * 10;
    }
  }

  return score;
}

function buildAttackPlans(
  state: Readonly<GameState>,
  playerId: PlayerId,
  unit: UnitEntity,
  prefix: GameCommand[]
): SearchActionPlan[] {
  if (unit.role !== "combat" || unit.attacksRemaining <= 0 || !canUnitAttack(unit)) {
    return [];
  }

  return getEnemyEntities(state as GameState, playerId)
    .filter((target) => canAttackEntityDirectly(state, playerId, target))
    .filter((target) => hexDistance(unit.coord, target.coord) <= unit.attackRange)
    .map((target) =>
      createPlan(
        [
          ...prefix,
          {
            type: "ATTACK_UNIT",
            playerId,
            attackerId: unit.id,
            targetId: target.id,
          },
        ],
        scoreAttackPlan(state, unit, target.id),
        `attack:${unit.id}:${target.id}`
      )
    )
    .sort((a, b) => b.scoreHint - a.scoreHint || a.key.localeCompare(b.key))
    .slice(0, MAX_ATTACK_PLANS_PER_UNIT);
}

function buildHarvestPlans(
  state: Readonly<GameState>,
  playerId: PlayerId,
  unit: UnitEntity,
  prefix: GameCommand[]
): SearchActionPlan[] {
  if (!canUnitHarvestNode(unit, playerId)) {
    return [];
  }

  const node = getResourceNodeAtCoord(state as GameState, unit.coord);
  if (!node || node.controlledBy !== playerId) {
    return [];
  }

  const score =
    140 +
    (shouldHarvestResourceType(state as GameState, playerId, node.resourceType) ? 40 : 0) +
    (unit.carries ? -60 : 0);

  return [
    createPlan(
      [
        ...prefix,
        {
          type: "HARVEST_NODE",
          playerId,
          entityId: unit.id,
          nodeId: node.id,
        },
      ],
      score,
      `harvest:${unit.id}:${node.id}`
    ),
  ];
}

function buildMovePlans(
  state: Readonly<GameState>,
  playerId: PlayerId,
  unit: UnitEntity,
  prefix: GameCommand[]
): SearchActionPlan[] {
  if (!canUnitMove(unit) || unit.movesRemaining <= 0) {
    return [];
  }

  const { qMin, qMax, rMin, rMax } = getMapAxialBounds(state.map);
  const candidates: Array<{ coord: HexCoord; moveDistance: number; score: number }> = [];

  for (let r = rMin; r <= rMax; r += 1) {
    for (let q = qMin; q <= qMax; q += 1) {
      const coord = { q, r };
      if (!isWithinMapBounds(coord, state.map) || areSameHex(coord, unit.coord) || hasEntityAtCoord(state as GameState, coord)) {
        continue;
      }

      const moveDistance = hexDistance(unit.coord, coord);
      if (moveDistance > unit.movesRemaining) {
        continue;
      }

      candidates.push({
        coord,
        moveDistance,
        score: scoreMovePlan(state, playerId, unit, coord),
      });
    }
  }

  const filteredCandidates: Array<{ coord: HexCoord; moveDistance: number; score: number }> = [];
  for (const candidate of candidates.sort((a, b) => b.score - a.score || b.moveDistance - a.moveDistance || a.coord.q - b.coord.q || a.coord.r - b.coord.r)) {
    const dominated = filteredCandidates.some((kept) => kept.score >= candidate.score && kept.moveDistance >= candidate.moveDistance);
    if (!dominated) {
      filteredCandidates.push(candidate);
    }
  }

  return filteredCandidates
    .slice(0, MAX_MOVE_PLANS_PER_UNIT)
    .map(({ coord, score }) =>
      createPlan(
        [
          ...prefix,
          {
            type: "MOVE_UNIT",
            playerId,
            entityId: unit.id,
            to: coord,
          },
        ],
        score,
        `move:${unit.id}:${coord.q}:${coord.r}`
      )
    );
}

function generateTacticalPlans(state: Readonly<GameState>, playerId: PlayerId): SearchActionPlan[] {
  const plans: SearchActionPlan[] = [];

  for (const unit of getPlayerUnits(state as GameState, playerId)) {
    const prefix =
      state.selectedEntityId === unit.id
        ? []
        : [
            {
              type: "SELECT_ENTITY" as const,
              playerId,
              entityId: unit.id,
            },
          ];

    plans.push(...buildAttackPlans(state, playerId, unit, prefix));
    plans.push(...buildHarvestPlans(state, playerId, unit, prefix));
    plans.push(...buildMovePlans(state, playerId, unit, prefix));
  }

  return plans
    .sort((a, b) => b.scoreHint - a.scoreHint || a.key.localeCompare(b.key))
    .slice(0, MAX_TOTAL_TACTICAL_PLANS);
}

export function generateActionPlans(state: Readonly<GameState>, playerId: PlayerId): SearchActionPlan[] {
  if (state.winner || state.priorityPlayerId !== playerId) {
    return [];
  }

  const plans = new Map<string, SearchActionPlan>();

  if (state.phase !== "discard" && (state.stack.length > 0 || state.activePlayerId !== playerId)) {
    pushBestPlan(
      plans,
      createPlan(
        [
          {
            type: "PASS_PRIORITY",
            playerId,
          },
        ],
        state.stack.length > 0 ? 20 : -20,
        "pass"
      )
    );
  }

  if (state.phase === "discard") {
    for (const candidate of rankDiscardCardCommands(state as GameState, playerId).slice(0, MAX_DISCARD_PLANS)) {
      pushBestPlan(plans, createPlan([candidate.command], candidate.score, `discard:${candidate.cardInstanceId}`));
    }
  } else {
    for (const candidate of rankTacticCardCommands(state as GameState, playerId).slice(0, MAX_TACTIC_CARD_PLANS)) {
      const cardDefinition = getCardDefinition(state.zones[playerId].hand.find((card) => card.instanceId === candidate.cardInstanceId)?.cardId ?? "");
      const stackBonus = state.stack.length > 0 && cardDefinition?.play.targetMode === "stack_item" ? 30 : 0;
      pushBestPlan(plans, createPlan([candidate.command], candidate.score + stackBonus, `spell:${candidate.cardInstanceId}`));
    }

    if (state.activePlayerId === playerId && state.stack.length === 0 && state.phase === "main") {
      for (const candidate of rankMainPhaseCardCommands(state as GameState, playerId).slice(0, MAX_MAIN_PHASE_CARD_PLANS)) {
        pushBestPlan(plans, createPlan([candidate.command], candidate.score, `deploy:${candidate.cardInstanceId}`));
      }
    }

    if (state.activePlayerId === playerId && state.stack.length === 0 && state.phase === "tactical") {
      for (const plan of generateTacticalPlans(state, playerId)) {
        pushBestPlan(plans, plan);
      }
    }

    if (state.activePlayerId === playerId && state.stack.length === 0) {
      pushBestPlan(
        plans,
        createPlan(
          [
            {
              type: "END_PHASE",
              playerId,
            },
          ],
          state.phase === "tactical" ? -10 : -5,
          "end_phase"
        )
      );
    }
  }

  return [...plans.values()].sort((a, b) => b.scoreHint - a.scoreHint || a.key.localeCompare(b.key));
}
