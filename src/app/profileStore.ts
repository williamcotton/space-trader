import type { Faction } from "../game/model/enums";

export type AppProfile = {
  callsign: string | null;
  completedFirstRun: boolean;
  lastLocalFaction: Faction | null;
};

export const APP_PROFILE_STORAGE_KEY = "space_trader_profile";

const DEFAULT_PROFILE: AppProfile = {
  callsign: null,
  completedFirstRun: false,
  lastLocalFaction: null,
};

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalFaction(value: unknown): Faction | null {
  return typeof value === "string" && value.trim().length > 0 ? (value as Faction) : null;
}

function sanitizeProfile(value: unknown): AppProfile {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PROFILE };
  }

  const record = value as Record<string, unknown>;
  return {
    callsign: normalizeOptionalString(record.callsign),
    completedFirstRun: Boolean(record.completedFirstRun),
    lastLocalFaction: normalizeOptionalFaction(record.lastLocalFaction),
  };
}

export function readProfile(): AppProfile {
  if (!canUseLocalStorage()) {
    return { ...DEFAULT_PROFILE };
  }

  const raw = window.localStorage.getItem(APP_PROFILE_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_PROFILE };
  }

  try {
    return sanitizeProfile(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function writeProfile(profile: AppProfile): AppProfile {
  const sanitized = sanitizeProfile(profile);
  if (canUseLocalStorage()) {
    window.localStorage.setItem(APP_PROFILE_STORAGE_KEY, JSON.stringify(sanitized));
  }
  return sanitized;
}

export function updateProfile(updates: Partial<AppProfile>): AppProfile {
  return writeProfile({
    ...readProfile(),
    ...updates,
  });
}

export function setProfileCallsign(callsign: string | null): AppProfile {
  return updateProfile({
    callsign: normalizeOptionalString(callsign),
  });
}

export function setProfileFirstRunCompleted(completedFirstRun = true): AppProfile {
  return updateProfile({ completedFirstRun });
}

export function setLastLocalFaction(faction: Faction | null): AppProfile {
  return updateProfile({
    lastLocalFaction: normalizeOptionalFaction(faction),
  });
}
