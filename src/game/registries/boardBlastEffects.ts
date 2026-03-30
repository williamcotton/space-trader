import type { CardPlayEffectConfig } from "../content/cards/catalog";
import type { PlayerId } from "../model/ids";
import type { GameState, HexCoord } from "../model/state";
import type { AnimationCapture } from "../render/animations";

export type BoardBlastEffectContext = {
  before: AnimationCapture;
  state: GameState;
  controllerId: PlayerId;
  effectConfig: CardPlayEffectConfig;
};

export type BoardBlastEffectResolution = {
  hexes: HexCoord[];
  prefersMapCenter?: boolean;
};

export type BoardBlastEffectResolver = (context: BoardBlastEffectContext) => BoardBlastEffectResolution | null;

const boardBlastEffectResolvers = new Map<string, BoardBlastEffectResolver>();

export function registerBoardBlastEffectResolver(effectConfigType: string, resolver: BoardBlastEffectResolver): void {
  boardBlastEffectResolvers.set(effectConfigType, resolver);
}

export function getBoardBlastEffectResolver(effectConfigType: string): BoardBlastEffectResolver | undefined {
  return boardBlastEffectResolvers.get(effectConfigType);
}

export function resetBoardBlastEffectRegistry(): void {
  boardBlastEffectResolvers.clear();
}
