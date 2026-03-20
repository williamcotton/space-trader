import type { Faction, ResourceType, UnitRole } from "../../model/enums";

export type CardSpeed = "instant" | "main";

export type CardCost = Partial<Record<ResourceType, number>>;

export type UnitTemplate = {
  role: UnitRole;
  hp: number;
  attackDamage: number;
  siegeDamageBonus: number;
  armor: number;
  moveRange: number;
  attackRange: number;
  attackActionsPerTurn: number;
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
};

export type UnitCardDefinition = CardBase & {
  kind: "unit";
  unit: UnitTemplate;
};

export type CardDefinition = TacticCardDefinition | UnitCardDefinition;

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
  },
  frontline_scout_card: {
    id: "frontline_scout_card",
    name: "Frontline Scout",
    faction: "alloy_clan",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, alloy: 1 },
    text: "Deploy a combat scout near your base.",
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
    unit: {
      role: "combat",
      hp: 5,
      attackDamage: 2,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 3,
      attackRange: 1,
      attackActionsPerTurn: 1,
    },
  },
  swarm_harvester_card: {
    id: "swarm_harvester_card",
    name: "Swarm Harvester",
    faction: "biomass_swarm",
    kind: "unit",
    speed: "main",
    cost: { credits: 2, biomass: 1 },
    text: "Deploy a resource unit near your base.",
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
  support_drone_card: {
    id: "support_drone_card",
    name: "Support Drone",
    faction: "neutral",
    kind: "unit",
    speed: "main",
    cost: { credits: 2 },
    text: "Deploy a utility unit near your base.",
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
  },
  expedition_harvester_card: {
    id: "expedition_harvester_card",
    name: "Expedition Harvester",
    faction: "neutral",
    kind: "unit",
    speed: "main",
    cost: { credits: 1 },
    text: "Deploy a light resource unit near your base.",
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
};

export function getCardDefinition(cardId: string): CardDefinition | undefined {
  return CARD_DEFINITIONS[cardId];
}
