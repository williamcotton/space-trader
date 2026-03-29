import type { GameInstruction, InstructionContext } from "../../../actions/instructions";
import type { ResourceType, UnitRole } from "../../../model/enums";
import { areSameHex, hexDistance } from "../../../model/hex";
import type { PlayerId } from "../../../model/ids";
import type { GameState, UnitEntity } from "../../../model/state";
import { getMechanicApi } from "../../../registries/mechanicApis";
import { getCascadeAffectedHexes } from "../../../systems/cascade";
import { LAYER } from "../../../systems/continuousEffects";
import type { CardCost, CardKeyword, CardPlayEffectConfig } from "../../cards/catalog";

type BloomMechanicApi = {
  getBloomedUnitIdsThisTurn(state: Readonly<GameState>): string[];
  getLastBloomSourceItemId(state: Readonly<GameState>): string | null;
  setLastBloomSourceItemId(state: GameState, itemId: string | null): void;
  getLastBloomedUnitIds(state: Readonly<GameState>): string[];
  resetBloomResolutionState(state: GameState): void;
};

type SalvageMechanicApi = {
  getSalvageTriggersThisTurn(state: Readonly<GameState>, playerId: PlayerId): number;
  incrementSalvageTriggersThisTurn(state: GameState, playerId: PlayerId): void;
};

export type EffectRelation = "ally" | "enemy" | "any";

export type CascadeUnitBuffReward = {
  resource: ResourceType;
  amount: number;
  minUnits: number;
};

export type CascadeUnitBuffOptions = {
  attackBonus?: number;
  armorBonus?: number;
  waves: number;
  roleFilter?: UnitRole;
  grantedKeywords?: CardKeyword[];
  reward?: CascadeUnitBuffReward;
};

export type MassDamageOptions = {
  amount: number;
  relation: EffectRelation;
};

export type GlobalUnitBuffOptions = {
  attackBonus?: number;
  armorBonus?: number;
  relation: EffectRelation;
  roleFilter?: UnitRole;
};

export type DestroyDamagedUnitsOptions = {
  relation: EffectRelation;
};

export type DrawAndGainResourcesOptions = {
  drawCount?: number;
  resources?: CardCost;
};

export type ResourcesByUnitCountOptions = {
  relation: EffectRelation;
  threshold: number;
  resourcesPerThreshold: CardCost;
  roleFilter?: UnitRole;
  maxThresholds?: number;
};

export type ResourcesByBloomCountOptions = {
  threshold: number;
  resourcesPerThreshold: CardCost;
  maxThresholds?: number;
};

export type ResourcesBySalvageCountOptions = {
  threshold: number;
  resourcesPerThreshold: CardCost;
  maxThresholds?: number;
};

export type HexAreaDamageOptions = {
  amount: number;
  radius: number;
  relation: EffectRelation;
};

export type MassDamagePlayEffectConfig = CardPlayEffectConfig & {
  type: "mass_damage";
  amount: number;
  relation: EffectRelation;
};

export type GlobalUnitBuffPlayEffectConfig = CardPlayEffectConfig & {
  type: "global_unit_buff";
  attackBonus: number;
  armorBonus: number;
  relation: EffectRelation;
  roleFilter?: UnitRole;
};

export type DestroyDamagedUnitsPlayEffectConfig = CardPlayEffectConfig & {
  type: "destroy_damaged_units";
  relation: EffectRelation;
};

export type DrawAndGainResourcesPlayEffectConfig = CardPlayEffectConfig & {
  type: "draw_and_gain_resources";
  drawCount: number;
  resources: CardCost;
};

export type ResourcesByUnitCountPlayEffectConfig = CardPlayEffectConfig & {
  type: "resources_by_unit_count";
  relation: EffectRelation;
  threshold: number;
  resourcesPerThreshold: CardCost;
  roleFilter?: UnitRole;
  maxThresholds?: number;
};

export type ResourcesByBloomCountPlayEffectConfig = CardPlayEffectConfig & {
  type: "resources_by_bloom_count";
  threshold: number;
  resourcesPerThreshold: CardCost;
  maxThresholds?: number;
};

export type ResourcesBySalvageCountPlayEffectConfig = CardPlayEffectConfig & {
  type: "resources_by_salvage_count";
  threshold: number;
  resourcesPerThreshold: CardCost;
  maxThresholds?: number;
};

