import type { GameCommand } from "../../actions/commands";

export type SearchActionPlan = {
  key: string;
  commands: GameCommand[];
  scoreHint: number;
  label: string;
};

export type SearchConfig = {
  maxDepth: number;
  maxNodes: number;
};
