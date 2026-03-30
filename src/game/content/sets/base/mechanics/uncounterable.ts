import { cardHasKeyword } from "../../../cards/catalog";
import { registerCardCounterabilityHook } from "../../../../registries/cardCounterability";
import { UNCOUNTERABLE_KEYWORD } from "./keywordIds";

export function installUncounterableMechanic(): void {
  registerCardCounterabilityHook("uncounterable_keyword", (card, _stackEffect, defaultCounterable) =>
    defaultCounterable && !cardHasKeyword(card, UNCOUNTERABLE_KEYWORD)
  );
}
