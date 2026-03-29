import type { FactionModule } from "../types";

const ALLOY_THEME = {
  label: "Alloy Clan",
  primary: "#b7c9de",
  secondary: "#e0eaf6",
  glow: "rgba(183, 201, 222, 0.28)",
  shadow: "rgba(20, 28, 42, 0.95)",
  fillDark: "#1a2436",
  line: "#d0dded",
} as const;

const ALLOY_MIRROR_THEME = {
  label: "Alloy Clan",
  primary: "#d4a86a",
  secondary: "#f0d4a0",
  glow: "rgba(212, 168, 106, 0.28)",
  shadow: "rgba(42, 30, 16, 0.95)",
  fillDark: "#2e2010",
  line: "#e8c896",
} as const;

const FLUX_THEME = {
  label: "Flux Collective",
  primary: "#6ea8ff",
  secondary: "#a0c8ff",
  glow: "rgba(110, 168, 255, 0.28)",
  shadow: "rgba(14, 24, 52, 0.95)",
  fillDark: "#0f1a3a",
  line: "#97c4ff",
} as const;

const FLUX_MIRROR_THEME = {
  label: "Flux Collective",
  primary: "#c084ff",
  secondary: "#dab4ff",
  glow: "rgba(192, 132, 255, 0.28)",
  shadow: "rgba(30, 16, 52, 0.95)",
  fillDark: "#1e1038",
  line: "#d4a8ff",
} as const;

const BIOMASS_THEME = {
  label: "Biomass Swarm",
  primary: "#5fe38f",
  secondary: "#a4f4c0",
  glow: "rgba(95, 227, 143, 0.28)",
  shadow: "rgba(12, 38, 22, 0.95)",
  fillDark: "#0e2816",
  line: "#8af0aa",
} as const;

const BIOMASS_MIRROR_THEME = {
  label: "Biomass Swarm",
  primary: "#e8d44e",
  secondary: "#f4eea0",
  glow: "rgba(232, 212, 78, 0.28)",
  shadow: "rgba(40, 36, 12, 0.95)",
  fillDark: "#28240e",
  line: "#f0e078",
} as const;

export const BASE_SET_FACTIONS: FactionModule[] = [
  {
    id: "alloy_clan",
    label: "Alloy Clan",
    primaryResourceId: "alloy",
    mechanics: ["salvage", "bastion"],
    theme: ALLOY_THEME,
    mirrorAltTheme: ALLOY_MIRROR_THEME,
    animationAccent: "alloy_clan",
    startingCombatUnitCardId: "frontline_scout_card",
    startingResourceUnitCardId: "expedition_harvester_card",
    startingResourceUnitOverrides: {
      hp: 5,
    },
  },
  {
    id: "flux_collective",
    label: "Flux Collective",
    primaryResourceId: "flux",
    mechanics: ["relay", "surge"],
    theme: FLUX_THEME,
    mirrorAltTheme: FLUX_MIRROR_THEME,
    animationAccent: "flux_collective",
    startingCombatUnitCardId: "flux_runner_card",
    startingResourceUnitCardId: "expedition_harvester_card",
    startingResourceUnitOverrides: {
      hp: 5,
    },
  },
  {
    id: "biomass_swarm",
    label: "Biomass Swarm",
    primaryResourceId: "biomass",
    mechanics: ["sprout", "bloom"],
    theme: BIOMASS_THEME,
    mirrorAltTheme: BIOMASS_MIRROR_THEME,
    animationAccent: "biomass_swarm",
    startingCombatUnitCardId: "pathfinder_buggy_card",
    startingResourceUnitCardId: "expedition_harvester_card",
    startingResourceUnitOverrides: {
      hp: 5,
    },
  },
];
