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

const FACTION_THEMES: Record<Faction, PlayerTheme> = {
  alloy_clan: {
    label: "Alloy Clan",
    primary: "#b7c9de",
    secondary: "#e0eaf6",
    glow: "rgba(183, 201, 222, 0.28)",
    shadow: "rgba(20, 28, 42, 0.95)",
    fillDark: "#1a2436",
    line: "#d0dded",
  },
  flux_collective: {
    label: "Flux Collective",
    primary: "#6ea8ff",
    secondary: "#a0c8ff",
    glow: "rgba(110, 168, 255, 0.28)",
    shadow: "rgba(14, 24, 52, 0.95)",
    fillDark: "#0f1a3a",
    line: "#97c4ff",
  },
  biomass_swarm: {
    label: "Biomass Swarm",
    primary: "#5fe38f",
    secondary: "#a4f4c0",
    glow: "rgba(95, 227, 143, 0.28)",
    shadow: "rgba(12, 38, 22, 0.95)",
    fillDark: "#0e2816",
    line: "#8af0aa",
  },
};

const FACTION_ALT_THEMES: Record<Faction, PlayerTheme> = {
  alloy_clan: {
    label: "Alloy Clan",
    primary: "#d4a86a",
    secondary: "#f0d4a0",
    glow: "rgba(212, 168, 106, 0.28)",
    shadow: "rgba(42, 30, 16, 0.95)",
    fillDark: "#2e2010",
    line: "#e8c896",
  },
  flux_collective: {
    label: "Flux Collective",
    primary: "#c084ff",
    secondary: "#dab4ff",
    glow: "rgba(192, 132, 255, 0.28)",
    shadow: "rgba(30, 16, 52, 0.95)",
    fillDark: "#1e1038",
    line: "#d4a8ff",
  },
  biomass_swarm: {
    label: "Biomass Swarm",
    primary: "#e8d44e",
    secondary: "#f4eea0",
    glow: "rgba(232, 212, 78, 0.28)",
    shadow: "rgba(40, 36, 12, 0.95)",
    fillDark: "#28240e",
    line: "#f0e078",
  },
};

let activePlayerThemes: Record<PlayerId, PlayerTheme> = {
  player_1: FACTION_THEMES.alloy_clan,
  player_2: FACTION_THEMES.flux_collective,
};

export function configurePlayerThemes(factions: Record<PlayerId, Faction>): void {
  const sameFaction = factions.player_1 === factions.player_2;
  activePlayerThemes = {
    player_1: FACTION_THEMES[factions.player_1],
    player_2: sameFaction
      ? FACTION_ALT_THEMES[factions.player_2]
      : FACTION_THEMES[factions.player_2],
  };
}

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
  return activePlayerThemes[playerId];
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
}

export type PlayerAnimationPalette = {
  stroke: string;
  fill: string;
  glow: string;
};

export function getPlayerAnimationPalette(playerId: PlayerId): PlayerAnimationPalette {
  const theme = activePlayerThemes[playerId];
  const primaryRgb = hexToRgb(theme.primary);
  const lineRgb = hexToRgb(theme.line);
  const secondaryRgb = hexToRgb(theme.secondary);
  return {
    stroke: primaryRgb,
    fill: lineRgb,
    glow: secondaryRgb,
  };
}

export function getPlayerLabel(playerId: PlayerId): string {
  return playerId === "player_1" ? "Player 1" : "Player 2";
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
