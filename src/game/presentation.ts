import { getCardDefinition } from "./content/cards/catalog";
import type { Faction, ResourceType, UnitRole } from "./model/enums";
import type { PlayerId } from "./model/ids";
import type { EntityState, GameState } from "./model/state";

type PlayerTheme = {
  label: string;
  primary: string;
  secondary: string;
  glow: string;
  shadow: string;
  fillDark: string;
  line: string;
};

type ResourceTheme = {
  label: string;
  shortLabel: string;
  color: string;
  glow: string;
};

type RoleTheme = {
  label: string;
  accent: string;
};

const PLAYER_THEMES: Record<PlayerId, PlayerTheme> = {
  player_1: {
    label: "Player 1",
    primary: "#63d5ff",
    secondary: "#89f4ca",
    glow: "rgba(99, 213, 255, 0.28)",
    shadow: "rgba(13, 32, 52, 0.95)",
    fillDark: "#10284e",
    line: "#9ae8ff",
  },
  player_2: {
    label: "Player 2",
    primary: "#ff9969",
    secondary: "#ffd36d",
    glow: "rgba(255, 153, 105, 0.28)",
    shadow: "rgba(56, 25, 17, 0.95)",
    fillDark: "#472113",
    line: "#ffd0b7",
  },
};

const RESOURCE_THEMES: Record<ResourceType, ResourceTheme> = {
  credits: {
    label: "Credits",
    shortLabel: "C",
    color: "#e8f15e",
    glow: "rgba(232, 241, 94, 0.28)",
  },
  alloy: {
    label: "Alloy",
    shortLabel: "A",
    color: "#b7c2d1",
    glow: "rgba(183, 194, 209, 0.24)",
  },
  flux: {
    label: "Flux",
    shortLabel: "F",
    color: "#6ea8ff",
    glow: "rgba(110, 168, 255, 0.26)",
  },
  biomass: {
    label: "Biomass",
    shortLabel: "B",
    color: "#5fe38f",
    glow: "rgba(95, 227, 143, 0.24)",
  },
};

const ROLE_THEMES: Record<UnitRole, RoleTheme> = {
  combat: {
    label: "Combat",
    accent: "#ff9680",
  },
  resource: {
    label: "Resource",
    accent: "#8ff2be",
  },
  utility: {
    label: "Utility",
    accent: "#d5b4ff",
  },
};

const ROLE_FALLBACK_NAMES: Record<UnitRole, string> = {
  combat: "Combat Unit",
  resource: "Resource Unit",
  utility: "Utility Unit",
};

function formatWords(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getPlayerTheme(playerId: PlayerId): PlayerTheme {
  return PLAYER_THEMES[playerId];
}

export function getPlayerLabel(playerId: PlayerId): string {
  return PLAYER_THEMES[playerId].label;
}

export function getResourceTheme(resourceType: ResourceType): ResourceTheme {
  return RESOURCE_THEMES[resourceType];
}

export function getUnitRoleTheme(role: UnitRole): RoleTheme {
  return ROLE_THEMES[role];
}

export function formatFactionName(faction: Faction | "neutral"): string {
  if (faction === "neutral") {
    return "Neutral";
  }
  return formatWords(faction);
}

export function ensureEntityPresentation(entity: EntityState, _state: Pick<GameState, "players">): void {
  if (!entity.name) {
    if (entity.kind === "base") {
      entity.name = `${getPlayerLabel(entity.ownerId)} Base`;
      return;
    }

    if (entity.sourceCardId) {
      const card = getCardDefinition(entity.sourceCardId);
      if (card?.kind === "unit") {
        entity.name = card.name;
        return;
      }
    }

    entity.name = ROLE_FALLBACK_NAMES[entity.role] ?? "Unit";
  }
}

export function getEntityDisplayName(entity: EntityState, _state: Pick<GameState, "players">): string {
  if (entity.name) {
    return entity.name;
  }

  if (entity.kind === "base") {
    return `${getPlayerLabel(entity.ownerId)} Base`;
  }

  if (entity.sourceCardId) {
    const card = getCardDefinition(entity.sourceCardId);
    if (card?.kind === "unit") {
      return card.name;
    }
  }

  return ROLE_FALLBACK_NAMES[entity.role] ?? "Unit";
}