export type HexAreaDamagePlayEffectConfig = CardPlayEffectConfig & {
  type: "hex_area_damage";
  amount: number;
  radius: number;
  relation: EffectRelation;
};

export type CascadeUnitBuffPlayEffectConfig = CardPlayEffectConfig & {
  type: "cascade_unit_buff";
  attackBonus: number;
  armorBonus: number;
  waves: number;
  roleFilter?: UnitRole;
  grantedKeywords?: CardKeyword[];
  reward?: CascadeUnitBuffReward;
};

function requireBloomApi(): BloomMechanicApi {
  const api = getMechanicApi<BloomMechanicApi>("bloom");
  if (!api) {
    throw new Error("Missing registered bloom mechanic API.");
  }
  return api;
}

function requireSalvageApi(): SalvageMechanicApi {
  const api = getMechanicApi<SalvageMechanicApi>("salvage");
  if (!api) {
    throw new Error("Missing registered salvage mechanic API.");
  }
  return api;
}

function matchesRelation(context: InstructionContext, unit: UnitEntity, relation: EffectRelation): boolean {
  switch (relation) {
    case "ally":
      return unit.ownerId === context.controllerId;
    case "enemy":
      return unit.ownerId !== context.controllerId;
    case "any":
      return true;
  }
}

function getUnitsByRelation(
  context: InstructionContext,
  relation: EffectRelation,
  roleFilter?: UnitRole
): UnitEntity[] {
  return Object.values(context.state.entities)
    .filter((entity): entity is UnitEntity =>
      entity.kind === "unit" &&
      matchesRelation(context, entity, relation) &&
      (!roleFilter || entity.role === roleFilter)
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getAffectedFriendlyUnits(context: InstructionContext, waves: number, roleFilter?: UnitRole) {
  if (!context.targetHex) {
    return {
      affectedHexes: [],
      friendlyUnits: [],
    };
  }

  const affectedHexes = getCascadeAffectedHexes(context.state, context.controllerId, context.targetHex, waves);
  const friendlyUnits = Object.values(context.state.entities)
    .filter((entity): entity is UnitEntity =>
      entity.kind === "unit" &&
      entity.ownerId === context.controllerId &&
      (!roleFilter || entity.role === roleFilter) &&
      affectedHexes.some((coord) => areSameHex(coord, entity.coord))
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  return { affectedHexes, friendlyUnits };
}

function createBloomInstruction(
  context: InstructionContext,
  units: readonly UnitEntity[],
  options?: {
    excludeEffectIdPrefix?: string;
  }
): GameInstruction | null {
  if (units.length === 0) {
    return null;
  }

  return {
    type: "RUN_MECHANIC_INSTRUCTION",
    mechanicId: "bloom",
    operation: "trigger",
    payload: {
      unitIds: units.map((unit) => unit.id),
      sourceLabel: context.item.label,
      sourceItemId: context.item.id,
      excludeEffectIdPrefix: options?.excludeEffectIdPrefix,
    },
  };
}

export function createCascadeUnitBuffInstructions(options: CascadeUnitBuffOptions) {
  const attackBonus = options.attackBonus ?? 0;
  const armorBonus = options.armorBonus ?? 0;
  const grantedKeywords = options.grantedKeywords ?? [];

  return (context: InstructionContext): GameInstruction[] => {
    if (!context.targetHex) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no hex target configured.` }];
    }

    const { affectedHexes, friendlyUnits } = getAffectedFriendlyUnits(context, options.waves, options.roleFilter);

    if (friendlyUnits.length === 0) {
      return [{
        type: "LOG",
        text: `Resolved ${context.item.label}: cascade touched ${affectedHexes.length} hexes but found no eligible friendly units.`,
      }];
    }

    const instructions: GameInstruction[] = [];
    for (const unit of friendlyUnits) {
      if (attackBonus !== 0) {
        instructions.push({
          type: "APPLY_CONTINUOUS_EFFECT",
          effectId: `ce_${context.item.id}_${unit.id}_cascade_atk`,
          sourceEntityId: null,
          sourceCardId: context.item.sourceCardId,
          controllerId: context.controllerId,
          payload: { type: "stat_modifier", stat: "attackDamage", amount: attackBonus },
          target: { type: "specific_entity", entityId: unit.id },
          expiry: { type: "end_of_turn", turn: context.state.turn },
          layer: LAYER.TEMPORARY,
        });
      }

      if (armorBonus !== 0) {
        instructions.push({
          type: "APPLY_CONTINUOUS_EFFECT",
          effectId: `ce_${context.item.id}_${unit.id}_cascade_arm`,
          sourceEntityId: null,
          sourceCardId: context.item.sourceCardId,
          controllerId: context.controllerId,
          payload: { type: "stat_modifier", stat: "armor", amount: armorBonus },
          target: { type: "specific_entity", entityId: unit.id },
          expiry: { type: "end_of_turn", turn: context.state.turn },
          layer: LAYER.TEMPORARY,
        });
      }

      for (const keyword of grantedKeywords) {
        instructions.push({
          type: "APPLY_CONTINUOUS_EFFECT",
          effectId: `ce_${context.item.id}_${unit.id}_cascade_kw_${keyword}`,
          sourceEntityId: null,
          sourceCardId: context.item.sourceCardId,
          controllerId: context.controllerId,
          payload: { type: "keyword_grant", keyword },
          target: { type: "specific_entity", entityId: unit.id },
          expiry: { type: "end_of_turn", turn: context.state.turn },
          layer: LAYER.ABILITY,
        });
      }
    }

    if (options.reward && friendlyUnits.length >= options.reward.minUnits) {
      instructions.push({
        type: "GAIN_RESOURCES",
        playerId: context.controllerId,
        resources: {
          [options.reward.resource]: options.reward.amount,
        },
      });
    }

    const bloomInstruction = createBloomInstruction(context, friendlyUnits, {
      excludeEffectIdPrefix: `ce_${context.item.id}_`,
    });
    if (bloomInstruction) {
      instructions.push(bloomInstruction);
    }

    const buffLabelParts: string[] = [];
    if (attackBonus !== 0) {
      buffLabelParts.push(`${attackBonus > 0 ? "+" : ""}${attackBonus} ATK`);
    }
    if (armorBonus !== 0) {
      buffLabelParts.push(`${armorBonus > 0 ? "+" : ""}${armorBonus} ARM`);
    }
    for (const keyword of grantedKeywords) {
      buffLabelParts.push(`gain ${keyword}`);
    }

    const rewardText = options.reward && friendlyUnits.length >= options.reward.minUnits
      ? ` and generated ${options.reward.amount} ${options.reward.resource}`
      : "";

    instructions.push({
      type: "LOG",
      text: `Resolved ${context.item.label}: cascaded across ${affectedHexes.length} hexes, buffed ${friendlyUnits.length} unit${friendlyUnits.length === 1 ? "" : "s"} with ${buffLabelParts.join(" and ")}${rewardText}.`,
    });

    return instructions;
  };
}

export function createMassDamageInstructions(options: MassDamageOptions) {
  return (context: InstructionContext): GameInstruction[] => {
    const targets = getUnitsByRelation(context, options.relation);
    if (targets.length === 0) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no units matched the damage sweep.` }];
    }

    return [
      ...targets.map((unit) => ({
        type: "DEAL_DAMAGE" as const,
        targetEntityId: unit.id,
        amount: options.amount,
        sourceLabel: context.item.label,
      })),
      {
        type: "LOG" as const,
        text: `Resolved ${context.item.label}: dealt ${options.amount} to ${targets.length} unit${targets.length === 1 ? "" : "s"}.`,
      },
    ];
  };
}

