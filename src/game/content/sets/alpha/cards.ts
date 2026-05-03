import type { PlayerId } from "../../../model/ids";
import type { EntityState } from "../../../model/state";
import type { GameState, HexCoord } from "../../../model/state";
import type { GameInstruction, InstructionContext } from "../../../actions/instructions";
import { hexDistance, isWithinMapBounds } from "../../../model/hex";
import { getPlayerBase } from "../../../model/queries";
import { LAYER } from "../../../systems/continuousEffects";
import { createModifierEffectConfigs, tacticPlay, unitPlay } from "../../cards/builders";
import type {
  CascadeUnitBuffOptions,
  CascadeUnitBuffPlayEffectConfig,
  ResourcesByBloomCountOptions,
  ResourcesByBloomCountPlayEffectConfig,
  ResourcesBySalvageCountOptions,
  ResourcesBySalvageCountPlayEffectConfig,
} from "./playEffects";
import type {
  DestroyDamagedUnitsOptions,
  DestroyDamagedUnitsPlayEffectConfig,
  DrawAndGainResourcesOptions,
  DrawAndGainResourcesPlayEffectConfig,
  GainControlUnitOptions,
  GainControlUnitPlayEffectConfig,
  GlobalUnitBuffOptions,
  GlobalUnitBuffPlayEffectConfig,
  HexAreaDamageOptions,
  HexAreaDamagePlayEffectConfig,
  MassDamageOptions,
  MassDamagePlayEffectConfig,
  ModifyTargetUnitOptions,
  ModifyTargetUnitPlayEffectConfig,
  ResourcesByUnitCountOptions,
  ResourcesByUnitCountPlayEffectConfig,
} from "../foundation/playEffects";
import type {
  CardDefinition,
  CardPlayProfile,
  CardSourceDestination,
  HexTargetPredicate,
  TargetPredicate,
} from "../../cards/types";
import {
  BASTION_KEYWORD,
  BLOOM_KEYWORD,
  EMPLACED_KEYWORD,
  PREDATION_KEYWORD,
  RELAY_KEYWORD,
  SPROUT_KEYWORD,
  STEALTH_KEYWORD,
} from "./mechanics/keywordIds";

function getStartOfControllersNextTurn(state: Readonly<GameState>, controllerId: PlayerId): number {
  return state.activePlayerId === controllerId ? state.turn + 2 : state.turn + 1;
}

function counterStackItem(destination: "discard" | "hand" | "exile" | "none", label: string): (ctx: InstructionContext) => GameInstruction[] {
  return (ctx) => {
    if (!ctx.targetStackItemId) return [{ type: "LOG", text: `${label}: no stack target.` }];
    return [{ type: "COUNTER_STACK_ITEM", targetStackItemId: ctx.targetStackItemId, destination, sourceLabel: label }];
  };
}

function damageTargetEntity(amount: number, label: string): (ctx: InstructionContext) => GameInstruction[] {
  return (ctx) => {
    if (!ctx.targetEntityId) return [{ type: "LOG", text: `${label}: no target.` }];
    return [{ type: "DEAL_DAMAGE", targetEntityId: ctx.targetEntityId, amount, sourceLabel: label }];
  };
}

function deployUnit(cardId: string): (ctx: InstructionContext) => GameInstruction[] {
  return (ctx) => [{ type: "DEPLOY_UNIT", cardId, controllerId: ctx.controllerId, entityId: ctx.item.pendingUnitEntityId ?? undefined }];
}

function createCascadeUnitBuffEffectConfig(options: CascadeUnitBuffOptions): CascadeUnitBuffPlayEffectConfig {
  return {
    type: "cascade_unit_buff",
    attackBonus: options.attackBonus ?? 0,
    armorBonus: options.armorBonus ?? 0,
    waves: options.waves,
    roleFilter: options.roleFilter,
    grantedKeywords: options.grantedKeywords ? [...options.grantedKeywords] : undefined,
    reward: options.reward,
  };
}

function createMassDamageEffectConfig(options: MassDamageOptions): MassDamagePlayEffectConfig {
  return {
    type: "mass_damage",
    amount: options.amount,
    relation: options.relation,
  };
}

function createGlobalUnitBuffEffectConfig(options: GlobalUnitBuffOptions): GlobalUnitBuffPlayEffectConfig {
  return {
    type: "global_unit_buff",
    attackBonus: options.attackBonus ?? 0,
    armorBonus: options.armorBonus ?? 0,
    relation: options.relation,
    roleFilter: options.roleFilter,
    grantedKeywords: options.grantedKeywords ? [...options.grantedKeywords] : undefined,
  };
}

function createDestroyDamagedUnitsEffectConfig(options: DestroyDamagedUnitsOptions): DestroyDamagedUnitsPlayEffectConfig {
  return {
    type: "destroy_damaged_units",
    relation: options.relation,
  };
}

function createGainControlUnitEffectConfig(_options: GainControlUnitOptions = {}): GainControlUnitPlayEffectConfig {
  return {
    type: "gain_control_of_unit",
  };
}

function createModifyTargetUnitEffectConfig(options: ModifyTargetUnitOptions): ModifyTargetUnitPlayEffectConfig {
  return {
    type: "modify_target_unit",
    attackBonus: options.attackBonus ?? 0,
    armorBonus: options.armorBonus ?? 0,
    siegeBonus: options.siegeBonus ?? 0,
    moveRangeBonus: options.moveRangeBonus ?? 0,
    attackRangeBonus: options.attackRangeBonus ?? 0,
    grantedKeywords: options.grantedKeywords ? [...options.grantedKeywords] : undefined,
    setMoveRange: options.setMoveRange,
    duration: options.duration ?? "end_of_turn",
  };
}

function createDrawAndGainResourcesEffectConfig(options: DrawAndGainResourcesOptions): DrawAndGainResourcesPlayEffectConfig {
  return {
    type: "draw_and_gain_resources",
    drawCount: options.drawCount ?? 0,
    resources: options.resources ?? {},
  };
}

function createResourcesByUnitCountEffectConfig(options: ResourcesByUnitCountOptions): ResourcesByUnitCountPlayEffectConfig {
  return {
    type: "resources_by_unit_count",
    relation: options.relation,
    threshold: options.threshold,
    resourcesPerThreshold: options.resourcesPerThreshold,
    roleFilter: options.roleFilter,
    maxThresholds: options.maxThresholds,
  };
}

function createResourcesByBloomCountEffectConfig(options: ResourcesByBloomCountOptions): ResourcesByBloomCountPlayEffectConfig {
  return {
    type: "resources_by_bloom_count",
    threshold: options.threshold,
    resourcesPerThreshold: options.resourcesPerThreshold,
    maxThresholds: options.maxThresholds,
  };
}

function createResourcesBySalvageCountEffectConfig(options: ResourcesBySalvageCountOptions): ResourcesBySalvageCountPlayEffectConfig {
  return {
    type: "resources_by_salvage_count",
    threshold: options.threshold,
    resourcesPerThreshold: options.resourcesPerThreshold,
    maxThresholds: options.maxThresholds,
  };
}

function createHexAreaDamageEffectConfig(options: HexAreaDamageOptions): HexAreaDamagePlayEffectConfig {
  return {
    type: "hex_area_damage",
    amount: options.amount,
    radius: options.radius,
    relation: options.relation,
  };
}

