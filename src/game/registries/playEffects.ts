import type { InstructionContext, GameInstruction } from "../actions/instructions";
import type { CardPlayEffectConfig } from "../content/cards/catalog";

export type PlayEffectResolver<K extends CardPlayEffectConfig["type"] = CardPlayEffectConfig["type"]> = (
  context: InstructionContext,
  effectConfig: Extract<CardPlayEffectConfig, { type: K }>
) => GameInstruction[];

export type PlayEffectMagnitudeCalculator<K extends CardPlayEffectConfig["type"] = CardPlayEffectConfig["type"]> = (
  effectConfig: Extract<CardPlayEffectConfig, { type: K }>
) => number;

const playEffectResolvers = new Map<CardPlayEffectConfig["type"], PlayEffectResolver>();
const playEffectMagnitudeCalculators = new Map<CardPlayEffectConfig["type"], PlayEffectMagnitudeCalculator>();

export function registerPlayEffectResolver<K extends CardPlayEffectConfig["type"]>(
  type: K,
  resolver: PlayEffectResolver<K>
): void {
  playEffectResolvers.set(type, resolver as unknown as PlayEffectResolver);
}

export function getPlayEffectResolver(type: CardPlayEffectConfig["type"]): PlayEffectResolver | undefined {
  return playEffectResolvers.get(type);
}

export function registerPlayEffectMagnitudeCalculator<K extends CardPlayEffectConfig["type"]>(
  type: K,
  calculator: PlayEffectMagnitudeCalculator<K>
): void {
  playEffectMagnitudeCalculators.set(type, calculator as unknown as PlayEffectMagnitudeCalculator);
}

export function getPlayEffectMagnitudeCalculator(
  type: CardPlayEffectConfig["type"]
): PlayEffectMagnitudeCalculator | undefined {
  return playEffectMagnitudeCalculators.get(type);
}
