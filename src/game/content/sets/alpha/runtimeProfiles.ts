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
];
