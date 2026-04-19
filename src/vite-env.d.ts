/// <reference types="vite/client" />

import type { GameRuntime } from "./game/runtime";

interface ImportMetaEnv {
  readonly VITE_BOOT_FLOW?: "home" | "direct_match";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    electron: {
      versions: Record<string, string>;
    };
    __gameRuntime?: GameRuntime;
    __spaceTraderRuntimeReady?: boolean;
  }
}

export {};
