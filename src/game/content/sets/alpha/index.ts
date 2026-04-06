import { FRONTIER_BELT_MAP } from "./maps/frontierBelt";
import { FRONTIER_CROSSROADS_MAP } from "./maps/frontierCrossroads";
import { ALPHA_CARD_DEFINITIONS } from "./cards";
import { ALPHA_STACK_EFFECTS } from "./stackEffects";
import { ALPHA_STARTER_DECKS } from "./decks";
import { ALPHA_SET_MECHANICS } from "./mechanics";
import type { CardSet, DeckRecipe } from "../types";
import { ALPHA_SET_FACTIONS } from "./factions";
import { ALPHA_SET_RESOURCES } from "./resources";
import { ALPHA_SET_ROLE_THEMES } from "./presentation";
import { ALPHA_RUNTIME_INSTALLER } from "./installers/runtime";
import { ALPHA_RUNTIME_PROFILES } from "./runtimeProfiles";

const ALPHA_SET_DECK_RECIPES: DeckRecipe[] = [
  {
    id: "alpha_alloy_starter",
    factionId: "alloy_clan",
    cardIds: [...ALPHA_STARTER_DECKS.alloy_clan],
  },
  {
    id: "alpha_flux_starter",
    factionId: "flux_collective",
    cardIds: [...ALPHA_STARTER_DECKS.flux_collective],
  },
  {
    id: "alpha_biomass_starter",
    factionId: "biomass_swarm",
    cardIds: [...ALPHA_STARTER_DECKS.biomass_swarm],
  },
];

export const ALPHA_SET: CardSet = {
  id: "alpha",
  name: "Alpha",
  dependencies: ["foundation"],
  mechanics: ALPHA_SET_MECHANICS,
  installers: [ALPHA_RUNTIME_INSTALLER],
  cards: ALPHA_CARD_DEFINITIONS,
  stackEffects: ALPHA_STACK_EFFECTS,
  factions: ALPHA_SET_FACTIONS,
  resources: ALPHA_SET_RESOURCES,
  runtimeProfiles: ALPHA_RUNTIME_PROFILES,
  deckRecipes: ALPHA_SET_DECK_RECIPES,
  maps: [
    {
      id: FRONTIER_BELT_MAP.id,
      map: FRONTIER_BELT_MAP,
    },
    {
      id: FRONTIER_CROSSROADS_MAP.id,
      map: FRONTIER_CROSSROADS_MAP,
    },
  ],
  roleThemes: ALPHA_SET_ROLE_THEMES,
};
