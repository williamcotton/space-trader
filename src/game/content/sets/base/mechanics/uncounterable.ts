import { cardHasKeyword } from "../../../cards/catalog";
import { registerCardCounterabilityHook } from "../../../../registries/cardCounterability";
import { UNCOUNTERABLE_KEYWORD } from "../../../../systems/keywords";

let installed = false;

export function installUncounterableMechanic(): void {
  if (installed) {
    return;
  }
  installed = true;

  registerCardCounterabilityHook("uncounterable_keyword", (card, _stackEffect, defaultCounterable) =>
    defaultCounterable && !cardHasKeyword(card, UNCOUNTERABLE_KEYWORD)
  );
}
