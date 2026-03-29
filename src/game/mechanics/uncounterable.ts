import { cardHasKeyword } from "../content/cards/catalog";
import { registerCardCounterabilityHook } from "../registries/cardCounterability";
import { UNCOUNTERABLE_KEYWORD } from "../systems/keywords";

registerCardCounterabilityHook("uncounterable_keyword", (card, _stackEffect, defaultCounterable) =>
  defaultCounterable && !cardHasKeyword(card, UNCOUNTERABLE_KEYWORD)
);
