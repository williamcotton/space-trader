import { getRegisteredCurrencyResourceId } from "../../content/registry";
import { hexDistance } from "../../model/hex";
import { getEnemyBases, getEnemyEntities, getPlayerBase, getPlayerUnits } from "../../model/queries";
import type { PlayerId } from "../../model/ids";
import { getConfiguredDepositAmount, type GameState, type UnitEntity } from "../../model/state";
import { canAttackEntityDirectly, canUnitAttack } from "../../rules/directInteraction";
import { createEffectResolver, type EffectResolver } from "../../systems/effectPipeline";
import { getResourceNodeAtCoord, isBaseAdjacentDropoffTile } from "../../systems/harvesting";
import { getEffectiveUnitAttackRange, getEffectiveUnitMoveRange } from "../../systems/unitStats";
import { getLivePlayerIds, isPlayerEliminated } from "../../turn/playerOrder";
import { AI_WEIGHTS } from "../mvpBot/shared";

const WIN_SCORE = 1_000_000;

function getClosestDropoffDistance(state: Readonly<GameState>, playerId: PlayerId, unit: UnitEntity): number {
  const base = getPlayerBase(state as GameState, playerId);
  if (!base) {
    return 0;
  }

  return Math.max(0, hexDistance(base.coord, unit.coord) - 1);
}

function getUnitMaterialScore(state: Readonly<GameState>, unit: UnitEntity, resolver: EffectResolver): number {
  const effectiveMoveRange = getEffectiveUnitMoveRange(state as GameState, unit, { resolver });
  const effectiveAttackRange = getEffectiveUnitAttackRange(state as GameState, unit, { resolver });
  const roleBase =
    unit.role === "combat"
      ? 110
      : unit.role === "resource"
        ? 90
        : 96;

  return (
    roleBase +
    unit.maxHp * 10 +
    unit.attackDamage * 24 +
    unit.armor * 18 +
    unit.siegeDamageBonus * 12 +
    effectiveMoveRange * 6 +
    effectiveAttackRange * 12 +
    unit.attackActionsPerTurn * 16
  );
}

function scoreUnitPosition(
  state: Readonly<GameState>,
  playerId: PlayerId,
  unit: UnitEntity,
  resolver: EffectResolver
): number {
  const attackRange = getEffectiveUnitAttackRange(state as GameState, unit, { resolver });
  let score = 0;

  if (!unit.hasSummoningSickness) {
    score += 12;
  }

  if (state.phase === "tactical" && state.activePlayerId === playerId) {
    score += unit.movesRemaining * 4;
    score += unit.attacksRemaining * 10;
  }

  if (unit.role === "resource") {
    if (unit.carries) {
      const depositAmount = getConfiguredDepositAmount(state.rules, unit.carries);
      score += depositAmount * 40;
      score -= getClosestDropoffDistance(state, playerId, unit) * 16;
      if (isBaseAdjacentDropoffTile(state as GameState, playerId, unit.coord)) {
        score += 42;
      }
    } else {
      const node = getResourceNodeAtCoord(state as GameState, unit.coord);
      if (node) {
        if (node.controlledBy === playerId) {
          score += 28;
        } else if (node.controlledBy === null) {
          score += 14;
        } else {
          score += 8;
        }
      }
    }
  }

  if (unit.role === "combat") {
    const ownBase = getPlayerBase(state as GameState, playerId);
    if (ownBase) {
      const nearestBaseThreatDistance = getEnemyEntities(state as GameState, playerId)
        .filter((entity) => entity.kind === "unit" && hexDistance(entity.coord, ownBase.coord) <= AI_WEIGHTS.baseThreatRadius)
        .map((entity) => hexDistance(unit.coord, entity.coord))
        .sort((a, b) => a - b)[0];
      if (typeof nearestBaseThreatDistance === "number") {
        score += Math.max(0, 8 - nearestBaseThreatDistance) * 34;
        if (nearestBaseThreatDistance <= attackRange && unit.attacksRemaining > 0) {
          score += 90;
        }
      }
    }

    const enemyBase = getEnemyBases(state as GameState, playerId)
      .map((base) => ({
        base,
        distance: hexDistance(unit.coord, base.coord),
      }))
      .sort((a, b) => a.distance - b.distance || a.base.id.localeCompare(b.base.id))[0]?.base;
    if (enemyBase) {
      score += Math.max(0, 9 - hexDistance(unit.coord, enemyBase.coord)) * 10;
      if (canAttackEntityDirectly(state, playerId, enemyBase) && hexDistance(unit.coord, enemyBase.coord) <= attackRange) {
        score += 60;
      }
    }

    if (canUnitAttack(unit) && unit.attacksRemaining > 0) {
      const attackableEnemies = getEnemyEntities(state as GameState, playerId).filter((target) =>
        canAttackEntityDirectly(state, playerId, target) &&
        hexDistance(unit.coord, target.coord) <= attackRange
      );
      score += attackableEnemies.length * 24;
    }
  }

  if (unit.role === "utility") {
    const allies = getPlayerUnits(state as GameState, playerId).filter((ally) => ally.role === "combat" && ally.id !== unit.id);
    const nearestAlly = allies
      .map((ally) => hexDistance(unit.coord, ally.coord))
      .sort((a, b) => a - b)[0];
    if (typeof nearestAlly === "number") {
      score += Math.max(0, 4 - nearestAlly) * 10;
    }
  }

  return score;
}

