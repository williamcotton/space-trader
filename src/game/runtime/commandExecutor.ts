import type { GameCommand } from "../actions/commands";
import { dispatchCommand, type DispatchResult } from "../actions/reducers";
import type { GameState } from "../model/state";
import { buildAnimationsFromEvents, captureAnimationSnapshot } from "../render/animations";
import type { CanvasAnimation } from "../types";
import type { RuntimeDispatchOptions } from "./types";

export type RuntimeCommandExecutorHost = {
  state: GameState;
  pushAnimations(animations: CanvasAnimation[]): void;
  syncPendingAttackTargeting(): void;
  notifyStateChanged(): void;
  scheduleAutomationFromCurrentState(): void;
};

export class RuntimeCommandExecutor {
  constructor(private readonly host: RuntimeCommandExecutorHost) {}

  dispatchLocal(command: GameCommand, options?: RuntimeDispatchOptions): DispatchResult {
    const before = captureAnimationSnapshot(this.host.state);
    const result = dispatchCommand(this.host.state, command);
    this.host.syncPendingAttackTargeting();
    if (result.ok && result.events.length > 0 && options?.animate !== false) {
      this.host.pushAnimations(buildAnimationsFromEvents(result.events, before, this.host.state));
    }
    this.host.notifyStateChanged();
    if (result.ok && options?.scheduleAutomation !== false) {
      this.host.scheduleAutomationFromCurrentState();
    }
    return result;
  }
}
