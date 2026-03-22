import { useRef, useSyncExternalStore } from "react";
import { getGameRuntime } from "../game/runtime";

export function useGameSnapshot<T>(readSnapshot: () => T): T {
  const cacheRef = useRef<{ version: number; value: T } | null>(null);
  const runtime = getGameRuntime();

  return useSyncExternalStore(
    (callback) => runtime.subscribe(callback),
    () => {
      const version = runtime.getStateVersion();
      if (cacheRef.current && cacheRef.current.version === version) {
        return cacheRef.current.value;
      }
      const value = readSnapshot();
      cacheRef.current = { version, value };
      return value;
    }
  );
}
