import "../../../presentation";
import { FRONTIER_BELT_MAP } from "../../maps/frontierBelt";
import { BASE_CARD_DEFINITIONS } from "../../cards/catalog";
import { BASE_STACK_EFFECTS } from "../../stackEffects";
import { BASE_STARTER_DECKS } from "../../decks/starterDecks";
import { getUnitRoleTheme } from "../../../presentation";
import { registerCardSet, registerFactionModule, registerMap, registerResourceModule } from "../../registry";
import type { CardSet, DeckRecipe } from "../types";
import { BASE_SET_FACTIONS } from "./factions";
import { BASE_SET_RESOURCES } from "./resources";

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
  roleThemes: {
    combat: getUnitRoleTheme("combat"),
    resource: getUnitRoleTheme("resource"),
    utility: getUnitRoleTheme("utility"),
  },
};

registerCardSet(BASE_SET);
for (const faction of BASE_SET_FACTIONS) {
  registerFactionModule(faction);
}
for (const resource of BASE_SET_RESOURCES) {
  registerResourceModule(resource);
}
registerMap("base", FRONTIER_BELT_MAP);
