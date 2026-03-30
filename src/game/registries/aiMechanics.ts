import type { ResourceType, UnitRole } from "../model/enums";
import type { PlayerId } from "../model/ids";
import type { GameState, HexCoord, UnitEntity } from "../model/state";
import type { TriggerCondition } from "../systems/triggerEngine";

export type UnitBuffScoreOptions = {
  attackBonus: number;
  armorBonus: number;
  roleFilter?: UnitRole;
  grantedKeywords?: readonly string[];
  reward?: {
    resource: ResourceType;
    amount: number;
    minUnits: number;
  };
};

export type UnitBuffScoreContext = {
  state: GameState;
  botPlayerId: PlayerId;
  affectedUnits: UnitEntity[];
  options: UnitBuffScoreOptions;
};

export type UnitBuffScoreContribution = {
  scoreDelta: number;
  hasMeaningfulOpportunity?: boolean;
};

export type UnitBuffScoreContributor = (context: UnitBuffScoreContext) => UnitBuffScoreContribution | null;

export type CascadeScoreContext = {
  state: GameState;
  botPlayerId: PlayerId;
  affectedHexes: HexCoord[];
  affectedUnits: UnitEntity[];
  options: UnitBuffScoreOptions & {
    waves: number;
  };
};

export type CascadeScoreContributor = (context: CascadeScoreContext) => number;

export type TriggerConditionScoreContributor = (condition: TriggerCondition) => number | null;

const unitBuffScoreContributors = new Map<string, UnitBuffScoreContributor>();
const cascadeScoreContributors = new Map<string, CascadeScoreContributor>();
const triggerConditionScoreContributors = new Map<string, TriggerConditionScoreContributor>();

export function registerUnitBuffScoreContributor(id: string, contributor: UnitBuffScoreContributor): void {
  unitBuffScoreContributors.set(id, contributor);
}

export function applyUnitBuffScoreContributions(context: UnitBuffScoreContext): UnitBuffScoreContribution {
  const result: UnitBuffScoreContribution = {
    scoreDelta: 0,
    hasMeaningfulOpportunity: false,
  };

  for (const contributor of unitBuffScoreContributors.values()) {
    const contribution = contributor(context);
    if (!contribution) {
      continue;
    }
    result.scoreDelta += contribution.scoreDelta;
    if (contribution.hasMeaningfulOpportunity) {
      result.hasMeaningfulOpportunity = true;
    }
  }

  return result;
}

export function registerCascadeScoreContributor(id: string, contributor: CascadeScoreContributor): void {
  cascadeScoreContributors.set(id, contributor);
}

export function getCascadeScoreBonus(context: CascadeScoreContext): number {
  let bonus = 0;
  for (const contributor of cascadeScoreContributors.values()) {
    bonus += contributor(context);
  }
  return bonus;
}

export function registerTriggerConditionScoreContributor(id: string, contributor: TriggerConditionScoreContributor): void {
  triggerConditionScoreContributors.set(id, contributor);
}

export function getTriggerConditionScoreBonus(condition: TriggerCondition): number | null {
  for (const contributor of triggerConditionScoreContributors.values()) {
    const bonus = contributor(condition);
    if (bonus !== null) {
      return bonus;
    }
  }

  return null;
}

export function resetAiMechanicsRegistry(): void {
  unitBuffScoreContributors.clear();
  cascadeScoreContributors.clear();
  triggerConditionScoreContributors.clear();
}
