export type RuntimeWindowBinding = {
  getDevControls(): unknown;
};

export type RuntimeHotData<T> = {
  runtime?: T;
};

export function bindRuntimeToWindow<T extends RuntimeWindowBinding>(instance: T | undefined): void {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  if (instance) {
    window.__gameRuntime = instance as never;
    window.__gameRuntimeDevControls = instance.getDevControls() as never;
    return;
  }

  delete window.__gameRuntime;
  delete window.__gameRuntimeDevControls;
  window.__spaceTraderRuntimeReady = false;
}
