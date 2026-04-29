/// <reference types="vite/client" />

import type { GameRuntime } from "./game/runtime";
import type { RuntimeDevControls } from "./game/runtime/devControls";

interface ImportMetaEnv {
  readonly VITE_BOOT_FLOW?: "home" | "direct_match";
  readonly VITE_ENABLE_DEVELOPER_CONTROLS?: "true" | "false";
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
    __gameRuntimeDevControls?: RuntimeDevControls;
    __spaceTraderRuntimeReady?: boolean;
    __spaceTraderRendererSettled?: boolean;
  }
}

export {};
