import type { AppBootConfig, AppBootFlow, AppScreen } from "./types";

function normalizeBootFlow(value: string | undefined): AppBootFlow | null {
  if (value === "home" || value === "direct_match") {
    return value;
  }
  return null;
}

export function getRequestedBootFlow(): AppBootFlow | null {
  return normalizeBootFlow(import.meta.env.VITE_BOOT_FLOW);
}

export function getAppBootConfig(options?: {
  launchScreensEnabled?: boolean;
  defaultFlow?: AppBootFlow;
}): AppBootConfig {
  const launchScreensEnabled = options?.launchScreensEnabled ?? false;
  const requestedFlow = getRequestedBootFlow();
  const defaultFlow = options?.defaultFlow ?? (launchScreensEnabled ? "home" : "direct_match");
  const desiredFlow = requestedFlow ?? defaultFlow;
  const resolvedFlow = desiredFlow === "home" && !launchScreensEnabled ? "direct_match" : desiredFlow;
  const initialScreen: AppScreen = resolvedFlow === "home" ? { kind: "home" } : { kind: "match" };

  return {
    requestedFlow,
    resolvedFlow,
    initialScreen,
  };
}
