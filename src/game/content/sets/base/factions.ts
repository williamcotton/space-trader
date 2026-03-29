import "../../../presentation";
import type { FactionModule } from "../types";
import { getFactionPresentation } from "../../../registries/presentation";

export const BASE_SET_FACTIONS: FactionModule[] = [
  {
    id: "alloy_clan",
    label: "Alloy Clan",
    primaryResourceId: "alloy",
    mechanics: ["salvage", "bastion"],
    theme: getFactionPresentation("alloy_clan").theme,
    mirrorAltTheme: getFactionPresentation("alloy_clan").mirrorAltTheme,
  },
  {
    id: "flux_collective",
    label: "Flux Collective",
    primaryResourceId: "flux",
    mechanics: ["relay", "surge"],
    theme: getFactionPresentation("flux_collective").theme,
    mirrorAltTheme: getFactionPresentation("flux_collective").mirrorAltTheme,
  },
  {
    id: "biomass_swarm",
    label: "Biomass Swarm",
    primaryResourceId: "biomass",
    mechanics: ["sprout", "bloom"],
    theme: getFactionPresentation("biomass_swarm").theme,
    mirrorAltTheme: getFactionPresentation("biomass_swarm").mirrorAltTheme,
  },
];
