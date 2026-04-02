import { MAX_HAND_SIZE, type EntityState, type GameState, type HexCoord, type UnitEntity } from "../../../../model/state";
import type { PlayerId } from "../../../../model/ids";
import type { ResourceType } from "../../../../model/enums";
import { areSameHex, hexDistance } from "../../../../model/hex";
import { getEnemyEntities, getPlayerBase, getPlayerUnits } from "../../../../model/queries";
import { canAttackEntityDirectly, canUnitAttack, canUnitDeclareAttack } from "../../../../rules/directInteraction";
import { getOpponentPlayer } from "../../../../turn/stack";
import { getEffectiveUnitAttackDamage, getEffectiveUnitAttackRange, getEffectiveUnitMoveRange } from "../../../../systems/unitStats";
import { getRegisteredCurrencyResourceId, getRegisteredResourceIds } from "../../../registry";
import { applyUnitBuffScoreContributions } from "../../../../registries/aiMechanics";
import { resolveCombatAttack } from "../../../../systems/combat";

const AI_WEIGHTS = {
  threatCombatBase: 34,
  threatResourceBase: 20,
  threatUtilityBase: 15,
  threatAttackMult: 4,
  threatArmorMult: 4,
  threatRangeMult: 2,
  threatNearBaseBonus: 22,
  threatNearBaseRadius: 2,
  threatMedBaseBonus: 12,
  threatMedBaseRadius: 4,
  damageLethalBaseScore: 320,
  damageBoardPressureBonus: 30,
  damageBaseHpDeltaMult: 4,
  damageBaseAmountMult: 5,
  damageKillBonus: 96,
  damageWoundedBonus: 12,
  damageTimingPenalty: 30,
  damageAppliedMult: 10,
  destroyBase: 110,
  destroyHpDeltaMult: 4,
  gainControlBase: 96,
  gainControlCombatBonus: 34,
  gainControlResourceBonus: 16,
  gainControlUtilityBonus: 22,
  gainControlAttackReadyBonus: 42,
  gainControlAttackDamageMult: 18,
  gainControlKillBonus: 72,
  gainControlBasePressureBonus: 24,
  modifyAttackBase: 28,
  modifyAttackDamageMult: 20,
  modifyAttackKillBonus: 70,
  modifyArmorBase: 24,
  modifyArmorPreventedDmgMult: 14,
  modifyArmorPreventKillBonus: 66,
  modifySiegeBase: 18,
  modifySiegePressureMult: 28,
  modifySiegeReadyBonus: 92,
  modifySiegeNearBonus: 46,
  modifyMoveLossBasePenalty: 16,
  modifyMoveLossResourcePenalty: 44,
  modifyMoveLossCargoPenalty: 120,
  modifyMoveLossNodePenalty: 34,
  modifyMoveLossDistancePenalty: 12,
  modifySiegeTowerReadyDiscount: 112,
  modifySiegeTowerNearDiscount: 52,
  braceBase: 26,
  bracePreventedDmgMult: 15,
  bracePreventKillBonus: 80,
  braceCombatBonus: 18,
  friendlyUnitBasePenalty: 20,
  friendlyCombatPenalty: 18,
  friendlyDamagePenaltyMult: 12,
  friendlyKillPenalty: 88,
  sweepClusterBonus: 12,
  drawCardValue: 30,
  gainedResourceValue: 12,
  burstLowHandBonus: 22,
  burstVeryLowHandBonus: 34,
  burstFullHandPenalty: 26,
  destroyDamagedBase: 110,
  basePingLethalScore: 300,
  basePingNearCapBonus: 18,
  basePingFullHandBonus: 34,
  basePingDeckEmptyBonus: 20,
  basePingFloodThreshold: 10,
  basePingFloodBonusPerResource: 2,
  basePingFloodBonusCap: 28,
} as const;

function getResourceOrder(): ResourceType[] {
  const resourceIds = getRegisteredResourceIds();
  return resourceIds.length > 0 ? resourceIds : [getRegisteredCurrencyResourceId()];
}

