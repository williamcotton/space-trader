import { useCallback, useRef, useSyncExternalStore } from "react";
import isEqual from "fast-deep-equal";
import { getGameRuntime } from "../game/runtime";

export function useRuntimeViewSnapshot<T>(readSnapshot: () => T): T {
  const cacheRef = useRef<{ version: string; value: T } | null>(null);
  const runtime = getGameRuntime();

  const subscribe = useCallback(
    (callback: () => void) => {
      const unsubscribeState = runtime.subscribe(callback);
      const unsubscribeTransient = runtime.subscribeTransient(callback);
      return () => {
        unsubscribeTransient();
        unsubscribeState();
      };
    },
    [runtime]
  );

  return useSyncExternalStore(
    subscribe,
    () => {
      const version = `${runtime.getStateVersion()}:${runtime.getTransientVersion()}`;
      if (cacheRef.current && cacheRef.current.version === version) {
        return cacheRef.current.value;
      }
      const value = readSnapshot();
      if (cacheRef.current && isEqual(cacheRef.current.value, value)) {
        cacheRef.current.version = version;
        return cacheRef.current.value;
      }
      cacheRef.current = { version, value };
      return value;
    }
  );
}
