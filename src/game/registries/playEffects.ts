import type { InstructionContext, GameInstruction } from "../actions/instructions";
import type { CardPlayEffectConfig } from "../content/cards/catalog";

export type PlayEffectResolver = (
  context: InstructionContext,
  effectConfig: CardPlayEffectConfig
) => GameInstruction[];

export type PlayEffectMagnitudeCalculator = (effectConfig: CardPlayEffectConfig) => number;

const playEffectResolvers = new Map<CardPlayEffectConfig["type"], PlayEffectResolver>();
const playEffectMagnitudeCalculators = new Map<CardPlayEffectConfig["type"], PlayEffectMagnitudeCalculator>();

export function registerPlayEffectResolver(
  type: CardPlayEffectConfig["type"],
  resolver: PlayEffectResolver
): void {
  playEffectResolvers.set(type, resolver);
}

export function getPlayEffectResolver(type: CardPlayEffectConfig["type"]): PlayEffectResolver | undefined {
  return playEffectResolvers.get(type);
}

export function registerPlayEffectMagnitudeCalculator(
  type: CardPlayEffectConfig["type"],
  calculator: PlayEffectMagnitudeCalculator
): void {
  playEffectMagnitudeCalculators.set(type, calculator);
}

export function getPlayEffectMagnitudeCalculator(
  type: CardPlayEffectConfig["type"]
): PlayEffectMagnitudeCalculator | undefined {
  return playEffectMagnitudeCalculators.get(type);
}
