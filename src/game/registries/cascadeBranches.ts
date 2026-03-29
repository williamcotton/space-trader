import type { PlayerId } from "../model/ids";
import type { GameState, HexCoord, UnitEntity } from "../model/state";

export type CascadeBranch = {
  origin: HexCoord;
  totalWaves: number;
};

export type CascadeBranchProviderContext = {
  state: Readonly<GameState>;
  controllerId: PlayerId;
  waveAffectedHexes: readonly HexCoord[];
  branch: CascadeBranch;
  options?: {
    excludeKeywordEffectIdPrefix?: string;
  };
  getFriendlyUnitsOnHexes: (hexes: readonly HexCoord[]) => UnitEntity[];
  memory: Map<string, unknown>;
};

export type CascadeBranchProvider = (context: CascadeBranchProviderContext) => CascadeBranch[];

const cascadeBranchProviders = new Map<string, CascadeBranchProvider>();

export function registerCascadeBranchProvider(id: string, provider: CascadeBranchProvider): void {
  cascadeBranchProviders.set(id, provider);
}

export function getAdditionalCascadeBranches(context: CascadeBranchProviderContext): CascadeBranch[] {
  const branches: CascadeBranch[] = [];
  for (const provider of cascadeBranchProviders.values()) {
    branches.push(...provider(context));
  }
  return branches;
}
