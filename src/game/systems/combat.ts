import { hexDistance } from "../model/hex";
import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, UnitEntity } from "../model/state";
import { getEffectiveUnitArmor, getEffectiveUnitAttackDamage } from "./unitStats";

export type CombatBreakdown = {
  attackerId: string;
  targetId: string;
  rawAttack: number;
  defense: number;
  supplyPenalty: number;
  distanceFromFriendlyBase: number;
  finalDamage: number;
};

export type CombatResolution = CombatBreakdown & {
  targetHpBefore: number;
  targetHpAfter: number;
  targetDestroyed: boolean;
};

function getPlayerBase(state: GameState, playerId: PlayerId) {
  const baseId = state.players[playerId].baseEntityId;
  const base = state.entities[baseId];
  if (!base || base.kind !== "base") {
    return null;
  }
  return base;
}

function getTemporaryAttackBuffs(_state: GameState, _attacker: UnitEntity, _target: EntityState): number {
  return 0;
}

function getFactionAttackBonus(_state: GameState, _attacker: UnitEntity): number {
  return 0;
}

function getTerrainDefenseBonus(_state: GameState, _target: EntityState): number {
  return 0;
}

function getTileDefenseBonus(_state: GameState, _target: EntityState): number {
  return 0;
}

function getFactionDefenseBonus(_state: GameState, _target: EntityState): number {
  return 0;
}

function getSupplyPenalty(distanceFromFriendlyBase: number): number {
  return Math.max(0, Math.ceil((distanceFromFriendlyBase - 6) / 3));
}

function getBaseSiegeBonus(attacker: UnitEntity, target: EntityState): number {
  return target.kind === "base" ? attacker.siegeDamageBonus : 0;
}

export function resolveCombatAttack(state: GameState, attacker: UnitEntity, target: EntityState): CombatResolution {
  const attackerBase = getPlayerBase(state, attacker.ownerId);
  const distanceFromFriendlyBase = attackerBase ? hexDistance(attacker.coord, attackerBase.coord) : 0;
  const effectiveAttackDamage = getEffectiveUnitAttackDamage(state, attacker);
  const effectiveTargetArmor = target.kind === "unit" ? getEffectiveUnitArmor(state, target) : 0;

  const rawAttack =
    effectiveAttackDamage +
    getTemporaryAttackBuffs(state, attacker, target) +
    getFactionAttackBonus(state, attacker) +
    getBaseSiegeBonus(attacker, target);
  const defense =
    effectiveTargetArmor +
    getTerrainDefenseBonus(state, target) +
    getTileDefenseBonus(state, target) +
    getFactionDefenseBonus(state, target);

  const supplyPenalty = getSupplyPenalty(distanceFromFriendlyBase);
  const finalDamage = Math.max(1, rawAttack - defense - supplyPenalty);
  const targetHpBefore = target.hp;
  const targetHpAfter = Math.max(0, targetHpBefore - finalDamage);

  return {
    attackerId: attacker.id,
    targetId: target.id,
    rawAttack,
    defense,
    supplyPenalty,
    distanceFromFriendlyBase,
    finalDamage,
    targetHpBefore,
    targetHpAfter,
    targetDestroyed: targetHpAfter === 0,
  };
}
