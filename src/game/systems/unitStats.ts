import { hexDistance } from "../model/hex";
import type { GameState, UnitEntity } from "../model/state";

function isAdjacent(unit: UnitEntity, other: UnitEntity): boolean {
  return hexDistance(unit.coord, other.coord) === 1;
}

export function getForgeCaptainAttackAuraBonus(state: GameState, unit: UnitEntity): number {
  if (unit.role !== "combat") {
    return 0;
  }

  return Object.values(state.entities).reduce((bonus, entity) => {
    if (
      entity.kind !== "unit" ||
      entity.id === unit.id ||
      entity.ownerId !== unit.ownerId ||
      entity.sourceCardId !== "forge_captain_card" ||
      !isAdjacent(unit, entity)
    ) {
      return bonus;
    }

    return bonus + 1;
  }, 0);
}

export function getEffectiveUnitAttackDamage(state: GameState, unit: UnitEntity): number {
  return unit.attackDamage + unit.temporaryAttackBonus + getForgeCaptainAttackAuraBonus(state, unit);
}

export function getEffectiveUnitArmor(_state: GameState, unit: UnitEntity): number {
  return unit.armor + unit.temporaryArmorBonus;
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
