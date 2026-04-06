import { getCardDefinition } from "./content/cards/catalog";
import { ensureDefaultContentLoaded } from "./content/loader";
import type { Faction, ResourceType, UnitRole } from "./model/enums";
import { DRAW_RESULT_ID, type PlayerId } from "./model/ids";
import type { EntityState, GameState } from "./model/state";
import {
  type PlayerTheme,
  type ResourceTheme,
  type RoleTheme,
  getFactionPresentation,
  getRegisteredResourceTheme,
  getRegisteredUnitRoleTheme,
} from "./registries/presentation";

const DEFAULT_PLAYER_THEME: PlayerTheme = {
  label: "Unassigned",
  primary: "#9db4d8",
  secondary: "#d9e6f5",
  glow: "rgba(157, 180, 216, 0.24)",
  shadow: "rgba(16, 22, 38, 0.95)",
  fillDark: "#152034",
  line: "#d3deef",
};

let activePlayerThemes: Record<PlayerId, PlayerTheme> = {
  player_1: DEFAULT_PLAYER_THEME,
  player_2: DEFAULT_PLAYER_THEME,
};

export function configurePlayerThemes(factions: Partial<Record<PlayerId, Faction>>): void {
  ensureDefaultContentLoaded();
  const factionCounts = new Map<Faction, number>();
  activePlayerThemes = Object.fromEntries(
    Object.entries(factions).flatMap(([playerId, faction]) => {
      if (!faction) {
        return [];
      }
      const presentation = getFactionPresentation(faction);
      const seenCount = factionCounts.get(faction) ?? 0;
      factionCounts.set(faction, seenCount + 1);
      const theme = seenCount === 0 ? presentation.theme : (presentation.mirrorAltTheme ?? presentation.theme);
      return [[playerId, theme] satisfies [PlayerId, PlayerTheme]];
    })
  ) as Record<PlayerId, PlayerTheme>;
}

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
  return activePlayerThemes[playerId] ?? DEFAULT_PLAYER_THEME;
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
  const theme = getPlayerTheme(playerId);
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
  if (playerId === DRAW_RESULT_ID) {
    return "Draw";
  }

  const indexedMatch = /^player_(\d+)$/.exec(playerId);
  if (indexedMatch) {
    return `Player ${indexedMatch[1]}`;
  }

  return formatWords(playerId);
}

export function getResourceTheme(resourceType: ResourceType): ResourceTheme {
  ensureDefaultContentLoaded();
  return getRegisteredResourceTheme(resourceType);
}

export function getUnitRoleTheme(role: UnitRole): RoleTheme {
  ensureDefaultContentLoaded();
  return getRegisteredUnitRoleTheme(role);
}

export function formatFactionName(faction: Faction | "neutral"): string {
  if (faction === "neutral") {
    return "Neutral";
  }
  ensureDefaultContentLoaded();
  return getFactionPresentation(faction).label ?? formatWords(faction);
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