function scoreEnemyEntityThreat(state: GameState, botPlayerId: PlayerId, target: EntityState): number {
  if (target.kind === "base") {
    return 0;
  }

  let score =
    target.role === "combat"
      ? AI_WEIGHTS.threatCombatBase
      : target.role === "resource"
        ? AI_WEIGHTS.threatResourceBase
        : AI_WEIGHTS.threatUtilityBase;
  score +=
    target.attackDamage * AI_WEIGHTS.threatAttackMult +
    target.armor * AI_WEIGHTS.threatArmorMult +
    getEffectiveUnitAttackRange(state, target) * AI_WEIGHTS.threatRangeMult;

  const botBase = state.entities[state.players[botPlayerId].baseEntityId];
  if (botBase && botBase.kind === "base") {
    const distanceToBase = hexDistance(target.coord, botBase.coord);
    if (distanceToBase <= AI_WEIGHTS.threatNearBaseRadius) {
      score += AI_WEIGHTS.threatNearBaseBonus;
    } else if (distanceToBase <= AI_WEIGHTS.threatMedBaseRadius) {
      score += AI_WEIGHTS.threatMedBaseBonus;
    }
  }

  return score;
}

export function scoreDamageSpellTarget(
  state: GameState,
  botPlayerId: PlayerId,
  target: EntityState,
  amount: number,
  phase: GameState["phase"]
): number {
  if (target.kind === "base") {
    if (amount >= target.hp) {
      return AI_WEIGHTS.damageLethalBaseScore;
    }

    if (phase !== "tactical") {
      return -Infinity;
    }

    const enemyUnits = getEnemyEntities(state, botPlayerId).filter((entity) => entity.kind === "unit");
    const boardPressureBonus = enemyUnits.length === 0 ? AI_WEIGHTS.damageBoardPressureBonus : 0;
    let score =
      boardPressureBonus + (target.maxHp - target.hp) * AI_WEIGHTS.damageBaseHpDeltaMult + amount * AI_WEIGHTS.damageBaseAmountMult;

    const handSize = state.zones[botPlayerId].hand.length;
    if (handSize >= MAX_HAND_SIZE) {
      score += AI_WEIGHTS.basePingFullHandBonus;
    } else if (handSize === MAX_HAND_SIZE - 1) {
      score += AI_WEIGHTS.basePingNearCapBonus;
    }

    if (state.zones[botPlayerId].deck.length === 0) {
      score += AI_WEIGHTS.basePingDeckEmptyBonus;
    }

    const totalResources = getResourceOrder().reduce((sum, resource) => sum + state.players[botPlayerId].resources[resource], 0);
    const floodBonus =
      Math.max(0, totalResources - AI_WEIGHTS.basePingFloodThreshold) * AI_WEIGHTS.basePingFloodBonusPerResource;
    score += Math.min(AI_WEIGHTS.basePingFloodBonusCap, floodBonus);

    return score;
  }

  const appliedDamage = Math.min(amount, target.hp);
  const killBonus = amount >= target.hp ? AI_WEIGHTS.damageKillBonus : 0;
  const woundedBonus = target.hp < target.maxHp ? AI_WEIGHTS.damageWoundedBonus : 0;
  const timingPenalty = phase === "main" && killBonus === 0 ? AI_WEIGHTS.damageTimingPenalty : 0;

  return (
    scoreEnemyEntityThreat(state, botPlayerId, target) +
    appliedDamage * AI_WEIGHTS.damageAppliedMult +
    killBonus +
    woundedBonus -
    timingPenalty
  );
}

export function scoreDestroySpellTarget(state: GameState, botPlayerId: PlayerId, target: UnitEntity): number {
  if (target.hp >= target.maxHp) {
    return -Infinity;
  }

  return (
    AI_WEIGHTS.destroyBase +
    scoreEnemyEntityThreat(state, botPlayerId, target) +
    (target.maxHp - target.hp) * AI_WEIGHTS.destroyHpDeltaMult
  );
}