function cascadeTacticPlay(
  options: CascadeUnitBuffOptions & {
    isValidHexTarget: HexTargetPredicate;
    surgeBonus?: CascadeUnitBuffOptions;
    sourceDestinationOnResolve?: CardSourceDestination;
  }
): CardPlayProfile {
  return tacticPlay("cascade_unit_buff", {
    targetMode: "hex",
    isValidHexTarget: options.isValidHexTarget,
    sourceDestinationOnResolve: options.sourceDestinationOnResolve,
    effectConfig: createCascadeUnitBuffEffectConfig(options),
    modifierEffectConfigs: createModifierEffectConfigs("surge", options.surgeBonus ? createCascadeUnitBuffEffectConfig(options.surgeBonus) : undefined),
  });
}

function massDamageTacticPlay(
  options: MassDamageOptions & {
    surgeBonus?: MassDamageOptions;
    sourceDestinationOnResolve?: CardSourceDestination;
  }
): CardPlayProfile {
  return tacticPlay("mass_damage", {
    sourceDestinationOnResolve: options.sourceDestinationOnResolve,
    effectConfig: createMassDamageEffectConfig(options),
    modifierEffectConfigs: createModifierEffectConfigs("surge", options.surgeBonus ? createMassDamageEffectConfig(options.surgeBonus) : undefined),
  });
}

function globalUnitBuffTacticPlay(
  options: GlobalUnitBuffOptions & {
    surgeBonus?: GlobalUnitBuffOptions;
    sourceDestinationOnResolve?: CardSourceDestination;
  }
): CardPlayProfile {
  return tacticPlay("global_unit_buff", {
    sourceDestinationOnResolve: options.sourceDestinationOnResolve,
    effectConfig: createGlobalUnitBuffEffectConfig(options),
    modifierEffectConfigs: createModifierEffectConfigs("surge", options.surgeBonus ? createGlobalUnitBuffEffectConfig(options.surgeBonus) : undefined),
  });
}

function destroyDamagedUnitsTacticPlay(
  options: DestroyDamagedUnitsOptions & {
    surgeBonus?: DestroyDamagedUnitsOptions;
    sourceDestinationOnResolve?: CardSourceDestination;
  }
): CardPlayProfile {
  return tacticPlay("destroy_damaged_units", {
    sourceDestinationOnResolve: options.sourceDestinationOnResolve,
    effectConfig: createDestroyDamagedUnitsEffectConfig(options),
    modifierEffectConfigs: createModifierEffectConfigs("surge", options.surgeBonus ? createDestroyDamagedUnitsEffectConfig(options.surgeBonus) : undefined),
  });
}

function drawAndGainResourcesTacticPlay(
  options: DrawAndGainResourcesOptions & {
    surgeBonus?: DrawAndGainResourcesOptions;
    sourceDestinationOnResolve?: CardSourceDestination;
  }
): CardPlayProfile {
  return tacticPlay("draw_and_gain_resources", {
    sourceDestinationOnResolve: options.sourceDestinationOnResolve,
    effectConfig: createDrawAndGainResourcesEffectConfig(options),
    modifierEffectConfigs: createModifierEffectConfigs("surge", options.surgeBonus ? createDrawAndGainResourcesEffectConfig(options.surgeBonus) : undefined),
  });
}

function gainControlUnitTacticPlay(
  options: {
    isValidTarget?: TargetPredicate;
    sourceDestinationOnResolve?: CardSourceDestination;
  } = {}
): CardPlayProfile {
  return tacticPlay("gain_control_of_unit", {
    targetMode: "entity",
    isValidTarget: options.isValidTarget ?? ((_state, target, pid) => target.kind === "unit" && target.ownerId !== pid),
    sourceDestinationOnResolve: options.sourceDestinationOnResolve,
    effectConfig: createGainControlUnitEffectConfig(),
  });
}

function modifyTargetUnitTacticPlay(
  options: ModifyTargetUnitOptions & {
    isValidTarget: TargetPredicate;
    surgeBonus?: ModifyTargetUnitOptions;
    sourceDestinationOnResolve?: CardSourceDestination;
  }
): CardPlayProfile {
  return tacticPlay("modify_target_unit", {
    targetMode: "entity",
    isValidTarget: options.isValidTarget,
    sourceDestinationOnResolve: options.sourceDestinationOnResolve,
    effectConfig: createModifyTargetUnitEffectConfig(options),
    modifierEffectConfigs: createModifierEffectConfigs("surge", options.surgeBonus ? createModifyTargetUnitEffectConfig(options.surgeBonus) : undefined),
  });
}

function hexAreaDamageTacticPlay(
  options: HexAreaDamageOptions & {
    isValidHexTarget: HexTargetPredicate;
    surgeBonus?: HexAreaDamageOptions;
    sourceDestinationOnResolve?: CardSourceDestination;
  }
): CardPlayProfile {
  return tacticPlay("hex_area_damage", {
    targetMode: "hex",
    isValidHexTarget: options.isValidHexTarget,
    sourceDestinationOnResolve: options.sourceDestinationOnResolve,
    effectConfig: createHexAreaDamageEffectConfig(options),
    modifierEffectConfigs: createModifierEffectConfigs("surge", options.surgeBonus ? createHexAreaDamageEffectConfig(options.surgeBonus) : undefined),
  });
}

function resourcesByUnitCountTacticPlay(
  options: ResourcesByUnitCountOptions & {
    surgeBonus?: ResourcesByUnitCountOptions;
    sourceDestinationOnResolve?: CardSourceDestination;
  }
): CardPlayProfile {
  return tacticPlay("resources_by_unit_count", {
    sourceDestinationOnResolve: options.sourceDestinationOnResolve,
    effectConfig: createResourcesByUnitCountEffectConfig(options),
    modifierEffectConfigs: createModifierEffectConfigs("surge", options.surgeBonus ? createResourcesByUnitCountEffectConfig(options.surgeBonus) : undefined),
  });
}

function resourcesByBloomCountTacticPlay(
  options: ResourcesByBloomCountOptions & {
    surgeBonus?: ResourcesByBloomCountOptions;
    sourceDestinationOnResolve?: CardSourceDestination;
  }
): CardPlayProfile {
  return tacticPlay("resources_by_bloom_count", {
    sourceDestinationOnResolve: options.sourceDestinationOnResolve,
    effectConfig: createResourcesByBloomCountEffectConfig(options),
    modifierEffectConfigs: createModifierEffectConfigs("surge", options.surgeBonus ? createResourcesByBloomCountEffectConfig(options.surgeBonus) : undefined),
  });
}

function resourcesBySalvageCountTacticPlay(
  options: ResourcesBySalvageCountOptions & {
    surgeBonus?: ResourcesBySalvageCountOptions;
    sourceDestinationOnResolve?: CardSourceDestination;
  }
): CardPlayProfile {
  return tacticPlay("resources_by_salvage_count", {
    sourceDestinationOnResolve: options.sourceDestinationOnResolve,
    effectConfig: createResourcesBySalvageCountEffectConfig(options),
    modifierEffectConfigs: createModifierEffectConfigs("surge", options.surgeBonus ? createResourcesBySalvageCountEffectConfig(options.surgeBonus) : undefined),
  });
}

