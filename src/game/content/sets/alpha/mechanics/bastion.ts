import { hexDistance } from "../../../../model/hex";
import { registerUnitStatHook } from "../../../../registries/unitStatHooks";
import { BASTION_KEYWORD } from "./keywordIds";

export function installBastionMechanic(): void {
  registerUnitStatHook("bastion_adjacent_armor", (state, unit, stat, context) => {
    if (stat !== "armor" || !context.keywords.includes(BASTION_KEYWORD)) {
      return 0;
    }

    const hasAdjacentAlly = Object.values(state.entities).some((entity) =>
      entity.kind === "unit" &&
      entity.ownerId === unit.ownerId &&
      entity.id !== unit.id &&
      hexDistance(entity.coord, unit.coord) === 1
    );

    return hasAdjacentAlly ? 1 : 0;
  });
}