export function scoreGainControlSpellTarget(state: GameState, botPlayerId: PlayerId, target: UnitEntity): number {
  let score =
    AI_WEIGHTS.gainControlBase +
    scoreEnemyEntityThreat(state, botPlayerId, target) +
    scoreFriendlyUnitValue(state, target);

  score +=
    target.role === "combat"
      ? AI_WEIGHTS.gainControlCombatBonus
      : target.role === "resource"
        ? AI_WEIGHTS.gainControlResourceBonus
        : AI_WEIGHTS.gainControlUtilityBonus;

  if (canUnitDeclareAttack(state, target) && target.attacksRemaining > 0) {
    score += AI_WEIGHTS.gainControlAttackReadyBonus;

    const bestAttackTarget = getEnemyEntities(state, botPlayerId)
      .filter((entity) => entity.id !== target.id)
      .filter((entity) => canAttackEntityDirectly(state, botPlayerId, entity))
      .filter((entity) => hexDistance(target.coord, entity.coord) <= getEffectiveUnitAttackRange(state, target))
      .map((entity) => ({
        entity,
        preview: resolveCombatAttack(state, target, entity),
      }))
      .sort((a, b) =>
        (b.preview.finalDamage + Number(b.preview.targetDestroyed) * AI_WEIGHTS.gainControlKillBonus) -
        (a.preview.finalDamage + Number(a.preview.targetDestroyed) * AI_WEIGHTS.gainControlKillBonus) ||
        a.entity.id.localeCompare(b.entity.id)
      )[0];

    if (bestAttackTarget) {
      score += bestAttackTarget.preview.finalDamage * AI_WEIGHTS.gainControlAttackDamageMult;
      if (bestAttackTarget.preview.targetDestroyed) {
        score += AI_WEIGHTS.gainControlKillBonus;
      }
      if (bestAttackTarget.entity.kind === "base") {
        score += AI_WEIGHTS.gainControlBasePressureBonus;
      }
    }
  }

  return score;
}