function hasFriendlyUnitNearHex(state: Readonly<GameState>, playerId: PlayerId, target: HexCoord): boolean {
  return Object.values(state.entities).some((entity) =>
    entity.kind === "unit" &&
    entity.ownerId === playerId &&
    hexDistance(entity.coord, target) <= 1
  );
}

function isFriendlyCascadeHexTarget(state: Readonly<GameState>, target: HexCoord, playerId: PlayerId): boolean {
  return isWithinMapBounds(target, state.map) && hasFriendlyUnitNearHex(state, playerId, target);
}

function isEnemyBaseTarget(_state: Readonly<GameState>, target: EntityState, playerId: PlayerId): boolean {
  return target.kind === "base" && target.ownerId !== playerId;
}

function isEnemyUnitWithinFriendlyBaseRange(state: Readonly<GameState>, target: EntityState, playerId: PlayerId, range: number): boolean {
  if (target.kind !== "unit" || target.ownerId === playerId) {
    return false;
  }

  const base = getPlayerBase(state as GameState, playerId);
  return !!base && hexDistance(base.coord, target.coord) <= range;
}

function hasFriendlyUnitNearEntity(state: Readonly<GameState>, playerId: PlayerId, target: EntityState): boolean {
  if (target.kind === "base") {
    return false;
  }

  return Object.values(state.entities).some((entity) =>
    entity.kind === "unit" &&
    entity.ownerId === playerId &&
    entity.id !== target.id &&
    hexDistance(entity.coord, target.coord) <= 1
  );
}

function countUnitsControlledBy(state: Readonly<GameState>, playerId: PlayerId): number {
  return Object.values(state.entities).filter((entity) => entity.kind === "unit" && entity.ownerId === playerId).length;
}

function controlsFewerUnitsThanOpponent(state: Readonly<GameState>, playerId: PlayerId): boolean {
  const friendlyCount = countUnitsControlledBy(state, playerId);
  return Object.keys(state.players).some((otherPlayerId) =>
    otherPlayerId !== playerId && countUnitsControlledBy(state, otherPlayerId as PlayerId) > friendlyCount
  );
}

