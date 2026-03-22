import { getCardDefinition } from "../content/cards/catalog";
import { hexDistance } from "../model/hex";
import type { GameState, UnitEntity } from "../model/state";

function isAdjacent(unit: UnitEntity, other: UnitEntity): boolean {
  return hexDistance(unit.coord, other.coord) === 1;
}

export function getAuraAttackBonus(state: GameState, targetUnit: UnitEntity): number {
  return Object.values(state.entities).reduce((totalBonus, entity) => {
    if (entity.kind !== "unit" || entity.id === targetUnit.id || entity.ownerId !== targetUnit.ownerId || !isAdjacent(targetUnit, entity)) {
      return totalBonus;
    }

    const cardDef = entity.sourceCardId ? getCardDefinition(entity.sourceCardId) : null;
    if (cardDef?.kind === "unit" && cardDef.unit.auras) {
      for (const aura of cardDef.unit.auras) {
        if (aura.type === "adjacent_ally_buff" && (!aura.targetRole || aura.targetRole === targetUnit.role)) {
          totalBonus += aura.attackBonus ?? 0;
        }
      }
    }
    return totalBonus;
  }, 0);
}

export function getAuraArmorBonus(state: GameState, targetUnit: UnitEntity): number {
  return Object.values(state.entities).reduce((totalBonus, entity) => {
    if (entity.kind !== "unit" || entity.id === targetUnit.id || entity.ownerId !== targetUnit.ownerId || !isAdjacent(targetUnit, entity)) {
      return totalBonus;
    }

    const cardDef = entity.sourceCardId ? getCardDefinition(entity.sourceCardId) : null;
    if (cardDef?.kind === "unit" && cardDef.unit.auras) {
      for (const aura of cardDef.unit.auras) {
        if (aura.type === "adjacent_ally_buff" && (!aura.targetRole || aura.targetRole === targetUnit.role)) {
          totalBonus += aura.armorBonus ?? 0;
        }
      }
    }
    return totalBonus;
  }, 0);
}

export function getEffectiveUnitAttackDamage(state: GameState, unit: UnitEntity): number {
  return unit.attackDamage + unit.temporaryAttackBonus + getAuraAttackBonus(state, unit);
}

export function getEffectiveUnitArmor(state: GameState, unit: UnitEntity): number {
  return unit.armor + unit.temporaryArmorBonus + getAuraArmorBonus(state, unit);
}

export function clearTemporaryUnitModifiers(state: GameState): void {
  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "unit") {
      continue;
    }

    entity.temporaryAttackBonus = 0;
    entity.temporaryArmorBonus = 0;
  }
}