export function createGlobalUnitBuffInstructions(options: GlobalUnitBuffOptions) {
  const attackBonus = options.attackBonus ?? 0;
  const armorBonus = options.armorBonus ?? 0;

  return (context: InstructionContext): GameInstruction[] => {
    const targets = getUnitsByRelation(context, options.relation, options.roleFilter);
    if (targets.length === 0) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no units matched the global buff.` }];
    }

    const instructions: GameInstruction[] = [];
    for (const unit of targets) {
      if (attackBonus !== 0) {
        instructions.push({
          type: "APPLY_CONTINUOUS_EFFECT",
          effectId: `ce_${context.item.id}_${unit.id}_global_atk`,
          sourceEntityId: null,
          sourceCardId: context.item.sourceCardId,
          controllerId: context.controllerId,
          payload: { type: "stat_modifier", stat: "attackDamage", amount: attackBonus },
          target: { type: "specific_entity", entityId: unit.id },
          expiry: { type: "end_of_turn", turn: context.state.turn },
          layer: LAYER.TEMPORARY,
        });
      }

      if (armorBonus !== 0) {
        instructions.push({
          type: "APPLY_CONTINUOUS_EFFECT",
          effectId: `ce_${context.item.id}_${unit.id}_global_arm`,
          sourceEntityId: null,
          sourceCardId: context.item.sourceCardId,
          controllerId: context.controllerId,
          payload: { type: "stat_modifier", stat: "armor", amount: armorBonus },
          target: { type: "specific_entity", entityId: unit.id },
          expiry: { type: "end_of_turn", turn: context.state.turn },
          layer: LAYER.TEMPORARY,
        });
      }
    }

    const bloomInstruction = createBloomInstruction(context, targets, {
      excludeEffectIdPrefix: `ce_${context.item.id}_`,
    });
    if (bloomInstruction) {
      instructions.push(bloomInstruction);
    }

    const buffParts: string[] = [];
    if (attackBonus !== 0) {
      buffParts.push(`${attackBonus > 0 ? "+" : ""}${attackBonus} ATK`);
    }
    if (armorBonus !== 0) {
      buffParts.push(`${armorBonus > 0 ? "+" : ""}${armorBonus} ARM`);
    }

    instructions.push({
      type: "LOG",
      text: `Resolved ${context.item.label}: gave ${targets.length} unit${targets.length === 1 ? "" : "s"} ${buffParts.join(" and ")} until end of turn.`,
    });

    return instructions;
  };
}

export function createDestroyDamagedUnitsInstructions(options: DestroyDamagedUnitsOptions) {
  return (context: InstructionContext): GameInstruction[] => {
    const targets = getUnitsByRelation(context, options.relation)
      .filter((unit) => unit.hp < unit.maxHp);

    if (targets.length === 0) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no damaged units matched.` }];
    }

    return [
      ...targets.map((unit) => ({
        type: "DESTROY_ENTITY" as const,
        targetEntityId: unit.id,
        sourceLabel: context.item.label,
      })),
      {
        type: "LOG" as const,
        text: `Resolved ${context.item.label}: destroyed ${targets.length} damaged unit${targets.length === 1 ? "" : "s"}.`,
      },
    ];
  };
}

