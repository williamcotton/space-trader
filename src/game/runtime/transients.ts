import type { CanvasAnimation, GameViewport } from "../types";
import type { HexCoord } from "../model/state";
import type { PendingAttackTargeting, PendingCardTargeting } from "./types";

const INITIAL_VIEWPORT: GameViewport = {
  width: 1024,
  height: 768,
  scale: 1,
};

export class RuntimeTransients {
  private viewport: GameViewport = { ...INITIAL_VIEWPORT };
  private animations: CanvasAnimation[] = [];
  private hoveredHex: HexCoord | null = null;
  private pendingCardTargeting: PendingCardTargeting | null = null;
  private pendingAttackTargeting: PendingAttackTargeting | null = null;

  rehydrate(): void {
    if (!this.viewport) {
      this.viewport = { ...INITIAL_VIEWPORT };
    }
    if (!Array.isArray(this.animations)) {
      this.animations = [];
    }
    if (typeof this.hoveredHex === "undefined") {
      this.hoveredHex = null;
    }
    if (!this.pendingCardTargeting) {
      this.pendingCardTargeting = null;
    } else if (!this.pendingCardTargeting.targetMode) {
      this.pendingCardTargeting = null;
    }
    if (!this.pendingAttackTargeting) {
      this.pendingAttackTargeting = null;
    } else if (!this.pendingAttackTargeting.attackerId || !this.pendingAttackTargeting.prompt) {
      this.pendingAttackTargeting = null;
    }
  }

  reset(): void {
    this.animations = [];
    this.hoveredHex = null;
    this.pendingCardTargeting = null;
    this.pendingAttackTargeting = null;
  }

  setViewport(width: number, height: number, scale = 1): void {
    this.viewport.width = width;
    this.viewport.height = height;
    this.viewport.scale = scale;
  }

  getViewport(): GameViewport {
    return this.viewport;
  }

  getHoveredHex(): HexCoord | null {
    return this.hoveredHex ? { ...this.hoveredHex } : null;
  }

  getRawHoveredHex(): HexCoord | null {
    return this.hoveredHex;
  }

  setHoveredHex(next: HexCoord | null): boolean {
    if (next?.q === this.hoveredHex?.q && next?.r === this.hoveredHex?.r) {
      return false;
    }
    this.hoveredHex = next ? { ...next } : null;
    return true;
  }

  pushAnimations(animations: CanvasAnimation[]): void {
    if (animations.length === 0) {
      return;
    }

    this.animations.push(...animations);
    if (this.animations.length > 32) {
      this.animations = this.animations.slice(-32);
    }
  }

  setAnimations(animations: CanvasAnimation[]): void {
    this.animations = animations;
  }

  clearAnimations(): void {
    this.animations = [];
  }

  getAnimations(): CanvasAnimation[] {
    return this.animations;
  }

  hasActiveAnimations(): boolean {
    return this.animations.length > 0;
  }

  getPendingCardTargeting(): PendingCardTargeting | null {
    return this.pendingCardTargeting ? { ...this.pendingCardTargeting } : null;
  }

  getRawPendingCardTargeting(): PendingCardTargeting | null {
    return this.pendingCardTargeting;
  }

  setPendingCardTargeting(targeting: PendingCardTargeting | null): void {
    this.pendingCardTargeting = targeting ? { ...targeting } : null;
  }

  clearPendingCardTargeting(): void {
    this.pendingCardTargeting = null;
  }

  getPendingAttackTargeting(): PendingAttackTargeting | null {
    return this.pendingAttackTargeting ? { ...this.pendingAttackTargeting } : null;
  }

  getRawPendingAttackTargeting(): PendingAttackTargeting | null {
    return this.pendingAttackTargeting;
  }

  setPendingAttackTargeting(targeting: PendingAttackTargeting | null): void {
    this.pendingAttackTargeting = targeting ? { ...targeting } : null;
  }

  clearPendingAttackTargeting(): void {
    this.pendingAttackTargeting = null;
  }
}
