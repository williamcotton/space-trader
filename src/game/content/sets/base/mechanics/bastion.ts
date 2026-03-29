import { hexDistance } from "../../../../model/hex";
import { registerUnitStatHook } from "../../../../registries/unitStatHooks";
import { BASTION_KEYWORD, unitHasActiveKeyword } from "../../../../systems/keywords";

let installed = false;

export function installBastionMechanic(): void {
  if (installed) {
    return;
  }
  installed = true;

  registerUnitStatHook("bastion_adjacent_armor", (state, unit, stat) => {
    if (stat !== "armor" || !unitHasActiveKeyword(state, unit, BASTION_KEYWORD)) {
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
