import type { GameCommand } from "../actions/commands";
import { getRegisteredResourceIds } from "../content/registry";
import type { PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import { getDebugStackResponse } from "../registries/debugStackResponses";
import { buildAnimationsFromEvents, buildVictoryAnimation, captureAnimationSnapshot } from "../render/animations";
import { removeEffectsForEntity } from "../systems/continuousEffects";
import type { CanvasAnimation } from "../types";
import type { PendingAttackTargeting, PendingCardTargeting } from "./types";
import { RuntimeTransients } from "./transients";

export type RuntimeDevControlsHost = {
  state: GameState;
  isNetworkedMatch(): boolean;
  dispatch(command: GameCommand): unknown;
  pushAnimations(animations: CanvasAnimation[]): void;
  notifyStateChanged(): void;
  scheduleAutomationFromCurrentState(): void;
  clearAutomationTimer(): void;
};

export class RuntimeDevControls {
  constructor(
    private readonly host: RuntimeDevControlsHost,
    private readonly transients: RuntimeTransients
  ) {}

  debugAdvancePhase(): void {
    if (this.host.isNetworkedMatch()) {
      return;
    }
    void this.host.dispatch({
      type: "END_PHASE",
      playerId: this.host.state.activePlayerId,
    });
  }

  debugSelectFirstActiveUnit(): void {
    if (this.host.isNetworkedMatch()) {
      return;
    }
    const activePlayerId = this.host.state.activePlayerId;
    const firstUnit = Object.values(this.host.state.entities).find(
      (entity) => entity.kind === "unit" && entity.ownerId === activePlayerId
    );

    if (!firstUnit) {
      return;
    }

    void this.host.dispatch({
      type: "SELECT_ENTITY",
      playerId: activePlayerId,
      entityId: firstUnit.id,
    });
  }

  debugMoveSelectedUnit(deltaQ: number, deltaR: number): void {
    if (this.host.isNetworkedMatch()) {
      return;
    }
    const activePlayerId = this.host.state.activePlayerId;
    const selectedId = this.host.state.selectedEntityId;
    if (!selectedId) {
      return;
    }

    const selected = this.host.state.entities[selectedId];
    if (!selected || selected.kind !== "unit") {
      return;
    }

    void this.host.dispatch({
      type: "MOVE_UNIT",
      playerId: activePlayerId,
      entityId: selected.id,
      to: {
        q: selected.coord.q + deltaQ,
        r: selected.coord.r + deltaR,
      },
    });
  }

  debugPassPriority(): void {
    if (this.host.isNetworkedMatch()) {
      return;
    }
    const priorityPlayerId = this.host.state.priorityPlayerId;
    if (!priorityPlayerId) {
      return;
    }

    void this.host.dispatch({
      type: "PASS_PRIORITY",
      playerId: priorityPlayerId,
    });
  }

  debugAddTestResources(playerId: PlayerId, amount = 100): void {
    if (this.host.isNetworkedMatch()) {
      return;
    }
    const pool = this.host.state.players[playerId].resources;
    for (const resource of getRegisteredResourceIds()) {
      pool[resource] += amount;
    }

    this.host.state.log.push({
      turn: this.host.state.turn,
      text: `${playerId} gained ${amount} of each resource for testing.`,
    });
    this.host.notifyStateChanged();
    this.host.scheduleAutomationFromCurrentState();
  }

  debugKillTestUnit(playerId: PlayerId): void {
    if (this.host.isNetworkedMatch()) {
      return;
    }
    const selected = this.host.state.selectedEntityId ? this.host.state.entities[this.host.state.selectedEntityId] : null;
    const target =
      selected && selected.kind === "unit" && selected.ownerId === playerId
        ? selected
        : Object.values(this.host.state.entities).find((entity) => entity.kind === "unit" && entity.ownerId === playerId);

    if (!target || target.kind !== "unit") {
      return;
    }

    const before = captureAnimationSnapshot(this.host.state);

    if (target.carries) {
      this.host.state.log.push({
        turn: this.host.state.turn,
        text: `${target.id} was destroyed and cargo lost (${target.carries}).`,
      });
    }
    if (this.host.state.selectedEntityId === target.id) {
      this.host.state.selectedEntityId = null;
    }
    removeEffectsForEntity(this.host.state, target.id);
    delete this.host.state.entities[target.id];
    this.host.state.log.push({
      turn: this.host.state.turn,
      text: `${playerId} debug-killed ${target.id}.`,
    });

    this.host.pushAnimations(buildAnimationsFromEvents([], before, this.host.state));
    this.host.notifyStateChanged();
    this.host.scheduleAutomationFromCurrentState();
  }

  debugWinTestGame(playerId: PlayerId): void {
    if (this.host.isNetworkedMatch()) {
      return;
    }
    const before = captureAnimationSnapshot(this.host.state);
    const replayVictoryOnly = this.host.state.winner === playerId;

    this.host.state.winner = playerId;
    this.host.state.log.push({
      turn: this.host.state.turn,
      text: `${playerId} claimed victory for testing.`,
    });

    if (replayVictoryOnly) {
      this.host.pushAnimations([buildVictoryAnimation(this.host.state, playerId)]);
    } else {
      this.host.pushAnimations(buildAnimationsFromEvents([], before, this.host.state));
    }
    this.host.notifyStateChanged();
    this.host.scheduleAutomationFromCurrentState();
  }

  debugRespondStack(): void {
    this.debugRespond("noop_response");
  }

  debugRespondDamageEnemyBase(): void {
    this.debugRespond("base_strike");
  }

  debugRespondCounterTopItem(targetStackItemId?: string): void {
    this.debugRespond("counter_top_item", targetStackItemId);
  }

  clearAnimations(): void {
    this.transients.clearAnimations();
  }

  pauseAutomation(): void {
    this.host.clearAutomationTimer();
  }

  forceNotify(): void {
    this.host.notifyStateChanged();
  }

  setPendingCardTargeting(targeting: PendingCardTargeting | null): void {
    this.transients.setPendingCardTargeting(targeting);
  }

  setPendingAttackTargeting(targeting: PendingAttackTargeting | null): void {
    this.transients.setPendingAttackTargeting(targeting);
  }

  private debugRespond(responseId: string, targetStackItemId?: string): void {
    if (this.host.isNetworkedMatch()) {
      return;
    }
    const priorityPlayerId = this.host.state.priorityPlayerId;
    if (!priorityPlayerId) {
      return;
    }

    const response = getDebugStackResponse(responseId);
    if (!response) {
      return;
    }

    const resolvedTargetId = targetStackItemId ?? response.getTargetStackItemId?.(this.host.state) ?? undefined;

    void this.host.dispatch({
      type: "RESPOND_STACK",
      playerId: priorityPlayerId,
      label: response.label,
      effectId: response.effectId,
      targetStackItemId: resolvedTargetId,
    });
  }
}
