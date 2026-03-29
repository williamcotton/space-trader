import type { PlayerId } from "../model/ids";
import type { GameState, UnitEntity } from "../model/state";
import type { AutoTargetStrategy } from "../systems/triggerEngine";

export type AutoTargetResolver = (
  state: GameState,
  controllerId: PlayerId,
  preferredTargetId: string | null,
  sourceUnit?: UnitEntity
) => string | null;

const autoTargetResolvers = new Map<AutoTargetStrategy, AutoTargetResolver>();

export function registerAutoTargetResolver<K extends AutoTargetStrategy>(
  strategy: K,
  resolver: AutoTargetResolver
): void {
  autoTargetResolvers.set(strategy, resolver);
}

export function getAutoTargetResolver(strategy: AutoTargetStrategy): AutoTargetResolver | undefined {
  return autoTargetResolvers.get(strategy);
}
