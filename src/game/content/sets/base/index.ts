import { FRONTIER_BELT_MAP } from "./maps/frontierBelt";
import { BASE_CARD_DEFINITIONS } from "./cards";
import { BASE_STACK_EFFECTS } from "./stackEffects";
import { BASE_STARTER_DECKS } from "./decks";
import { BASE_SET_MECHANICS } from "./mechanics";
import type { CardSet, DeckRecipe } from "../types";
import { BASE_SET_FACTIONS } from "./factions";
import { BASE_SET_RESOURCES } from "./resources";
import { BASE_SET_ROLE_THEMES } from "./presentation";

const BASE_SET_DECK_RECIPES: DeckRecipe[] = [
  {
    id: "base_alloy_starter",
    factionId: "alloy_clan",
    cardIds: [...BASE_STARTER_DECKS.alloy_clan],
  },
  {
    id: "base_flux_starter",
    factionId: "flux_collective",
    cardIds: [...BASE_STARTER_DECKS.flux_collective],
  },
  {
    id: "base_biomass_starter",
    factionId: "biomass_swarm",
    cardIds: [...BASE_STARTER_DECKS.biomass_swarm],
  },
];

export const BASE_SET: CardSet = {
  id: "base",
  name: "Base Set",
  mechanics: BASE_SET_MECHANICS,
  cards: BASE_CARD_DEFINITIONS,
  stackEffects: BASE_STACK_EFFECTS,
  factions: BASE_SET_FACTIONS,
  resources: BASE_SET_RESOURCES,
  deckRecipes: BASE_SET_DECK_RECIPES,
  maps: [
    {
      id: FRONTIER_BELT_MAP.id,
      map: FRONTIER_BELT_MAP,
    },
  ],
  roleThemes: BASE_SET_ROLE_THEMES,
};