export const ALPHA_CARD_DEFINITIONS: Record<string, CardDefinition> = {
  orbital_ping: {
    id: "orbital_ping",
    name: "Orbital Ping",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, flux: 1 },
    text: "Deal 2 damage to target enemy base.",
    play: tacticPlay("damage_enemy_base_2", {
      targetMode: "entity",
      isValidTarget: isEnemyBaseTarget,
    }),
    onResolve: damageTargetEntity(2, "Orbital Ping"),
  },
  slag_barrage: {
    id: "slag_barrage",
    name: "Slag Barrage",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, alloy: 1 },
    text: "Deal 2 damage to target damaged enemy unit or enemy base.",
    play: tacticPlay("damage_enemy_entity_2", {
      targetMode: "entity",
      isValidTarget: (_state, target, pid) =>
        target.ownerId !== pid &&
        (target.kind === "base" || (target.kind === "unit" && target.hp < target.maxHp)),
    }),
    onResolve: damageTargetEntity(2, "Slag Barrage"),
  },
  spore_burst: {
    id: "spore_burst",
    name: "Spore Burst",
    faction: "biomass_swarm",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, biomass: 1 },
    text: "Deal 2 damage to target enemy unit adjacent to one of your units.",
    play: tacticPlay("damage_enemy_unit_2", {
      targetMode: "entity",
      isValidTarget: (state, target, pid) =>
        target.kind === "unit" &&
        target.ownerId !== pid &&
        hasFriendlyUnitNearEntity(state, pid, target),
    }),
    onResolve: damageTargetEntity(2, "Spore Burst"),
  },
  counter_pulse: {
    id: "counter_pulse",
    name: "Counter Pulse",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, flux: 1 },
    text: "Counter target top stack item.",
    play: tacticPlay("counter_top_item", { targetMode: "stack_item" }),
    onResolve: counterStackItem("discard", "Counter Pulse"),
  },
  null_intercept: {
    id: "null_intercept",
    name: "Null Intercept",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 3 },
    text: "Counter target top stack item.",
    play: tacticPlay("counter_top_item", { targetMode: "stack_item" }),
    onResolve: counterStackItem("discard", "Null Intercept"),
  },
  echo_recall: {
    id: "echo_recall",
    name: "Echo Recall",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, flux: 2 },
    text: "Counter target top stack item and return it to hand.",
    play: tacticPlay("counter_to_hand", { targetMode: "stack_item" }),
    onResolve: counterStackItem("hand", "Echo Recall"),
  },
  patchwork_barrier: {
    id: "patchwork_barrier",
    name: "Patchwork Barrier",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, alloy: 1 },
    text: "Choose a hex near one of your units. Cascade 2. Friendly combat units on affected hexes get +1 ARM until end of turn.",
    play: cascadeTacticPlay({
      armorBonus: 1,
      roleFilter: "combat",
      waves: 2,
      isValidHexTarget: isFriendlyCascadeHexTarget,
    }),
    animation: {
      resolve: {
        kind: "hex_shower",
        label: "Patchwork Barrier",
        waves: 2,
        accent: "alloy",
      },
    },
  },
  brace_protocol: {
    id: "brace_protocol",
    name: "Brace Protocol",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, alloy: 1 },
    text: "Target allied unit gets +2 ARM until your next turn.",
    play: tacticPlay("armor_ally_unit_2_eot", {
      targetMode: "entity",
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId === pid,
    }),
    onResolve: (ctx) => {
      if (!ctx.targetEntityId) return [{ type: "LOG", text: "Brace Protocol: no target." }];
      return [
        {
          type: "APPLY_CONTINUOUS_EFFECT",
          effectId: `ce_brace_${ctx.item.id}`,
          sourceEntityId: null,
          sourceCardId: "brace_protocol",
          controllerId: ctx.controllerId,
          payload: { type: "stat_modifier", stat: "armor", amount: 2 },
          target: { type: "specific_entity", entityId: ctx.targetEntityId },
          expiry: { type: "start_of_turn", turn: getStartOfControllersNextTurn(ctx.state, ctx.controllerId) },
          layer: LAYER.TEMPORARY,
        },
        {
          type: "RUN_MECHANIC_INSTRUCTION",
          mechanicId: "bloom",
          operation: "trigger",
          payload: {
            unitIds: [ctx.targetEntityId],
            sourceLabel: "Brace Protocol",
            sourceItemId: ctx.item.id,
            excludeEffectIdPrefix: `ce_brace_${ctx.item.id}`,
          },
        },
      ];
    },
  },
  scrapline_charge: {
    id: "scrapline_charge",
    name: "Scrapline Charge",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, alloy: 1 },
    text: "Target allied combat unit gets +2 ATK until end of turn.",
    play: modifyTargetUnitTacticPlay({
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId === pid && target.role === "combat",
      attackBonus: 2,
    }),
  },
  rust_tag: {
    id: "rust_tag",
    name: "Rust Tag",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { alloy: 1 },
    text: "Deal 1 damage to target enemy unit. If it was already damaged, gain 1 alloy.",
    play: tacticPlay("damage_enemy_unit_1", {
      targetMode: "entity",
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId !== pid,
    }),
    onResolve: (ctx) => {
      if (!ctx.targetEntityId) return [{ type: "LOG", text: "Rust Tag: no target." }];
      const target = ctx.state.entities[ctx.targetEntityId];
      if (!target || target.kind !== "unit") {
        return [{ type: "LOG", text: `Rust Tag: target ${ctx.targetEntityId} was no longer a unit.` }];
      }
      const wasAlreadyDamaged = target.hp < target.maxHp;
      return [
        { type: "DEAL_DAMAGE", targetEntityId: target.id, amount: 1, sourceLabel: "Rust Tag" },
        ...(wasAlreadyDamaged
          ? [{ type: "GAIN_RESOURCES" as const, playerId: ctx.controllerId, resources: { alloy: 1 } }]
          : []),
      ];
    },
  },
  anchor_guns: {
    id: "anchor_guns",
    name: "Anchor Guns",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, alloy: 1 },
    text: "Target allied resource unit gets +1 SG and gains Emplaced until end of turn. Its Move Range becomes 0 until end of turn.",
    play: modifyTargetUnitTacticPlay({
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId === pid && target.role === "resource",
      siegeBonus: 1,
      grantedKeywords: [EMPLACED_KEYWORD],
      setMoveRange: 0,
    }),
  },
  shrapnel_relay: {
    id: "shrapnel_relay",
    name: "Shrapnel Relay",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2, alloy: 1 },
    text: "Choose a hex near one of your units. Cascade 2. Friendly combat units on affected hexes get +1 ATK and +1 ARM until end of turn.",
    play: cascadeTacticPlay({
      attackBonus: 1,
      armorBonus: 1,
      roleFilter: "combat",
      waves: 2,
      isValidHexTarget: isFriendlyCascadeHexTarget,
    }),
    animation: {
      resolve: {
        kind: "hex_shower",
        label: "Shrapnel Relay",
        waves: 2,
        accent: "alloy",
      },
    },
  },
  rivet_volley: {
    id: "rivet_volley",
    name: "Rivet Volley",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, alloy: 1 },
    text: "Deal 2 damage to target enemy unit or base.",
    play: tacticPlay("damage_enemy_entity_2", {
      targetMode: "entity",
      isValidTarget: (_state, target, pid) => target.ownerId !== pid,
    }),
    onResolve: damageTargetEntity(2, "Rivet Volley"),
  },
  neural_echo: {
    id: "neural_echo",
    name: "Neural Echo",
    faction: "biomass_swarm",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, biomass: 1 },
    text: "Choose a hex near one of your units. Cascade 2. Friendly units on affected hexes get +1 ATK until end of turn. If 3 or more friendly units are affected, gain 1 biomass.",
    play: cascadeTacticPlay({
      attackBonus: 1,
      waves: 2,
      reward: {
        resource: "biomass",
        amount: 1,
        minUnits: 3,
      },
      isValidHexTarget: isFriendlyCascadeHexTarget,
    }),
    animation: {
      resolve: {
        kind: "hex_shower",
        label: "Neural Echo",
        waves: 2,
        accent: "biomass",
      },
    },
  },
  spore_bloom: {
    id: "spore_bloom",
    name: "Spore Bloom",
    faction: "biomass_swarm",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2, biomass: 1 },
    text: "Choose a hex near one of your units. Cascade 2. Friendly units on affected hexes get +1 ARM until end of turn. If 3 or more friendly units are affected, gain 1 biomass.",
    play: cascadeTacticPlay({
      armorBonus: 1,
      waves: 2,
      reward: {
        resource: "biomass",
        amount: 1,
        minUnits: 3,
      },
      isValidHexTarget: isFriendlyCascadeHexTarget,
    }),
    animation: {
      resolve: {
        kind: "hex_shower",
        label: "Spore Bloom",
        waves: 2,
        accent: "biomass",
      },
    },
  },
  feeding_frenzy: {
    id: "feeding_frenzy",
    name: "Feeding Frenzy",
    faction: "biomass_swarm",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, biomass: 1 },
    text: "Friendly resource units get +1 ATK and gain Predation until end of turn. (Units with Predation can attack this turn even if they are resource units.)",
    play: globalUnitBuffTacticPlay({
      relation: "ally",
      roleFilter: "resource",
      grantedKeywords: [PREDATION_KEYWORD],
      attackBonus: 1,
      armorBonus: 0,
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Feeding Frenzy",
        accent: "biomass",
      },
    },
  },
  spore_veil: {
    id: "spore_veil",
    name: "Spore Veil",
    faction: "biomass_swarm",
    kind: "tactic",
    speed: "instant",
    cost: { biomass: 1 },
    text: "Target allied unit gets +1 ARM and gains stealth until end of turn.",
    play: modifyTargetUnitTacticPlay({
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId === pid,
      armorBonus: 1,
      grantedKeywords: [STEALTH_KEYWORD],
    }),
  },
  root_cache: {
    id: "root_cache",
    name: "Root Cache",
    faction: "biomass_swarm",
    kind: "tactic",
    speed: "main",
    cost: { credits: 1, biomass: 1 },
    text: "Draw 1 card. If you control fewer units than an opponent, gain 1 biomass.",
    play: drawAndGainResourcesTacticPlay({
      drawCount: 1,
      resources: {},
    }),
    onResolve: (ctx) => [
      { type: "DRAW_CARDS", playerId: ctx.controllerId, count: 1 },
      ...(controlsFewerUnitsThanOpponent(ctx.state, ctx.controllerId)
        ? [{ type: "GAIN_RESOURCES" as const, playerId: ctx.controllerId, resources: { biomass: 1 } }]
        : []),
      {
        type: "LOG",
        text: controlsFewerUnitsThanOpponent(ctx.state, ctx.controllerId)
          ? "Resolved Root Cache: drew 1 and gained 1 biomass."
          : "Resolved Root Cache: drew 1.",
      },
    ],
  },
  emergency_thrust: {
    id: "emergency_thrust",
    name: "Emergency Thrust",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2 },
    text: "Deal 2 damage to target enemy base.",
    play: tacticPlay("damage_enemy_base_2", {
      targetMode: "entity",
      isValidTarget: isEnemyBaseTarget,
    }),
    onResolve: damageTargetEntity(2, "Emergency Thrust"),
  },
  jammer_cloud: {
    id: "jammer_cloud",
    name: "Jammer Cloud",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2 },
    text: "Target allied unit gets +2 ARM until end of turn.",
    play: tacticPlay("armor_ally_unit_2_eot", {
      targetMode: "entity",
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId === pid,
    }),
  },
  failsafe_redirect: {
    id: "failsafe_redirect",
    name: "Failsafe Redirect",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 4 },
    text: "Counter target top stack item and return it to hand.",
    play: tacticPlay("counter_to_hand", { targetMode: "stack_item" }),
    onResolve: counterStackItem("hand", "Failsafe Redirect"),
  },
  scrap_burst: {
    id: "scrap_burst",
    name: "Scrap Burst",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 3 },
    text: "Deal 2 damage to target enemy unit or base.",
    play: tacticPlay("damage_enemy_entity_2", {
      targetMode: "entity",
      isValidTarget: (_state, target, pid) => target.ownerId !== pid,
    }),
  },
  holdfast_protocol: {
    id: "holdfast_protocol",
    name: "Holdfast Protocol",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 4 },
    text: "Destroy target damaged enemy unit.",
    play: tacticPlay("destroy_damaged_enemy_unit", {
      targetMode: "entity",
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId !== pid && target.hp < target.maxHp,
    }),
  },
  chain_beacon: {
    id: "chain_beacon",
    name: "Chain Beacon",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 3 },
    text: "Choose a hex near one of your units. Cascade 2. Friendly units on affected hexes get +1 ATK until end of turn. If 3 or more friendly units are affected, gain 1 credit.",
    play: cascadeTacticPlay({
      attackBonus: 1,
      waves: 2,
      reward: {
        resource: "credits",
        amount: 1,
        minUnits: 3,
      },
      isValidHexTarget: isFriendlyCascadeHexTarget,
    }),
    animation: {
      resolve: {
        kind: "hex_shower",
        label: "Chain Beacon",
        waves: 2,
        accent: "neutral",
      },
    },
  },
  emergency_tow: {
    id: "emergency_tow",
    name: "Emergency Tow",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2 },
    text: "Target allied unit gets +2 move range until end of turn.",
    play: modifyTargetUnitTacticPlay({
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId === pid,
      moveRangeBonus: 2,
    }),
  },
  arc_snap: {
    id: "arc_snap",
    name: "Arc Snap",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, flux: 1 },
    text: "Deal 2 damage to target enemy unit.",
    play: tacticPlay("damage_enemy_unit_2", {
      targetMode: "entity",
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId !== pid,
    }),
    onResolve: damageTargetEntity(2, "Arc Snap"),
  },
  overload_finish: {
    id: "overload_finish",
    name: "Overload Finish",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2, flux: 1 },
    text: "Destroy target damaged enemy unit.",
    play: tacticPlay("destroy_damaged_enemy_unit", {
      targetMode: "entity",
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId !== pid && target.hp < target.maxHp,
    }),
    onResolve: (ctx) => {
      if (!ctx.targetEntityId) return [{ type: "LOG", text: "Overload Finish: no target." }];
      const target = ctx.state.entities[ctx.targetEntityId];
      if (!target || target.kind !== "unit" || target.hp >= target.maxHp) {
        return [{ type: "LOG", text: `Overload Finish: target ${ctx.targetEntityId} was no longer damaged.` }];
      }
      return [{ type: "DESTROY_ENTITY", targetEntityId: ctx.targetEntityId, sourceLabel: "Overload Finish" }];
    },
  },
  ion_shower: {
    id: "ion_shower",
    name: "Ion Shower",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2, flux: 1 },
    text: "Choose a hex near one of your units. Cascade 2. Friendly units on affected hexes get +1 ATK until end of turn.",
    play: cascadeTacticPlay({
      attackBonus: 1,
      waves: 2,
      isValidHexTarget: isFriendlyCascadeHexTarget,
    }),
    animation: {
      resolve: {
        kind: "hex_shower",
        label: "Ion Shower",
        waves: 2,
        accent: "flux",
      },
    },
  },
  signal_fork: {
    id: "signal_fork",
    name: "Signal Fork",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, flux: 1 },
    text: "Choose a hex near one of your units. Cascade 2. Friendly units on affected hexes get +1 ATK until end of turn. If 3 or more friendly units are affected, gain 1 flux.",
    play: cascadeTacticPlay({
      attackBonus: 1,
      waves: 2,
      reward: {
        resource: "flux",
        amount: 1,
        minUnits: 3,
      },
      isValidHexTarget: isFriendlyCascadeHexTarget,
    }),
    animation: {
      resolve: {
        kind: "hex_shower",
        label: "Signal Fork",
        waves: 2,
        accent: "flux",
      },
    },
  },
  phase_coil: {
    id: "phase_coil",
    name: "Phase Coil",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2, flux: 2 },
    text: "Choose a hex near one of your units. Cascade 2. Friendly units on affected hexes gain Relay until end of turn.",
    play: cascadeTacticPlay({
      grantedKeywords: ["relay"],
      waves: 2,
      isValidHexTarget: isFriendlyCascadeHexTarget,
    }),
    animation: {
      resolve: {
        kind: "hex_shower",
        label: "Phase Coil",
        waves: 2,
        accent: "flux",
      },
    },
  },
  vector_lens: {
    id: "vector_lens",
    name: "Vector Lens",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, flux: 1 },
    text: "Target allied unit gets +1 attack range and gains Relay until end of turn.",
    play: modifyTargetUnitTacticPlay({
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId === pid,
      attackRangeBonus: 1,
      grantedKeywords: [RELAY_KEYWORD],
    }),
  },
  phase_shelter: {
    id: "phase_shelter",
    name: "Phase Shelter",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { flux: 1 },
    text: "Target allied unit gets +1 ARM until end of turn. Surge - it also gains stealth until end of turn.",
    keywords: ["surge"],
    play: modifyTargetUnitTacticPlay({
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId === pid,
      armorBonus: 1,
      surgeBonus: {
        grantedKeywords: [STEALTH_KEYWORD],
      },
    }),
  },
  static_insight: {
    id: "static_insight",
    name: "Static Insight",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { flux: 1 },
    text: "Draw 1 card. Surge — gain 1 credit and 1 flux.",
    keywords: ["surge"],
    play: drawAndGainResourcesTacticPlay({
      drawCount: 1,
      resources: {},
      surgeBonus: {
        resources: {
          credits: 1,
          flux: 1,
        },
      },
    }),
  },
  surge_matrix: {
    id: "surge_matrix",
    name: "Surge Matrix",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, flux: 1 },
    text: "Friendly units get +1 ATK until end of turn. Surge — they also get +1 ARM until end of turn.",
    keywords: ["surge"],
    play: globalUnitBuffTacticPlay({
      attackBonus: 1,
      armorBonus: 0,
      relation: "ally",
      surgeBonus: {
        attackBonus: 0,
        armorBonus: 1,
        relation: "ally",
      },
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Surge Matrix",
        accent: "flux",
      },
    },
  },
  arc_bloom: {
    id: "arc_bloom",
    name: "Arc Bloom",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2, flux: 1 },
    text: "Choose a hex. Deal 1 damage to each enemy unit there. Surge — deal 1 more damage there and to each adjacent enemy unit.",
    keywords: ["surge"],
    play: hexAreaDamageTacticPlay({
      amount: 1,
      radius: 0,
      relation: "enemy",
      isValidHexTarget: (state, target) => isWithinMapBounds(target, state.map),
      surgeBonus: {
        amount: 1,
        radius: 1,
        relation: "enemy",
      },
    }),
  },
  orbital_purge: {
    id: "orbital_purge",
    name: "Orbital Purge",
    faction: "neutral",
    kind: "tactic",
    speed: "main",
    cost: { credits: 6 },
    text: "Deal 4 damage to every unit.",
    play: massDamageTacticPlay({
      amount: 4,
      relation: "any",
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Orbital Purge",
        accent: "neutral",
      },
    },
  },
  scorched_protocol: {
    id: "scorched_protocol",
    name: "Scorched Protocol",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "main",
    cost: { credits: 4, alloy: 2 },
    text: "Destroy all damaged units.",
    play: destroyDamagedUnitsTacticPlay({
      relation: "any",
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Scorched Protocol",
        accent: "alloy",
      },
    },
  },
  meteor_chain: {
    id: "meteor_chain",
    name: "Meteor Chain",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 4, flux: 2 },
    text: "Choose a hex. Deal 4 damage to each unit there and on adjacent hexes.",
    play: hexAreaDamageTacticPlay({
      amount: 4,
      radius: 1,
      relation: "any",
      isValidHexTarget: (state, target) => isWithinMapBounds(target, state.map),
    }),
  },
  ion_surge_archive: {
    id: "ion_surge_archive",
    name: "Ion Surge Archive",
    faction: "flux_collective",
    kind: "tactic",
    speed: "main",
    cost: { credits: 3, flux: 2 },
    text: "Draw 2 cards. Gain 1 flux. Surge — gain 2 more flux.",
    keywords: ["surge"],
    play: drawAndGainResourcesTacticPlay({
      drawCount: 2,
      resources: { flux: 1 },
      surgeBonus: {
        resources: { flux: 2 },
      },
    }),
  },
  signal_hijack: {
    id: "signal_hijack",
    name: "Signal Hijack",
    faction: "flux_collective",
    kind: "tactic",
    speed: "main",
    cost: { credits: 4, flux: 2 },
    text: "Gain control of target enemy unit within 3 hexes of your base.",
    play: gainControlUnitTacticPlay({
      isValidTarget: (state, target, pid) => isEnemyUnitWithinFriendlyBaseRange(state, target, pid, 3),
    }),
  },
  bulwark_refit: {
    id: "bulwark_refit",
    name: "Bulwark Refit",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "main",
    cost: { credits: 1, alloy: 2 },
    text: "Target allied resource unit gets +2 SG, +1 ARM, and gains Emplaced permanently. Its Move Range becomes 0. (Resource units with Emplaced can attack.)",
    play: modifyTargetUnitTacticPlay({
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId === pid && target.role === "resource",
      siegeBonus: 2,
      armorBonus: 1,
      grantedKeywords: [EMPLACED_KEYWORD],
      setMoveRange: 0,
      duration: "permanent",
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Bulwark Refit",
        accent: "alloy",
      },
    },
  },
  market_exit_mandate: {
    id: "market_exit_mandate",
    name: "Market Exit Mandate",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "main",
    cost: { credits: 6, alloy: 6 },
    text: "Target allied combat unit gets +5 SG, +2 ARM, and gains Bastion permanently.",
    play: modifyTargetUnitTacticPlay({
      isValidTarget: (_state, target, pid) => target.kind === "unit" && target.ownerId === pid && target.role === "combat",
      siegeBonus: 5,
      armorBonus: 2,
      grantedKeywords: [BASTION_KEYWORD],
      duration: "permanent",
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Market Exit Mandate",
        accent: "alloy",
      },
    },
  },
  overgrowth_wave: {
    id: "overgrowth_wave",
    name: "Overgrowth Wave",
    faction: "biomass_swarm",
    kind: "tactic",
    speed: "main",
    cost: { credits: 3, biomass: 2 },
    text: "Friendly units get +1 ATK and +1 ARM until end of turn.",
    play: globalUnitBuffTacticPlay({
      attackBonus: 1,
      armorBonus: 1,
      relation: "ally",
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Overgrowth Wave",
        accent: "biomass",
      },
    },
  },
  war_protocol: {
    id: "war_protocol",
    name: "War Protocol",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "main",
    cost: { credits: 3, alloy: 2 },
    text: "Friendly combat units get +2 ATK and +1 ARM until end of turn.",
    play: globalUnitBuffTacticPlay({
      attackBonus: 2,
      armorBonus: 1,
      relation: "ally",
      roleFilter: "combat",
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "War Protocol",
        accent: "alloy",
      },
    },
  },
  iron_formation: {
    id: "iron_formation",
    name: "Iron Formation",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "main",
    cost: { credits: 4, alloy: 2 },
    text: "Friendly units get +1 ATK and +2 ARM until end of turn.",
    play: globalUnitBuffTacticPlay({
      attackBonus: 1,
      armorBonus: 2,
      relation: "ally",
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Iron Formation",
        accent: "alloy",
      },
    },
  },
  emergency_war_chest: {
    id: "emergency_war_chest",
    name: "Emergency War Chest",
    faction: "neutral",
    kind: "tactic",
    speed: "main",
    cost: { credits: 6 },
    text: "Draw 2 cards. Gain 4 credits.",
    play: drawAndGainResourcesTacticPlay({
      drawCount: 2,
      resources: { credits: 4 },
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Emergency War Chest",
        accent: "neutral",
      },
    },
  },
  spore_harvest: {
    id: "spore_harvest",
    name: "Spore Harvest",
    faction: "biomass_swarm",
    kind: "tactic",
    speed: "main",
    cost: { biomass: 2 },
    text: "Gain 1 credit and 1 biomass for every 2 friendly units you control, up to 3 times.",
    play: resourcesByUnitCountTacticPlay({
      relation: "ally",
      threshold: 2,
      resourcesPerThreshold: {
        credits: 1,
        biomass: 1,
      },
      maxThresholds: 3,
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Spore Harvest",
        accent: "biomass",
      },
    },
  },
  canopy_dividend: {
    id: "canopy_dividend",
    name: "Canopy Dividend",
    faction: "biomass_swarm",
    kind: "tactic",
    speed: "main",
    cost: { biomass: 1 },
    text: "Gain 1 credit and 1 biomass for every 2 of your units that bloomed this turn, up to 2 times.",
    play: resourcesByBloomCountTacticPlay({
      threshold: 2,
      resourcesPerThreshold: {
        credits: 1,
        biomass: 1,
      },
      maxThresholds: 2,
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Canopy Dividend",
        accent: "biomass",
      },
    },
  },
  scrap_dividend: {
    id: "scrap_dividend",
    name: "Scrap Dividend",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { alloy: 1 },
    text: "Gain 1 credit and 1 alloy for every salvage trigger you created this turn, up to 2 times.",
    play: resourcesBySalvageCountTacticPlay({
      threshold: 1,
      resourcesPerThreshold: {
        credits: 1,
        alloy: 1,
      },
      maxThresholds: 2,
    }),
    animation: {
      resolve: {
        kind: "board_blast",
        label: "Scrap Dividend",
        accent: "alloy",
      },
    },
  },
  frontline_scout_card: {
    id: "frontline_scout_card",
    name: "Frontline Scout",
    faction: "alloy_clan",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, alloy: 1 },
    text: "Salvage (When this unit destroys an enemy unit in combat, gain 1 alloy.) Deploy a combat scout near your base.",
    play: unitPlay(),
    onResolve: deployUnit("frontline_scout_card"),
    unit: {
      role: "combat",
      hp: 6,
      attackDamage: 2,
      siegeDamageBonus: 1,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["salvage"],
    },
  },
  alloy_guard_card: {
    id: "alloy_guard_card",
    name: "Alloy Guard",
    faction: "alloy_clan",
    kind: "unit",
    speed: "main",
    cost: { credits: 3, alloy: 2 },
    text: "Salvage (When this unit destroys an enemy unit in combat, gain 1 alloy.) Bastion (While this unit is adjacent to another allied unit, it gets +1 ARM.) Deploy an armored combat unit near your base.",
    play: unitPlay(),
    onResolve: deployUnit("alloy_guard_card"),
    unit: {
      role: "combat",
      hp: 8,
      attackDamage: 2,
      siegeDamageBonus: 3,
      armor: 1,
      moveRange: 1,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["salvage", "bastion"],
    },
  },
  flux_runner_card: {
    id: "flux_runner_card",
    name: "Flux Runner",
    faction: "flux_collective",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, flux: 1 },
    text: "Deploy a fast combat skirmisher near your base.",
    play: unitPlay(),
    onResolve: deployUnit("flux_runner_card"),
    unit: {
      role: "combat",
      hp: 6,
      attackDamage: 2,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 3,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
  },
  forge_captain_card: {
    id: "forge_captain_card",
    name: "Forge Captain",
    faction: "alloy_clan",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, alloy: 1 },
    text: "Adjacent allied combat units get +1 ATK.",
    play: unitPlay(),
    onResolve: deployUnit("forge_captain_card"),
    unit: {
      role: "utility",
      hp: 5,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 1,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      auras: [{ type: "adjacent_ally_buff", targetRole: "combat", attackBonus: 1 }],
    },
  },
  linebreak_marshal_card: {
    id: "linebreak_marshal_card",
    name: "Linebreak Marshal",
    faction: "alloy_clan",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, alloy: 1 },
    text: "Bastion (While this unit is adjacent to another allied unit, it gets +1 ARM.) Adjacent allied combat units get +1 SG.",
    play: unitPlay(),
    onResolve: deployUnit("linebreak_marshal_card"),
    unit: {
      role: "utility",
      hp: 5,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["bastion"],
      auras: [{ type: "adjacent_ally_buff", targetRole: "combat", siegeBonus: 1 }],
    },
  },
  scrap_quartermaster_card: {
    id: "scrap_quartermaster_card",
    name: "Scrap Quartermaster",
    faction: "alloy_clan",
    kind: "unit",
    speed: "main",
    cost: { credits: 1, alloy: 1 },
    text: "Bastion (While this unit is adjacent to another allied unit, it gets +1 ARM.) Whenever one of your units salvages, Scrap Quartermaster deals 1 damage to the weakest enemy base.",
    play: unitPlay(),
    onResolve: deployUnit("scrap_quartermaster_card"),
    unit: {
      role: "utility",
      hp: 4,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["bastion"],
    },
    triggers: [{
      condition: { type: "on_owner_salvaged" },
      effectId: "damage_enemy_base_1_uncounterable",
      labelSuffix: "Salvage",
    }],
  },
  relay_savant_card: {
    id: "relay_savant_card",
    name: "Relay Savant",
    faction: "flux_collective",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, flux: 1 },
    text: "Relay (The first time this unit is cascaded each resolution, repeat that cascade from this hex.) Whenever you cast a tactic, Relay Savant deals 1 damage to an enemy unit.",
    play: unitPlay(),
    onResolve: deployUnit("relay_savant_card"),
    unit: {
      role: "utility",
      hp: 4,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["relay"],
    },
    triggers: [{
      condition: { type: "on_owner_tactic_played" },
      effectId: "damage_enemy_unit_1_uncounterable",
      labelSuffix: "Pulse",
      autoTarget: "weakest_enemy_unit",
    }],
  },
  arc_repeater_card: {
    id: "arc_repeater_card",
    name: "Arc Repeater",
    faction: "flux_collective",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, flux: 1 },
    text: "Relay (The first time this unit is cascaded each resolution, repeat that cascade from this hex.) Whenever this unit is cascaded, it deals 1 damage to an enemy unit within 2.",
    play: unitPlay(),
    onResolve: deployUnit("arc_repeater_card"),
    unit: {
      role: "utility",
      hp: 3,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["relay"],
    },
    triggers: [{
      condition: { type: "on_cascaded" },
      effectId: "damage_enemy_unit_1_uncounterable",
      labelSuffix: "Arc",
      autoTarget: "weakest_enemy_unit_in_range_2",
    }],
  },
  foldline_cutter_card: {
    id: "foldline_cutter_card",
    name: "Foldline Cutter",
    faction: "flux_collective",
    kind: "unit",
    speed: "main",
    cost: { credits: 6, flux: 6 },
    text: "Relay (The first time this unit is cascaded each resolution, repeat that cascade from this hex.) Whenever Foldline Cutter is cascaded, it deals 1 damage to the weakest enemy base.",
    play: unitPlay(),
    onResolve: deployUnit("foldline_cutter_card"),
    unit: {
      role: "combat",
      hp: 7,
      attackDamage: 3,
      siegeDamageBonus: 3,
      armor: 0,
      moveRange: 6,
      attackRange: 2,
      attackActionsPerTurn: 1,
      keywords: [RELAY_KEYWORD],
    },
    triggers: [{
      condition: { type: "on_cascaded" },
      effectId: "damage_enemy_base_1_uncounterable",
      labelSuffix: "Cut",
    }],
  },
  forkline_adept_card: {
    id: "forkline_adept_card",
    name: "Forkline Adept",
    faction: "flux_collective",
    kind: "unit",
    speed: "main",
    cost: { credits: 1, flux: 1 },
    text: "Relay (The first time this unit is cascaded each resolution, repeat that cascade from this hex.) Whenever this unit is cascaded, gain 1 flux.",
    play: unitPlay(),
    onResolve: deployUnit("forkline_adept_card"),
    unit: {
      role: "utility",
      hp: 3,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["relay"],
    },
    triggers: [{
      condition: { type: "on_cascaded" },
      effectId: "gain_flux_1_uncounterable",
      labelSuffix: "Fork",
    }],
  },
  surge_archivist_card: {
    id: "surge_archivist_card",
    name: "Surge Archivist",
    faction: "flux_collective",
    kind: "unit",
    speed: "main",
    cost: { credits: 1, flux: 1 },
    text: "Whenever you cast a surged tactic, draw a card.",
    play: unitPlay(),
    onResolve: deployUnit("surge_archivist_card"),
    unit: {
      role: "utility",
      hp: 2,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
    triggers: [{
      condition: { type: "on_owner_surged_tactic_played" },
      effectId: "draw_card_1_uncounterable",
      labelSuffix: "Archive",
    }],
  },
  overcharge_savant_card: {
    id: "overcharge_savant_card",
    name: "Overcharge Savant",
    faction: "flux_collective",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, flux: 1 },
    text: "Whenever you cast a surged tactic, Overcharge Savant deals 1 damage to the weakest enemy base.",
    play: unitPlay(),
    onResolve: deployUnit("overcharge_savant_card"),
    unit: {
      role: "utility",
      hp: 3,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
    triggers: [{
      condition: { type: "on_owner_surged_tactic_played" },
      effectId: "damage_enemy_base_1_uncounterable",
      labelSuffix: "Overcharge",
    }],
  },
  bloom_archivist_card: {
    id: "bloom_archivist_card",
    name: "Bloom Archivist",
    faction: "biomass_swarm",
    kind: "unit",
    speed: "main",
    cost: { credits: 1, biomass: 1 },
    text: "Bloom (The first time this unit is buffed each turn, gain 1 biomass.) Whenever Bloom Archivist blooms, draw a card.",
    play: unitPlay(),
    onResolve: deployUnit("bloom_archivist_card"),
    unit: {
      role: "utility",
      hp: 3,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["bloom"],
    },
    triggers: [{
      condition: { type: "on_self_bloomed" },
      effectId: "draw_card_1_uncounterable",
      labelSuffix: "Archive",
    }],
  },
  compost_broker_card: {
    id: "compost_broker_card",
    name: "Compost Broker",
    faction: "biomass_swarm",
    kind: "unit",
    speed: "main",
    cost: { credits: 1, biomass: 1 },
    text: "Whenever one or more of your units bloom, gain 1 credit.",
    play: unitPlay(),
    onResolve: deployUnit("compost_broker_card"),
    unit: {
      role: "utility",
      hp: 4,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
    triggers: [{
      condition: { type: "on_owner_unit_bloomed" },
      effectId: "gain_credit_1_uncounterable",
      labelSuffix: "Dividend",
    }],
  },
  forge_hauler_card: {
    id: "forge_hauler_card",
    name: "Forge Hauler",
    faction: "alloy_clan",
    kind: "unit",
    speed: "main",
    cost: { alloy: 1 },
    text: "Bastion (While this unit is adjacent to another allied unit, it gets +1 ARM.) Deploy an armored resource unit near your base.",
    play: unitPlay(),
    onResolve: deployUnit("forge_hauler_card"),
    unit: {
      role: "resource",
      hp: 4,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 1,
      moveRange: 4,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["bastion"],
    },
  },
  ion_skimmer_card: {
    id: "ion_skimmer_card",
    name: "Ion Skimmer",
    faction: "flux_collective",
    kind: "unit",
    speed: "main",
    cost: { flux: 1 },
    text: "Deploy a fast resource unit near your base.",
    play: unitPlay(),
    onResolve: deployUnit("ion_skimmer_card"),
    unit: {
      role: "resource",
      hp: 3,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 5,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
  },
  spore_tender_card: {
    id: "spore_tender_card",
    name: "Spore Tender",
    faction: "biomass_swarm",
    kind: "unit",
    speed: "main",
    cost: { biomass: 1 },
    text: "Sprout (can move and attack the turn it enters). Bloom (The first time this unit is buffed each turn, gain 1 biomass.) Deploy a resource unit near your base.",
    play: unitPlay(),
    onResolve: deployUnit("spore_tender_card"),
    unit: {
      role: "resource",
      hp: 4,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 4,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["sprout", "bloom"],
    },
  },
  swarm_harvester_card: {
    id: "swarm_harvester_card",
    name: "Swarm Harvester",
    faction: "biomass_swarm",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, biomass: 1 },
    text: "Sprout (can move and attack the turn it enters). Deploy a resource unit near your base.",
    play: unitPlay(),
    onResolve: deployUnit("swarm_harvester_card"),
    unit: {
      role: "resource",
      hp: 6,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 4,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["sprout"],
    },
  },
  gnawing_collector_card: {
    id: "gnawing_collector_card",
    name: "Gnawing Collector",
    faction: "biomass_swarm",
    kind: "unit",
    speed: "main",
    cost: { credits: 1, biomass: 1 },
    text: "Predation (This resource unit can attack.) When this unit damages an enemy base, gain 1 biomass.",
    play: unitPlay(),
    onResolve: deployUnit("gnawing_collector_card"),
    unit: {
      role: "resource",
      hp: 4,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 4,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["predation"],
    },
    triggers: [{
      condition: { type: "on_self_damaged_enemy_base" },
      effectId: "gain_biomass_1_uncounterable",
      labelSuffix: "Gnaw",
    }],
  },
  support_drone_card: {
    id: "support_drone_card",
    name: "Support Drone",
    faction: "biomass_swarm",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, biomass: 1 },
    text: "Sprout (can move and attack the turn it enters). Bloom (The first time this unit is buffed each turn, gain 1 biomass.) Deploy a biomass skirmisher near your base.",
    play: unitPlay(),
    onResolve: deployUnit("support_drone_card"),
    unit: {
      role: "combat",
      hp: 6,
      attackDamage: 2,
      siegeDamageBonus: 1,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: ["sprout", "bloom"],
    },
  },
  worldroot_colossus_card: {
    id: "worldroot_colossus_card",
    name: "Worldroot Colossus",
    faction: "biomass_swarm",
    kind: "unit",
    speed: "main",
    cost: { credits: 6, biomass: 6 },
    text: "Sprout (can move and attack the turn it enters). Bloom (The first time this unit is buffed each turn, gain 1 biomass.) Deploy a fast bio-siege finisher near your base.",
    play: unitPlay(),
    onResolve: deployUnit("worldroot_colossus_card"),
    unit: {
      role: "combat",
      hp: 10,
      attackDamage: 3,
      siegeDamageBonus: 4,
      armor: 1,
      moveRange: 6,
      attackRange: 1,
      attackActionsPerTurn: 1,
      keywords: [SPROUT_KEYWORD, BLOOM_KEYWORD],
    },
  },
  escort_drone_card: {
    id: "escort_drone_card",
    name: "Escort Drone",
    faction: "neutral",
    kind: "unit",
    speed: "main",
    cost: { credits: 2 },
    text: "Deploy a light combat escort near your base.",
    play: unitPlay(),
    onResolve: deployUnit("escort_drone_card"),
    unit: {
      role: "combat",
      hp: 5,
      attackDamage: 1,
      siegeDamageBonus: 1,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
  },
  expedition_harvester_card: {
    id: "expedition_harvester_card",
    name: "Expedition Harvester",
    faction: "neutral",
    kind: "unit",
    speed: "main",
    cost: { credits: 1 },
    text: "Deploy a light resource unit near your base.",
    play: unitPlay(),
    onResolve: deployUnit("expedition_harvester_card"),
    unit: {
      role: "resource",
      hp: 4,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 4,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
  },
  salvage_hauler_card: {
    id: "salvage_hauler_card",
    name: "Salvage Hauler",
    faction: "neutral",
    kind: "unit",
    speed: "main",
    cost: { credits: 2 },
    text: "Deploy a durable resource unit near your base.",
    play: unitPlay(),
    onResolve: deployUnit("salvage_hauler_card"),
    unit: {
      role: "resource",
      hp: 5,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 4,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
  },
  bulwark_drone_card: {
    id: "bulwark_drone_card",
    name: "Bulwark Drone",
    faction: "neutral",
    kind: "unit",
    speed: "main",
    cost: { credits: 3 },
    text: "Adjacent allied units get +1 ARM.",
    play: unitPlay(),
    onResolve: deployUnit("bulwark_drone_card"),
    unit: {
      role: "utility",
      hp: 6,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 1,
      moveRange: 1,
      attackRange: 1,
      attackActionsPerTurn: 1,
      auras: [{ type: "adjacent_ally_buff", armorBonus: 1 }],
    },
  },
  survey_rover_card: {
    id: "survey_rover_card",
    name: "Survey Rover",
    faction: "neutral",
    kind: "unit",
    speed: "main",
    cost: { credits: 1 },
    text: "Deploy a fast utility scout near your base.",
    play: unitPlay(),
    onResolve: deployUnit("survey_rover_card"),
    unit: {
      role: "utility",
      hp: 3,
      attackDamage: 0,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 4,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
  },
  pathfinder_buggy_card: {
    id: "pathfinder_buggy_card",
    name: "Pathfinder Buggy",
    faction: "neutral",
    kind: "unit",
    speed: "main",
    cost: { credits: 2 },
    text: "Deploy a scouting combat unit near your base.",
    play: unitPlay(),
    onResolve: deployUnit("pathfinder_buggy_card"),
    unit: {
      role: "combat",
      hp: 4,
      attackDamage: 1,
      siegeDamageBonus: 1,
      armor: 0,
      moveRange: 3,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
  },
};
