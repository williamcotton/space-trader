import type { Faction, ResourceType, UnitRole } from "../../model/enums";
import type { PlayerId } from "../../model/ids";
import type { EntityState } from "../../model/state";
import type { GameState } from "../../model/state";
import type { GameInstruction, InstructionContext } from "../../actions/instructions";
import { LAYER } from "../../systems/continuousEffects";
import type { CardTrigger } from "../../systems/triggerEngine";

export type TargetPredicate = (
  state: Readonly<GameState>,
  target: EntityState,
  sourcePlayerId: PlayerId
) => boolean;

export type CardSpeed = "instant" | "main";

export type CardCost = Partial<Record<ResourceType, number>>;

export type UnitAura = {
  type: "adjacent_ally_buff";
  targetRole?: UnitRole;
  attackBonus?: number;
  armorBonus?: number;
};

export type UnitTemplate = {
  role: UnitRole;
  hp: number;
  attackDamage: number;
  siegeDamageBonus: number;
  armor: number;
  moveRange: number;
  attackRange: number;
  attackActionsPerTurn: number;
  auras?: UnitAura[];
};

type CardBase = {
  id: string;
  name: string;
  faction: Faction | "neutral";
  speed: CardSpeed;
  cost: CardCost;
  text: string;
};

export type TacticCardDefinition = CardBase & {
  kind: "tactic";
  stackEffectId: string;
  onResolve?: (context: InstructionContext) => GameInstruction[];
  isValidTarget?: TargetPredicate;
  targetHint?: "entity" | "stack_item" | "none";
};

export type AutoTargetStrategy = "weakest_enemy_unit";

export type UnitTrigger = {
  event: "on_owner_tactic_played";
  effectId: string;
  labelSuffix: string;
  autoTarget: AutoTargetStrategy;
};

export type UnitCardDefinition = CardBase & {
  kind: "unit";
  unit: UnitTemplate;
  /** @deprecated Use `triggers` array instead */
  trigger?: UnitTrigger;
  triggers?: CardTrigger[];
  onResolve?: (context: InstructionContext) => GameInstruction[];
  isValidTarget?: TargetPredicate;
  targetHint?: "entity" | "stack_item" | "none";
};

export type CardDefinition = TacticCardDefinition | UnitCardDefinition;

function getOpponentPlayer(playerId: PlayerId): PlayerId {
  return playerId === "player_1" ? "player_2" : "player_1";
}

function getOpponentBaseEntityId(ctx: InstructionContext): string {
  const opponentId = getOpponentPlayer(ctx.controllerId);
  return ctx.state.players[opponentId].baseEntityId;
}

