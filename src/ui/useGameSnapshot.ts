import { useCallback, useRef, useSyncExternalStore } from "react";
import { getGameRuntime } from "../game/runtime";

export function useGameSnapshot<T>(readSnapshot: () => T): T {
  const cacheRef = useRef<{ version: number; value: T } | null>(null);
  const runtime = getGameRuntime();

  const subscribe = useCallback(
    (callback: () => void) => runtime.subscribe(callback),
    [runtime]
  );

  return useSyncExternalStore(
    subscribe,
    () => {
      const version = runtime.getStateVersion();
      if (cacheRef.current && cacheRef.current.version === version) {
        return cacheRef.current.value;
      }
      const value = readSnapshot();
      // Preserve reference identity when the structural value hasn't changed,
      // so React skips re-renders for consumers whose slice is unchanged.
      if (cacheRef.current && JSON.stringify(cacheRef.current.value) === JSON.stringify(value)) {
        cacheRef.current.version = version;
        return cacheRef.current.value;
      }
      cacheRef.current = { version, value };
      return value;
    }
  );
}