function scorePlayerState(state: Readonly<GameState>, playerId: PlayerId, resolver: EffectResolver): number {
  const currencyResourceId = getRegisteredCurrencyResourceId();
  const player = state.players[playerId];
  if (!player || isPlayerEliminated(state as GameState, playerId)) {
    return Number.NEGATIVE_INFINITY;
  }

  const base = getPlayerBase(state as GameState, playerId);

  let score = 0;

  if (base) {
    score += base.hp * 620;
  }

  for (const [resourceType, amount] of Object.entries(player.resources)) {
    score += amount * (resourceType === currencyResourceId ? 12 : 16);
  }

  score += state.zones[playerId].hand.length * 20;

  for (const node of state.map.resourceNodes) {
    if (node.controlledBy === playerId) {
      score += node.resourceType === currencyResourceId ? 42 : 54;
    }
  }

  for (const unit of getPlayerUnits(state as GameState, playerId)) {
    const hpRatio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
    score += getUnitMaterialScore(state, unit, resolver) * (0.35 + hpRatio * 0.65);
    score += scoreUnitPosition(state, playerId, unit, resolver);
  }

  return score;
}

export function evaluateState(state: Readonly<GameState>, botPlayerId: PlayerId): number {
  if (state.winner === botPlayerId) {
    return WIN_SCORE;
  }

  if (state.winner || isPlayerEliminated(state as GameState, botPlayerId)) {
    return -WIN_SCORE;
  }

  const resolver = createEffectResolver(state);
  const ownScore = scorePlayerState(state, botPlayerId, resolver);
  const enemyScores = getLivePlayerIds(state as GameState)
    .filter((playerId) => playerId !== botPlayerId)
    .map((playerId) => scorePlayerState(state, playerId, resolver))
    .filter((score) => Number.isFinite(score));
  const bestEnemyScore = enemyScores.length > 0 ? Math.max(...enemyScores) : 0;
  const averageEnemyScore = enemyScores.length > 0 ? enemyScores.reduce((sum, score) => sum + score, 0) / enemyScores.length : 0;
  const stackPressure =
    state.stack.length === 0
      ? 0
      : (state.stack[state.stack.length - 1]?.controllerId === botPlayerId ? 35 : -35) * state.stack.length;

  return ownScore - bestEnemyScore * 0.7 - averageEnemyScore * 0.3 + stackPressure;
}