function damageEnemyBase(amount: number, label: string): (ctx: InstructionContext) => GameInstruction[] {
  return (ctx) => [
    { type: "DEAL_DAMAGE", targetEntityId: getOpponentBaseEntityId(ctx), amount, sourceLabel: label },
  ];
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

export const CARD_DEFINITIONS: Record<string, CardDefinition> = {
  orbital_ping: {
    id: "orbital_ping",
    name: "Orbital Ping",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, flux: 1 },
    text: "Deal 2 damage to enemy base.",
    stackEffectId: "damage_enemy_base_2",
    onResolve: damageEnemyBase(2, "Orbital Ping"),
  },
  slag_barrage: {
    id: "slag_barrage",
    name: "Slag Barrage",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, alloy: 1 },
    text: "Deal 2 damage to enemy base.",
    stackEffectId: "damage_enemy_base_2",
    onResolve: damageEnemyBase(2, "Slag Barrage"),
  },
  spore_burst: {
    id: "spore_burst",
    name: "Spore Burst",
    faction: "biomass_swarm",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, biomass: 1 },
    text: "Deal 2 damage to enemy base.",
    stackEffectId: "damage_enemy_base_2",
    onResolve: damageEnemyBase(2, "Spore Burst"),
  },
  counter_pulse: {
    id: "counter_pulse",
    name: "Counter Pulse",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, flux: 1 },
    text: "Counter target top stack item.",
    stackEffectId: "counter_top_item",
    onResolve: counterStackItem("discard", "Counter Pulse"),
  },
  null_intercept: {
    id: "null_intercept",
    name: "Null Intercept",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2 },
    text: "Counter target top stack item.",
    stackEffectId: "counter_top_item",
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
    stackEffectId: "counter_to_hand",
    onResolve: counterStackItem("hand", "Echo Recall"),
  },
  patchwork_barrier: {
    id: "patchwork_barrier",
    name: "Patchwork Barrier",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, alloy: 1 },
    text: "Counter target top stack item.",
    stackEffectId: "counter_top_item",
    onResolve: counterStackItem("discard", "Patchwork Barrier"),
  },
  brace_protocol: {
    id: "brace_protocol",
    name: "Brace Protocol",
    faction: "alloy_clan",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, alloy: 1 },
    text: "Target allied unit gets +2 ARM until end of turn.",
    stackEffectId: "armor_ally_unit_2_eot",
    isValidTarget: (_state, target, pid) =>
      target.kind === "unit" && target.ownerId === pid,
    targetHint: "entity",
    onResolve: (ctx) => {
      if (!ctx.targetEntityId) return [{ type: "LOG", text: "Brace Protocol: no target." }];
      return [{
        type: "APPLY_CONTINUOUS_EFFECT",
        effectId: `ce_brace_${ctx.item.id}`,
        sourceEntityId: null,
        sourceCardId: "brace_protocol",
        controllerId: ctx.controllerId,
        payload: { type: "stat_modifier", stat: "armor", amount: 2 },
        target: { type: "specific_entity", entityId: ctx.targetEntityId },
        expiry: { type: "end_of_turn", turn: ctx.state.turn },
        layer: LAYER.TEMPORARY,
      }];
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
    stackEffectId: "damage_enemy_entity_2",
    onResolve: damageTargetEntity(2, "Rivet Volley"),
    isValidTarget: (_state, target, pid) =>
      target.ownerId !== pid,
    targetHint: "entity",
  },
  neural_echo: {
    id: "neural_echo",
    name: "Neural Echo",
    faction: "biomass_swarm",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, biomass: 1 },
    text: "Counter target top stack item and return it to hand.",
    stackEffectId: "counter_to_hand",
    onResolve: counterStackItem("hand", "Neural Echo"),
  },
  emergency_thrust: {
    id: "emergency_thrust",
    name: "Emergency Thrust",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1 },
    text: "Deal 2 damage to enemy base.",
    stackEffectId: "damage_enemy_base_2",
    onResolve: damageEnemyBase(2, "Emergency Thrust"),
  },
  jammer_cloud: {
    id: "jammer_cloud",
    name: "Jammer Cloud",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2 },
    text: "Counter target top stack item.",
    stackEffectId: "counter_top_item",
    onResolve: counterStackItem("discard", "Jammer Cloud"),
  },
  failsafe_redirect: {
    id: "failsafe_redirect",
    name: "Failsafe Redirect",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2 },
    text: "Counter target top stack item and return it to hand.",
    stackEffectId: "counter_to_hand",
    onResolve: counterStackItem("hand", "Failsafe Redirect"),
  },
  scrap_burst: {
    id: "scrap_burst",
    name: "Scrap Burst",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2 },
    text: "Deal 2 damage to enemy base.",
    stackEffectId: "damage_enemy_base_2",
    onResolve: damageEnemyBase(2, "Scrap Burst"),
  },
  holdfast_protocol: {
    id: "holdfast_protocol",
    name: "Holdfast Protocol",
    faction: "neutral",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2 },
    text: "Counter target top stack item.",
    stackEffectId: "counter_top_item",
    onResolve: counterStackItem("discard", "Holdfast Protocol"),
  },
  arc_snap: {
    id: "arc_snap",
    name: "Arc Snap",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 1, flux: 1 },
    text: "Deal 2 damage to target enemy unit.",
    stackEffectId: "damage_enemy_unit_2",
    onResolve: damageTargetEntity(2, "Arc Snap"),
    isValidTarget: (_state, target, pid) =>
      target.kind === "unit" && target.ownerId !== pid,
    targetHint: "entity",
  },
  overload_finish: {
    id: "overload_finish",
    name: "Overload Finish",
    faction: "flux_collective",
    kind: "tactic",
    speed: "instant",
    cost: { credits: 2, flux: 1 },
    text: "Destroy target damaged enemy unit.",
    stackEffectId: "destroy_damaged_enemy_unit",
    isValidTarget: (_state, target, pid) =>
      target.kind === "unit" && target.ownerId !== pid && target.hp < target.maxHp,
    targetHint: "entity",
    onResolve: (ctx) => {
      if (!ctx.targetEntityId) return [{ type: "LOG", text: "Overload Finish: no target." }];
      const target = ctx.state.entities[ctx.targetEntityId];
      if (!target || target.kind !== "unit" || target.hp >= target.maxHp) {
        return [{ type: "LOG", text: `Overload Finish: target ${ctx.targetEntityId} was no longer damaged.` }];
      }
      return [{ type: "DESTROY_ENTITY", targetEntityId: ctx.targetEntityId, sourceLabel: "Overload Finish" }];
    },
  },
  frontline_scout_card: {
    id: "frontline_scout_card",
    name: "Frontline Scout",
    faction: "alloy_clan",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, alloy: 1 },
    text: "Deploy a combat scout near your base.",
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
    },
  },
  alloy_guard_card: {
    id: "alloy_guard_card",
    name: "Alloy Guard",
    faction: "alloy_clan",
    kind: "unit",
    speed: "main",
    cost: { credits: 3, alloy: 2 },
    text: "Deploy an armored combat unit near your base.",
    onResolve: deployUnit("alloy_guard_card"),
    unit: {
      role: "combat",
      hp: 8,
      attackDamage: 2,
      siegeDamageBonus: 2,
      armor: 1,
      moveRange: 1,
      attackRange: 1,
      attackActionsPerTurn: 1,
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
  relay_savant_card: {
    id: "relay_savant_card",
    name: "Relay Savant",
    faction: "flux_collective",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, flux: 1 },
    text: "Whenever you cast a tactic, Relay Savant deals 1 damage to an enemy unit.",
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
    },
    triggers: [{
      condition: { type: "on_owner_tactic_played" },
      effectId: "damage_enemy_unit_1_uncounterable",
      labelSuffix: "Pulse",
      autoTarget: "weakest_enemy_unit",
    }],
  },
  swarm_harvester_card: {
    id: "swarm_harvester_card",
    name: "Swarm Harvester",
    faction: "biomass_swarm",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, biomass: 1 },
    text: "Deploy a resource unit near your base.",
    onResolve: deployUnit("swarm_harvester_card"),
    unit: {
      role: "resource",
      hp: 6,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
  },
  support_drone_card: {
    id: "support_drone_card",
    name: "Support Drone",
    faction: "biomass_swarm",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, biomass: 1 },
    text: "Deploy a biomass skirmisher near your base.",
    onResolve: deployUnit("support_drone_card"),
    unit: {
      role: "combat",
      hp: 5,
      attackDamage: 2,
      siegeDamageBonus: 1,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
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
    onResolve: deployUnit("expedition_harvester_card"),
    unit: {
      role: "resource",
      hp: 4,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
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
    onResolve: deployUnit("salvage_hauler_card"),
    unit: {
      role: "resource",
      hp: 5,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
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
    text: "Deploy a durable utility drone near your base.",
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

export function getCardDefinition(cardId: string): CardDefinition | undefined {
  return CARD_DEFINITIONS[cardId];
}
