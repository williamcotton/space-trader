import type { RuntimeProfile } from "../types";

export const BASE_RUNTIME_PROFILES: RuntimeProfile[] = [
  {
    id: "base_default",
    label: "Base Default",
    defaultMapId: "frontier_belt",
    defaultFactions: {
      player_1: "alloy_clan",
      player_2: "flux_collective",
    },
    matchIdPrefix: "base",
    default: true,
  },
];
