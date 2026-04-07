import type { RuntimeProfile } from "../types";

export const ALPHA_RUNTIME_PROFILES: RuntimeProfile[] = [
  {
    id: "alpha_default",
    label: "Alpha Default",
    defaultMapId: "frontier_belt",
    defaultFactions: {
      player_1: "alloy_clan",
      player_2: "flux_collective",
    },
    matchIdPrefix: "alpha",
    default: true,
  },
  {
    id: "alpha_three_player",
    label: "Alpha Three-Player FFA",
    defaultMapId: "frontier_triad",
    defaultFactions: {
      player_1: "alloy_clan",
      player_2: "flux_collective",
      player_3: "biomass_swarm",
    },
    matchIdPrefix: "alpha_3p",
  },
  {
    id: "alpha_four_player",
    label: "Alpha Free-For-All",
    defaultMapId: "frontier_crossroads",
    defaultFactions: {
      player_1: "alloy_clan",
      player_2: "flux_collective",
      player_3: "biomass_swarm",
      player_4: "alloy_clan",
    },
    matchIdPrefix: "alpha_ffa",
  },
];
