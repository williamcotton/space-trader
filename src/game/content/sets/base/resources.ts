import "../../../presentation";
import type { ResourceModule } from "../types";
import { getRegisteredResourceTheme } from "../../../registries/presentation";

export const BASE_SET_RESOURCES: ResourceModule[] = [
  {
    id: "credits",
    label: getRegisteredResourceTheme("credits").label,
    shortLabel: getRegisteredResourceTheme("credits").shortLabel,
    color: getRegisteredResourceTheme("credits").color,
    glow: getRegisteredResourceTheme("credits").glow,
  },
  {
    id: "alloy",
    label: getRegisteredResourceTheme("alloy").label,
    shortLabel: getRegisteredResourceTheme("alloy").shortLabel,
    color: getRegisteredResourceTheme("alloy").color,
    glow: getRegisteredResourceTheme("alloy").glow,
  },
  {
    id: "flux",
    label: getRegisteredResourceTheme("flux").label,
    shortLabel: getRegisteredResourceTheme("flux").shortLabel,
    color: getRegisteredResourceTheme("flux").color,
    glow: getRegisteredResourceTheme("flux").glow,
  },
  {
    id: "biomass",
    label: getRegisteredResourceTheme("biomass").label,
    shortLabel: getRegisteredResourceTheme("biomass").shortLabel,
    color: getRegisteredResourceTheme("biomass").color,
    glow: getRegisteredResourceTheme("biomass").glow,
  },
];
