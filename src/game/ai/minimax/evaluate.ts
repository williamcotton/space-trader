import { getRegisteredCurrencyResourceId } from "../../content/registry";
import { hexDistance } from "../../model/hex";
import { getEnemyEntities, getPlayerBase, getPlayerUnits } from "../../model/queries";
import type { PlayerId } from "../../model/ids";
import { getConfiguredDepositAmount, type GameState, type UnitEntity } from "../../model/state";
import { canAttackEntityDirectly, canUnitAttack } from "../../rules/directInteraction";
import { getResourceNodeAtCoord, isBaseAdjacentDropoffTile } from "../../systems/harvesting";
import { getOpponentPlayer } from "../../turn/stack";

const WIN_SCORE = 1_000_000;

function getClosestDropoffDistance(state: Readonly<GameState>, playerId: PlayerId, unit: UnitEntity): number {
  const base = getPlayerBase(state as GameState, playerId);
  if (!base) {
    return 0;
  }

  return Math.max(0, hexDistance(base.coord, unit.coord) - 1);
}

function getUnitMaterialScore(unit: UnitEntity): number {
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
    unit.moveRange * 6 +
    unit.attackRange * 12 +
    unit.attackActionsPerTurn * 16
  );
}

function scoreUnitPosition(state: Readonly<GameState>, playerId: PlayerId, unit: UnitEntity): number {
  const opponentId = getOpponentPlayer(playerId);
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
    const enemyBase = getPlayerBase(state as GameState, opponentId);
    if (enemyBase) {
      score += Math.max(0, 9 - hexDistance(unit.coord, enemyBase.coord)) * 10;
      if (canAttackEntityDirectly(state, playerId, enemyBase) && hexDistance(unit.coord, enemyBase.coord) <= unit.attackRange) {
        score += 60;
      }
    }

    if (canUnitAttack(unit) && unit.attacksRemaining > 0) {
      const attackableEnemies = getEnemyEntities(state as GameState, playerId).filter((target) =>
        canAttackEntityDirectly(state, playerId, target) &&
        hexDistance(unit.coord, target.coord) <= unit.attackRange
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

function scorePlayerState(state: Readonly<GameState>, playerId: PlayerId): number {
  const currencyResourceId = getRegisteredCurrencyResourceId();
  const player = state.players[playerId];
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
    score += getUnitMaterialScore(unit) * (0.35 + hpRatio * 0.65);
    score += scoreUnitPosition(state, playerId, unit);
  }

  return score;
}

export function evaluateState(state: Readonly<GameState>, botPlayerId: PlayerId): number {
  const opponentId = getOpponentPlayer(botPlayerId);

  if (state.winner === botPlayerId) {
    return WIN_SCORE;
  }

  if (state.winner === opponentId) {
    return -WIN_SCORE;
  }

  const ownScore = scorePlayerState(state, botPlayerId);
  const opponentScore = scorePlayerState(state, opponentId);
  const stackPressure =
    state.stack.length === 0
      ? 0
      : (state.stack[state.stack.length - 1]?.controllerId === botPlayerId ? 35 : -35) * state.stack.length;

  return ownScore - opponentScore + stackPressure;
}
