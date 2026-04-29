import { stepAnimations } from "../render/animations";
import type { GameRenderer, RuntimeFrame, UpdateSystem } from "../types";
import type { GameState } from "../model/state";
import { RuntimeStore } from "./store";
import { RuntimeTransients } from "./transients";

export class RuntimeFrameController {
  constructor(
    private readonly state: GameState,
    private readonly store: RuntimeStore,
    private readonly transients: RuntimeTransients,
    private getUpdateSystem: () => UpdateSystem
  ) {}

  step(target: GameRenderer, deltaSeconds: number): void {
    this.transients.setAnimations(stepAnimations(this.transients.getAnimations(), deltaSeconds));

    const pendingAttackTargeting = this.transients.getRawPendingAttackTargeting();
    const frame: RuntimeFrame = {
      viewport: this.transients.getViewport(),
      deltaSeconds,
      transients: {
        animations: this.transients.getAnimations(),
        hoveredHex: this.transients.getRawHoveredHex(),
        pendingAttackTargeting: pendingAttackTargeting
          ? {
              playerId: pendingAttackTargeting.playerId,
              attackerId: pendingAttackTargeting.attackerId,
            }
          : null,
      },
      derived: this.store.getDerivedState(this.state),
    };

    this.getUpdateSystem()(this.state, frame);
    target.render(this.state, frame);
  }
}