export function createDrawAndGainResourcesInstructions(options: DrawAndGainResourcesOptions) {
  return (context: InstructionContext): GameInstruction[] => {
    const instructions: GameInstruction[] = [];
    const drawCount = options.drawCount ?? 0;
    const resources = options.resources ?? {};

    if (drawCount > 0) {
      instructions.push({
        type: "DRAW_CARDS",
        playerId: context.controllerId,
        count: drawCount,
      });
    }

    if (Object.values(resources).some((amount) => (amount ?? 0) > 0)) {
      instructions.push({
        type: "GAIN_RESOURCES",
        playerId: context.controllerId,
        resources,
      });
    }

    instructions.push({
      type: "LOG",
      text: `Resolved ${context.item.label}: drew ${drawCount} and gained resources.`,
    });

    return instructions;
  };
}

export function createResourcesByUnitCountInstructions(options: ResourcesByUnitCountOptions) {
  return (context: InstructionContext): GameInstruction[] => {
    const targets = getUnitsByRelation(context, options.relation, options.roleFilter);
    const thresholdsMet = Math.floor(targets.length / options.threshold);
    const payoutMultiplier = options.maxThresholds
      ? Math.min(thresholdsMet, options.maxThresholds)
      : thresholdsMet;

    if (payoutMultiplier <= 0) {
      return [{
        type: "LOG",
        text: `Resolved ${context.item.label}: only ${targets.length} matching unit${targets.length === 1 ? "" : "s"}; needed ${options.threshold} for payout.`,
      }];
    }

    const resources = Object.fromEntries(
      Object.entries(options.resourcesPerThreshold)
        .map(([resource, amount]) => [resource, (amount ?? 0) * payoutMultiplier])
        .filter(([, amount]) => Number(amount) > 0)
    ) as CardCost;

    return [
      {
        type: "GAIN_RESOURCES",
        playerId: context.controllerId,
        resources,
      },
      {
        type: "LOG",
        text: `Resolved ${context.item.label}: converted ${targets.length} matching unit${targets.length === 1 ? "" : "s"} into ${payoutMultiplier} payout${payoutMultiplier === 1 ? "" : "s"}.`,
      },
    ];
  };
}

