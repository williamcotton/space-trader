import type { CardSet } from "../game/content/sets/types";
import { FRONTIER_BELT_MAP } from "../game/content/sets/base/maps/frontierBelt";
import { BASE_STARTER_DECKS } from "../game/content/sets/base/decks";

const TEST_EXPANSION_MAP = {
  ...FRONTIER_BELT_MAP,
  id: "test_expansion_frontier",
  name: "Test Expansion Frontier",
  resourceNodes: FRONTIER_BELT_MAP.resourceNodes.map((node) => ({ ...node })),
};

export const TEST_EXPANSION_SET: CardSet = {
  id: "test_expansion",
  name: "Test Expansion",
  dependencies: ["base"],
  resources: [
    {
      id: "crystal",
      label: "Crystal",
      shortLabel: "CR",
      color: "#6ce2ff",
      glow: "rgba(108, 226, 255, 0.32)",
      kind: "primary",
      displayOrder: 4,
      glyph: {
        shapes: [
          {
            type: "polygon",
            points: "12,2 20,12 12,22 4,12",
            fill: "currentColor",
          },
        ],
      },
    },
  ],
  factions: [
    {
      id: "crystal_clan",
      label: "Crystal Clan",
      primaryResourceId: "crystal",
      mechanics: [],
      theme: {
        label: "Crystal Clan",
        primary: "#63e7ff",
        secondary: "#d7fbff",
        glow: "rgba(99, 231, 255, 0.26)",
        shadow: "rgba(7, 20, 31, 0.94)",
        fillDark: "#10263a",
        line: "#dcfbff",
      },
      mirrorAltTheme: {
        label: "Crystal Clan Mirror",
        primary: "#8aeeff",
        secondary: "#effcff",
        glow: "rgba(138, 238, 255, 0.26)",
        shadow: "rgba(7, 20, 31, 0.94)",
        fillDark: "#163145",
        line: "#effcff",
      },
      animationAccent: "crystal_clan",
      startingCombatUnitCardId: "frontline_scout_card",
      startingResourceUnitCardId: "expedition_harvester_card",
    },
  ],
  cards: {
    expansion_probe_card: {
      id: "expansion_probe_card",
      kind: "tactic",
      name: "Expansion Probe",
      faction: "crystal_clan",
      speed: "instant",
      cost: { credits: 1 },
      text: "Deal 2 damage to enemy base.",
      play: {
        stackEffectId: "damage_enemy_base_2",
        targetMode: "none",
        sourceDestinationOnResolve: "discard",
      },
    },
  },
  deckRecipes: [
    {
      id: "test_expansion_crystal_starter",
      factionId: "crystal_clan",
      cardIds: [...BASE_STARTER_DECKS.alloy_clan],
    },
  ],
  maps: [
    {
      id: TEST_EXPANSION_MAP.id,
      map: TEST_EXPANSION_MAP,
    },
  ],
  runtimeProfiles: [
    {
      id: "test_expansion_profile",
      label: "Test Expansion Profile",
      defaultMapId: TEST_EXPANSION_MAP.id,
      defaultFactions: {
        player_1: "crystal_clan",
        player_2: "flux_collective",
      },
      matchIdPrefix: "test_expansion",
    },
  ],
};