export function scoreModifyTargetUnitSpellTarget(
  state: GameState,
  botPlayerId: PlayerId,
  target: UnitEntity,
  options: {
    attackBonus?: number;
    armorBonus?: number;
    siegeBonus?: number;
    moveRangeBonus?: number;
    attackRangeBonus?: number;
    grantedKeywords?: string[];
    setMoveRange?: number;
  }
): number {
  if (target.ownerId !== botPlayerId) {
    return -Infinity;
  }

  const attackBonus = options.attackBonus ?? 0;
  const armorBonus = options.armorBonus ?? 0;
  const siegeBonus = options.siegeBonus ?? 0;
  const moveRangeBonus = options.moveRangeBonus ?? 0;
  const grantedKeywords = options.grantedKeywords ?? [];
  const currentAttackRange = getEffectiveUnitAttackRange(state, target);
  const currentMoveRange = getEffectiveUnitMoveRange(state, target);
  const nextMoveRange =
    typeof options.setMoveRange === "number"
      ? Math.max(0, options.setMoveRange)
      : Math.max(0, currentMoveRange + moveRangeBonus);
  const opponentId = getOpponentPlayer(botPlayerId);
  const ownBase = getPlayerBase(state, botPlayerId);
  const enemyBase = getPlayerBase(state, opponentId);

  let score = 0;
  let hasMeaningfulOpportunity = false;
  const mechanicContributions = applyUnitBuffScoreContributions({
    state,
    botPlayerId,
    affectedUnits: [target],
    options: {
      attackBonus,
      armorBonus,
      grantedKeywords,
    },
  });
  score += mechanicContributions.scoreDelta;
  if (mechanicContributions.hasMeaningfulOpportunity) {
    hasMeaningfulOpportunity = true;
  }

  if (attackBonus > 0 && target.attacksRemaining > 0 && canUnitDeclareAttack(state, target)) {
    const bestTarget = getEnemyEntities(state, botPlayerId)
      .filter((entity) => canAttackEntityDirectly(state, botPlayerId, entity))
      .filter((entity) => hexDistance(target.coord, entity.coord) <= currentAttackRange)
      .map((entity) => ({
        entity,
        preview: resolveCombatAttack(state, target, entity),
      }))
      .sort((a, b) =>
        (b.preview.finalDamage + Number(b.preview.targetDestroyed) * AI_WEIGHTS.modifyAttackKillBonus) -
        (a.preview.finalDamage + Number(a.preview.targetDestroyed) * AI_WEIGHTS.modifyAttackKillBonus) ||
        a.entity.id.localeCompare(b.entity.id)
      )[0];

    if (bestTarget) {
      const currentAttack = getEffectiveUnitAttackDamage(state, target);
      const buffedAttack = currentAttack + attackBonus;
      score += AI_WEIGHTS.modifyAttackBase;
      score += (Math.min(bestTarget.entity.hp, buffedAttack) - Math.min(bestTarget.entity.hp, currentAttack)) * AI_WEIGHTS.modifyAttackDamageMult;
      if (currentAttack < bestTarget.entity.hp && buffedAttack >= bestTarget.entity.hp) {
        score += AI_WEIGHTS.modifyAttackKillBonus;
      }
      hasMeaningfulOpportunity = true;
    }
  }

  if (armorBonus > 0) {
    const threateningEnemies = getPlayerUnits(state, opponentId).filter(
      (enemy) =>
        canUnitDeclareAttack(state, enemy) &&
        enemy.attacksRemaining > 0 &&
        canAttackEntityDirectly(state, enemy.ownerId, target) &&
        hexDistance(enemy.coord, target.coord) <= getEffectiveUnitAttackRange(state, enemy)
    );

    for (const enemy of threateningEnemies) {
      const before = resolveCombatAttack(state, enemy, target);
      const reducedDamage = Math.max(1, before.rawAttack - (before.defense + armorBonus) - before.supplyPenalty);
      const preventedDamage = before.finalDamage - reducedDamage;
      if (preventedDamage <= 0) {
        continue;
      }

      score += AI_WEIGHTS.modifyArmorBase + preventedDamage * AI_WEIGHTS.modifyArmorPreventedDmgMult;
      if (before.targetDestroyed && target.hp > reducedDamage) {
        score += AI_WEIGHTS.modifyArmorPreventKillBonus;
      }
      hasMeaningfulOpportunity = true;
    }
  }

  if (siegeBonus > 0 && enemyBase && canAttackEntityDirectly(state, botPlayerId, enemyBase)) {
    const distanceToEnemyBase = hexDistance(target.coord, enemyBase.coord);
    const distanceOverRange = Math.max(0, distanceToEnemyBase - currentAttackRange);
    score += AI_WEIGHTS.modifySiegeBase + siegeBonus * AI_WEIGHTS.modifySiegePressureMult;
    if (distanceOverRange === 0) {
      score += AI_WEIGHTS.modifySiegeReadyBonus;
      hasMeaningfulOpportunity = true;
    } else if (distanceOverRange <= 2) {
      score += AI_WEIGHTS.modifySiegeNearBonus;
      hasMeaningfulOpportunity = true;
    }
  }

  if (nextMoveRange < currentMoveRange) {
    let penalty = (currentMoveRange - nextMoveRange) * AI_WEIGHTS.modifyMoveLossBasePenalty;
    if (target.role === "resource") {
      penalty += AI_WEIGHTS.modifyMoveLossResourcePenalty;
    }
    if (target.carries) {
      penalty += AI_WEIGHTS.modifyMoveLossCargoPenalty;
    }
    if (target.role === "resource" && state.map.resourceNodes.some((node) => node.controlledBy === botPlayerId && areSameHex(node.coord, target.coord))) {
      penalty += AI_WEIGHTS.modifyMoveLossNodePenalty;
    }

    if (enemyBase) {
      const distanceToEnemyBase = hexDistance(target.coord, enemyBase.coord);
      if (siegeBonus > 0 && distanceToEnemyBase <= currentAttackRange) {
        penalty -= AI_WEIGHTS.modifySiegeTowerReadyDiscount;
      } else if (siegeBonus > 0 && distanceToEnemyBase <= currentAttackRange + 2) {
        penalty -= AI_WEIGHTS.modifySiegeTowerNearDiscount;
      } else {
        penalty += distanceToEnemyBase * AI_WEIGHTS.modifyMoveLossDistancePenalty;
      }
    }

    if (ownBase && target.role === "resource" && !target.carries && siegeBonus <= 0 && hexDistance(target.coord, ownBase.coord) <= 2) {
      penalty += AI_WEIGHTS.modifyMoveLossNodePenalty;
    }

    score -= penalty;
    hasMeaningfulOpportunity = true;
  }

  return hasMeaningfulOpportunity ? score : -Infinity;
}

export function scoreBaseDamageSpell(
  state: GameState,
  botPlayerId: PlayerId,
  amount: number,
  phase: GameState["phase"]
): number {
  const enemyBase = state.entities[state.players[getOpponentPlayer(botPlayerId)].baseEntityId];
  if (!enemyBase || enemyBase.kind !== "base") {
    return -Infinity;
  }

  return scoreDamageSpellTarget(state, botPlayerId, enemyBase, amount, phase);
}