export function createResourcesByBloomCountInstructions(options: ResourcesByBloomCountOptions) {
  return (context: InstructionContext): GameInstruction[] => {
    const matchingUnits = requireBloomApi().getBloomedUnitIdsThisTurn(context.state)
      .map((unitId) => context.state.entities[unitId])
      .filter((entity): entity is UnitEntity => entity?.kind === "unit" && entity.ownerId === context.controllerId);
    const thresholdsMet = Math.floor(matchingUnits.length / options.threshold);
    const payoutMultiplier = options.maxThresholds
      ? Math.min(thresholdsMet, options.maxThresholds)
      : thresholdsMet;

    if (payoutMultiplier <= 0) {
      return [{
        type: "LOG",
        text: `Resolved ${context.item.label}: only ${matchingUnits.length} bloomed unit${matchingUnits.length === 1 ? "" : "s"} this turn; needed ${options.threshold} for payout.`,
      }];
    }

    const resources = Object.fromEntries(
      Object.entries(options.resourcesPerThreshold)
        .map(([resource, amount]) => [resource, (amount ?? 0) * payoutMultiplier])
        .filter(([, amount]) => Number(amount) > 0)
    ) as CardCost;

    return [
      {
        type: "GAIN_RESOURCES",
        playerId: context.controllerId,
        resources,
      },
      {
        type: "LOG",
        text: `Resolved ${context.item.label}: converted ${matchingUnits.length} bloomed unit${matchingUnits.length === 1 ? "" : "s"} into ${payoutMultiplier} payout${payoutMultiplier === 1 ? "" : "s"}.`,
      },
    ];
  };
}

export function createResourcesBySalvageCountInstructions(options: ResourcesBySalvageCountOptions) {
  return (context: InstructionContext): GameInstruction[] => {
    const salvageTriggers = requireSalvageApi().getSalvageTriggersThisTurn(context.state, context.controllerId);
    const thresholdsMet = Math.floor(salvageTriggers / options.threshold);
    const payoutMultiplier = options.maxThresholds
      ? Math.min(thresholdsMet, options.maxThresholds)
      : thresholdsMet;

    if (payoutMultiplier <= 0) {
      return [{
        type: "LOG",
        text: `Resolved ${context.item.label}: only ${salvageTriggers} salvage trigger${salvageTriggers === 1 ? "" : "s"} this turn; needed ${options.threshold} for payout.`,
      }];
    }

    const resources = Object.fromEntries(
      Object.entries(options.resourcesPerThreshold)
        .map(([resource, amount]) => [resource, (amount ?? 0) * payoutMultiplier])
        .filter(([, amount]) => Number(amount) > 0)
    ) as CardCost;

    return [
      {
        type: "GAIN_RESOURCES",
        playerId: context.controllerId,
        resources,
      },
      {
        type: "LOG",
        text: `Resolved ${context.item.label}: converted ${salvageTriggers} salvage trigger${salvageTriggers === 1 ? "" : "s"} into ${payoutMultiplier} payout${payoutMultiplier === 1 ? "" : "s"}.`,
      },
    ];
  };
}

export function createHexAreaDamageInstructions(options: HexAreaDamageOptions) {
  return (context: InstructionContext): GameInstruction[] => {
    if (!context.targetHex) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no hex target configured.` }];
    }

    const targets = Object.values(context.state.entities)
      .filter((entity): entity is UnitEntity =>
        entity.kind === "unit" &&
        matchesRelation(context, entity, options.relation) &&
        hexDistance(entity.coord, context.targetHex!) <= options.radius
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    if (targets.length === 0) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no units were in the blast area.` }];
    }

    return [
      ...targets.map((unit) => ({
        type: "DEAL_DAMAGE" as const,
        targetEntityId: unit.id,
        amount: options.amount,
        sourceLabel: context.item.label,
      })),
      {
        type: "LOG" as const,
        text: `Resolved ${context.item.label}: blasted ${targets.length} unit${targets.length === 1 ? "" : "s"} for ${options.amount}.`,
      },
    ];
  };
}
