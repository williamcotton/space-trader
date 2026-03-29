import type { UnitCardDefinition } from "../content/cards/catalog";

export type UnitDeploymentAdjustment = {
  movesRemaining?: number;
  attacksRemaining?: number;
};

export type UnitDeploymentAdjustmentHook = (
  card: UnitCardDefinition,
  keywords: readonly string[]
) => UnitDeploymentAdjustment | null;

const unitDeploymentAdjustmentHooks = new Map<string, UnitDeploymentAdjustmentHook>();

export function registerUnitDeploymentAdjustmentHook(id: string, hook: UnitDeploymentAdjustmentHook): void {
  unitDeploymentAdjustmentHooks.set(id, hook);
}

export function getUnitDeploymentAdjustment(
  card: UnitCardDefinition,
  keywords: readonly string[]
): UnitDeploymentAdjustment {
  const result: UnitDeploymentAdjustment = {};
  for (const hook of unitDeploymentAdjustmentHooks.values()) {
    const adjustment = hook(card, keywords);
    if (!adjustment) {
      continue;
    }
    if (adjustment.movesRemaining !== undefined) {
      result.movesRemaining = adjustment.movesRemaining;
    }
    if (adjustment.attacksRemaining !== undefined) {
      result.attacksRemaining = adjustment.attacksRemaining;
    }
  }
  return result;
}