export function scoreBraceProtocolTarget(state: GameState, botPlayerId: PlayerId, target: UnitEntity): number {
  const threateningEnemies = getPlayerUnits(state, getOpponentPlayer(botPlayerId)).filter((enemy) => {
    return (
      enemy.role === "combat" &&
      canUnitAttack(enemy) &&
      enemy.attacksRemaining > 0 &&
      hexDistance(enemy.coord, target.coord) <= getEffectiveUnitAttackRange(state, enemy)
    );
  });

  if (threateningEnemies.length === 0) {
    return -Infinity;
  }

  let preventedDamage = 0;
  let preventsKill = false;
  const hypotheticalEffect = {
    id: `hyp_brace_${target.id}`,
    sourceEntityId: null,
    sourceCardId: null,
    controllerId: botPlayerId,
    payload: { type: "stat_modifier" as const, stat: "armor" as const, amount: 2 },
    target: { type: "specific_entity" as const, entityId: target.id },
    expiry: { type: "permanent" as const },
    layer: 4,
    timestamp: 0,
  };
  try {
    for (const enemy of threateningEnemies) {
      const before = resolveCombatAttack(state, enemy, target);
      state.continuousEffects.push(hypotheticalEffect);
      const after = resolveCombatAttack(state, enemy, target);
      state.continuousEffects.pop();
      preventedDamage += before.finalDamage - after.finalDamage;
      if (before.targetDestroyed && !after.targetDestroyed) {
        preventsKill = true;
      }
    }
  } finally {
    const idx = state.continuousEffects.indexOf(hypotheticalEffect);
    if (idx >= 0) state.continuousEffects.splice(idx, 1);
  }

  if (preventedDamage <= 0) {
    return -Infinity;
  }

  return (
    AI_WEIGHTS.braceBase +
    preventedDamage * AI_WEIGHTS.bracePreventedDmgMult +
    (preventsKill ? AI_WEIGHTS.bracePreventKillBonus : 0) +
    (target.role === "combat" ? AI_WEIGHTS.braceCombatBonus : 0)
  );
}

function scoreFriendlyUnitValue(state: GameState, unit: UnitEntity): number {
  const roleBase =
    unit.role === "combat"
      ? AI_WEIGHTS.threatCombatBase
      : unit.role === "resource"
        ? AI_WEIGHTS.threatResourceBase
        : AI_WEIGHTS.threatUtilityBase;

  return roleBase + unit.attackDamage * 3 + unit.armor * 3 + getEffectiveUnitAttackRange(state, unit) * 2;
}

function scoreUnitBuffOpportunity(
  state: GameState,
  botPlayerId: PlayerId,
  affectedUnits: UnitEntity[],
  options: {
    attackBonus: number;
    armorBonus: number;
    roleFilter?: "combat" | "resource" | "utility";
    grantedKeywords?: string[];
  }
): number {
  if (affectedUnits.length === 0) {
    return -Infinity;
  }

  let score = affectedUnits.length * 4;
  let hasMeaningfulOpportunity = false;
  const mechanicContributions = applyUnitBuffScoreContributions({
    state,
    botPlayerId,
    affectedUnits,
    options,
  });
  score += mechanicContributions.scoreDelta;
  if (mechanicContributions.hasMeaningfulOpportunity) {
    hasMeaningfulOpportunity = true;
  }

  for (const unit of affectedUnits) {
    score += unit.role === "combat" ? 14 : unit.role === "utility" ? 8 : 5;

    if (options.armorBonus > 0) {
      const threateningEnemies = getPlayerUnits(state, getOpponentPlayer(botPlayerId)).filter(
        (enemy) =>
          canUnitDeclareAttack(state, enemy) &&
          enemy.attacksRemaining > 0 &&
          canAttackEntityDirectly(state, enemy.ownerId, unit) &&
          hexDistance(enemy.coord, unit.coord) <= getEffectiveUnitAttackRange(state, enemy)
      );

      for (const enemy of threateningEnemies) {
        const before = resolveCombatAttack(state, enemy, unit);
        const reducedDamage = Math.max(1, before.rawAttack - (before.defense + options.armorBonus) - before.supplyPenalty);
        const preventedDamage = before.finalDamage - reducedDamage;
        if (preventedDamage <= 0) {
          continue;
        }

        hasMeaningfulOpportunity = true;
        score += preventedDamage * 14;
        if (before.targetDestroyed && unit.hp > reducedDamage) {
          score += 66;
        }
      }
    }

    if (options.attackBonus <= 0 || unit.attacksRemaining <= 0 || !canUnitDeclareAttack(state, unit)) {
      continue;
    }

    const inRangeTargets = getEnemyEntities(state, botPlayerId)
      .filter((target) => canAttackEntityDirectly(state, botPlayerId, target))
      .filter((target) => hexDistance(unit.coord, target.coord) <= getEffectiveUnitAttackRange(state, unit))
      .sort((a, b) => a.id.localeCompare(b.id));

    const bestTarget = inRangeTargets[0];
    if (!bestTarget) {
      continue;
    }

    hasMeaningfulOpportunity = true;
    score += 28;

    const currentAttack = getEffectiveUnitAttackDamage(state, unit);
    const buffedAttack = currentAttack + options.attackBonus;
    const currentDamage = Math.min(currentAttack, bestTarget.hp);
    const buffedDamage = Math.min(buffedAttack, bestTarget.hp);
    score += (buffedDamage - currentDamage) * 20;

    if (bestTarget.kind === "base") {
      score += 18;
    } else if (currentAttack < bestTarget.hp && buffedAttack >= bestTarget.hp) {
      score += 70;
    }
  }

  return hasMeaningfulOpportunity ? score : -Infinity;
}

