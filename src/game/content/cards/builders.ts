import type {
  CardPlayEffectConfig,
  CardPlayModifierEffectConfigs,
  CardPlayProfile,
  CardSourceDestination,
  CardTargetMode,
  HexTargetPredicate,
  TargetPredicate,
} from "./types";

type TacticPlayOptions = {
  targetMode?: CardTargetMode;
  isValidTarget?: TargetPredicate;
  isValidHexTarget?: HexTargetPredicate;
  effectConfig?: CardPlayEffectConfig;
  modifierEffectConfigs?: CardPlayModifierEffectConfigs;
  sourceDestinationOnResolve?: CardSourceDestination;
};

export function tacticPlay(stackEffectId: string, options?: TacticPlayOptions): CardPlayProfile {
  const targetMode = options?.targetMode ?? "none";

  if (targetMode === "entity") {
    if (!options?.isValidTarget) {
      throw new Error(`Entity-targeted card play ${stackEffectId} is missing isValidTarget.`);
    }
    return {
      stackEffectId,
      effectConfig: options?.effectConfig,
      modifierEffectConfigs: options?.modifierEffectConfigs,
      targetMode,
      sourceDestinationOnResolve: options?.sourceDestinationOnResolve ?? "discard",
      isValidTarget: options.isValidTarget,
    };
  }

  if (targetMode === "hex") {
    if (!options?.isValidHexTarget) {
      throw new Error(`Hex-targeted card play ${stackEffectId} is missing isValidHexTarget.`);
    }
    return {
      stackEffectId,
      effectConfig: options?.effectConfig,
      modifierEffectConfigs: options?.modifierEffectConfigs,
      targetMode,
      sourceDestinationOnResolve: options?.sourceDestinationOnResolve ?? "discard",
      isValidHexTarget: options.isValidHexTarget,
    };
  }

  return {
    stackEffectId,
    effectConfig: options?.effectConfig,
    modifierEffectConfigs: options?.modifierEffectConfigs,
    targetMode,
    sourceDestinationOnResolve: options?.sourceDestinationOnResolve ?? "discard",
  };
}

export function createModifierEffectConfigs(
  modifierId: string,
  effectConfig?: CardPlayEffectConfig
): CardPlayModifierEffectConfigs | undefined {
  if (!effectConfig) {
    return undefined;
  }
  return { [modifierId]: effectConfig };
}

export function unitPlay(stackEffectId = "deploy_unit_card"): CardPlayProfile {
  return {
    stackEffectId,
    targetMode: "none",
    sourceDestinationOnResolve: "none",
    requiresOpenBaseAdjacentTile: true,
    reserveEntityId: true,
  };
}
