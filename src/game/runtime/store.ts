import { createEmptyDerivedState, rebuildDerivedState, type DerivedState } from "../derived";
import type { GameState } from "../model/state";

export class RuntimeStore {
  private listeners: Set<() => void> = new Set();
  private transientListeners: Set<() => void> = new Set();
  private stateVersion = 0;
  private transientVersion = 0;
  private derivedState: DerivedState = createEmptyDerivedState();

  rehydrate(): void {
    if (!this.listeners) {
      this.listeners = new Set();
    }
    if (!this.transientListeners) {
      this.transientListeners = new Set();
    }
    if (typeof this.stateVersion !== "number") {
      this.stateVersion = 0;
    }
    if (typeof this.transientVersion !== "number") {
      this.transientVersion = 0;
    }
    if (!this.derivedState || typeof this.derivedState.sourceVersion !== "number") {
      this.derivedState = createEmptyDerivedState();
    }
  }

  resetDerivedState(): void {
    this.derivedState = createEmptyDerivedState();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeTransient(listener: () => void): () => void {
    this.transientListeners.add(listener);
    return () => this.transientListeners.delete(listener);
  }

  getStateVersion(): number {
    return this.stateVersion;
  }

  getTransientVersion(): number {
    return this.transientVersion;
  }

  notifyStateChanged(): void {
    this.stateVersion++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  notifyTransientChanged(): void {
    this.transientVersion++;
    for (const listener of this.transientListeners) {
      listener();
    }
  }

  getDerivedState(state: GameState): DerivedState {
    if (this.stateVersion > this.derivedState.sourceVersion) {
      this.derivedState = rebuildDerivedState(state, this.stateVersion);
    }
    return this.derivedState;
  }

  dispose(): void {
    this.listeners.clear();
    this.transientListeners.clear();
  }
}