export function scoreGlobalBuffSpell(
  state: GameState,
  botPlayerId: PlayerId,
  options: {
    attackBonus: number;
    armorBonus: number;
    relation: "ally" | "enemy" | "any";
    roleFilter?: "combat" | "resource" | "utility";
    grantedKeywords?: string[];
  }
): number {
  const affectedUnits = Object.values(state.entities)
    .filter(
      (entity): entity is UnitEntity =>
        entity.kind === "unit" &&
        (options.relation === "any" ||
          (options.relation === "ally" ? entity.ownerId === botPlayerId : entity.ownerId !== botPlayerId)) &&
        (!options.roleFilter || entity.role === options.roleFilter)
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  if (options.relation !== "ally") {
    return -Infinity;
  }

  return scoreUnitBuffOpportunity(state, botPlayerId, affectedUnits, {
    attackBonus: options.attackBonus,
    armorBonus: options.armorBonus,
    roleFilter: options.roleFilter,
    grantedKeywords: options.grantedKeywords,
  });
}

export function scoreMassDamageSpell(
  state: GameState,
  botPlayerId: PlayerId,
  options: {
    amount: number;
    relation: "ally" | "enemy" | "any";
  }
): number {
  const targets = Object.values(state.entities).filter(
    (entity): entity is UnitEntity =>
      entity.kind === "unit" &&
      (options.relation === "any" ||
        (options.relation === "ally" ? entity.ownerId === botPlayerId : entity.ownerId !== botPlayerId))
  );

  let score = 0;
  let enemyHits = 0;

  for (const unit of targets) {
    const appliedDamage = Math.min(options.amount, unit.hp);
    const kill = options.amount >= unit.hp;
    if (unit.ownerId === botPlayerId) {
      score -= AI_WEIGHTS.friendlyUnitBasePenalty + scoreFriendlyUnitValue(state, unit) * 0.6;
      score -= appliedDamage * AI_WEIGHTS.friendlyDamagePenaltyMult;
      if (kill) {
        score -= AI_WEIGHTS.friendlyKillPenalty + (unit.role === "combat" ? AI_WEIGHTS.friendlyCombatPenalty : 0);
      }
    } else {
      enemyHits += 1;
      score += scoreEnemyEntityThreat(state, botPlayerId, unit);
      score += appliedDamage * AI_WEIGHTS.damageAppliedMult;
      if (kill) {
        score += AI_WEIGHTS.damageKillBonus;
      }
    }
  }

  if (enemyHits === 0) {
    return -Infinity;
  }

  return score + enemyHits * AI_WEIGHTS.sweepClusterBonus;
}

export function scoreDestroyDamagedUnitsSpell(
  state: GameState,
  botPlayerId: PlayerId,
  relation: "ally" | "enemy" | "any"
): number {
  const targets = Object.values(state.entities).filter(
    (entity): entity is UnitEntity =>
      entity.kind === "unit" &&
      entity.hp < entity.maxHp &&
      (relation === "any" ||
        (relation === "ally" ? entity.ownerId === botPlayerId : entity.ownerId !== botPlayerId))
  );

  let score = 0;
  let enemyTargets = 0;

  for (const unit of targets) {
    if (unit.ownerId === botPlayerId) {
      score -= AI_WEIGHTS.friendlyKillPenalty + scoreFriendlyUnitValue(state, unit);
    } else {
      enemyTargets += 1;
      score +=
        AI_WEIGHTS.destroyDamagedBase +
        scoreEnemyEntityThreat(state, botPlayerId, unit) +
        (unit.maxHp - unit.hp) * AI_WEIGHTS.destroyHpDeltaMult;
    }
  }

  return enemyTargets > 0 ? score : -Infinity;
}

export function scoreDrawAndGainResourcesSpell(
  state: GameState,
  botPlayerId: PlayerId,
  options: {
    drawCount: number;
    resources: Partial<Record<ResourceType, number>>;
  }
): number {
  let score = options.drawCount * AI_WEIGHTS.drawCardValue;
  for (const resource of getResourceOrder()) {
    score += (options.resources[resource] ?? 0) * AI_WEIGHTS.gainedResourceValue;
  }

  const handSize = state.zones[botPlayerId].hand.length;
  if (handSize <= 2) {
    score += AI_WEIGHTS.burstVeryLowHandBonus;
  } else if (handSize <= 4) {
    score += AI_WEIGHTS.burstLowHandBonus;
  } else if (handSize >= MAX_HAND_SIZE) {
    score -= AI_WEIGHTS.burstFullHandPenalty;
  }

  return score;
}

export function scoreResourcesByUnitCountSpell(
  state: GameState,
  botPlayerId: PlayerId,
  options: {
    relation: "ally" | "enemy" | "any";
    threshold: number;
    resourcesPerThreshold: Partial<Record<ResourceType, number>>;
    roleFilter?: "combat" | "resource" | "utility";
    maxThresholds?: number;
  }
): number {
  const matchingUnits = Object.values(state.entities).filter(
    (entity): entity is UnitEntity =>
      entity.kind === "unit" &&
      (options.relation === "any" ||
        (options.relation === "ally" ? entity.ownerId === botPlayerId : entity.ownerId !== botPlayerId)) &&
      (!options.roleFilter || entity.role === options.roleFilter)
  );

  const thresholdsMet = Math.floor(matchingUnits.length / options.threshold);
  const payoutMultiplier = options.maxThresholds ? Math.min(thresholdsMet, options.maxThresholds) : thresholdsMet;
  if (payoutMultiplier <= 0) {
    return -Infinity;
  }

  let score = matchingUnits.length * 4;
  for (const resource of getResourceOrder()) {
    score += (options.resourcesPerThreshold[resource] ?? 0) * payoutMultiplier * 12;
  }
  score += payoutMultiplier * 18;
  const handSize = state.zones[botPlayerId].hand.length;
  if (handSize <= 4) {
    score += AI_WEIGHTS.burstLowHandBonus;
  }
  return score;
}

export function scoreHexAreaDamageSpell(
  state: GameState,
  botPlayerId: PlayerId,
  targetHex: HexCoord,
  options: {
    amount: number;
    radius: number;
    relation: "ally" | "enemy" | "any";
  }
): number {
  const targets = Object.values(state.entities).filter(
    (entity): entity is UnitEntity =>
      entity.kind === "unit" &&
      hexDistance(entity.coord, targetHex) <= options.radius &&
      (options.relation === "any" ||
        (options.relation === "ally" ? entity.ownerId === botPlayerId : entity.ownerId !== botPlayerId))
  );

  let score = 0;
  let enemyHits = 0;

  for (const unit of targets) {
    const appliedDamage = Math.min(options.amount, unit.hp);
    const kill = options.amount >= unit.hp;
    if (unit.ownerId === botPlayerId) {
      score -= AI_WEIGHTS.friendlyUnitBasePenalty * 0.8;
      score -= appliedDamage * AI_WEIGHTS.friendlyDamagePenaltyMult;
      if (kill) {
        score -= AI_WEIGHTS.friendlyKillPenalty;
      }
    } else {
      enemyHits += 1;
      score += scoreEnemyEntityThreat(state, botPlayerId, unit);
      score += appliedDamage * AI_WEIGHTS.damageAppliedMult;
      if (kill) {
        score += AI_WEIGHTS.damageKillBonus;
      }
    }
  }

  if (enemyHits === 0) {
    return -Infinity;
  }

  return score + enemyHits * AI_WEIGHTS.sweepClusterBonus;
}

export function combineConfiguredSpellScores(scores: number[]): number {
  const meaningfulScores = scores.filter((score) => Number.isFinite(score));
  if (meaningfulScores.length === 0) {
    return -Infinity;
  }
  return meaningfulScores.reduce((sum, score) => sum + score, 0);
}
