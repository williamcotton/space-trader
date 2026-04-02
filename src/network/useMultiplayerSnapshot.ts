import { useCallback, useSyncExternalStore } from "react";
import { getMultiplayerClient, type MultiplayerSnapshot } from "./client";

export function useMultiplayerSnapshot(): MultiplayerSnapshot {
  const client = getMultiplayerClient();
  const subscribe = useCallback((listener: () => void) => client.subscribe(listener), [client]);
  return useSyncExternalStore(subscribe, () => client.getSnapshot());
}
