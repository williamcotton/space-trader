import { getCardDefinition, getUnitCardKeywords } from "../content/cards/catalog";
import type { CounterDestination } from "../content/stackEffects";
import type { GameState, CardInstance } from "../model/state";
import { syncPlayerZoneCounts } from "../model/state";
import type { PlayerId } from "../model/ids";
import { getFirstOpenBaseAdjacentTile } from "../model/queries";
import {
  createContinuousEffectId,
  LAYER,
  nextEffectTimestamp,
  removeEffectsForEntity,
} from "../systems/continuousEffects";
import { removeStackItemById } from "../turn/stack";
import type { GameInstruction } from "./instructions";
import { drawCardForPlayer } from "./handlers/cards";
import { applyReplacementEffects } from "../systems/replacementEngine";

// --- Internal helpers (extracted from handlers/cards.ts) ---

function destroyUnitInternal(state: GameState, unitId: string, reasonText: string): void {
  const target = state.entities[unitId];
  if (!target || target.kind !== "unit") return;

  if (target.carries) {
    state.log.push({
      turn: state.turn,
      text: `${target.id} was destroyed and cargo lost (${target.carries}).`,
    });
  }
  if (state.selectedEntityId === target.id) {
    state.selectedEntityId = null;
  }
  removeEffectsForEntity(state, target.id);
  delete state.entities[target.id];
  state.log.push({ turn: state.turn, text: reasonText });
}

function deployUnitInternal(
  state: GameState,
  cardId: string,
  controllerId: PlayerId,
  entityId: string | undefined,
  spawnCoord: { q: number; r: number } | undefined
): void {
  const cardDefinition = getCardDefinition(cardId);
  if (!cardDefinition || cardDefinition.kind !== "unit") return;

  const coord = spawnCoord ?? getFirstOpenBaseAdjacentTile(state, controllerId);
  if (!coord) {
    state.log.push({
      turn: state.turn,
      text: `Deploy ${cardDefinition.name}: no open base-adjacent tile; failed.`,
    });
    return;
  }

  const suffix = Object.keys(state.entities).length + state.log.length + state.turn;
  const unitEntityId = entityId ?? `unit_${controllerId}_${cardId}_${suffix}`;

  state.entities[unitEntityId] = {
    id: unitEntityId,
    kind: "unit",
    name: cardDefinition.name,
    ownerId: controllerId,
    role: cardDefinition.unit.role,
    hp: cardDefinition.unit.hp,
    maxHp: cardDefinition.unit.hp,
    attackDamage: cardDefinition.unit.attackDamage,
    siegeDamageBonus: cardDefinition.unit.siegeDamageBonus,
    armor: cardDefinition.unit.armor,
    moveRange: cardDefinition.unit.moveRange,
    attackRange: cardDefinition.unit.attackRange,
    attackActionsPerTurn: cardDefinition.unit.attackActionsPerTurn,
    coord: { ...coord },
    keywords: getUnitCardKeywords(cardId),
    carries: null,
    sourceCardId: cardId,
    hasSummoningSickness: true,
    movesRemaining: 0,
    attacksRemaining: 0,
    temporaryAttackBonus: 0,
    temporaryArmorBonus: 0,
  };

  if (cardDefinition.unit.auras) {
    for (const aura of cardDefinition.unit.auras) {
      if (aura.attackBonus) {
        const ts = nextEffectTimestamp(state);
        state.continuousEffects.push({
          id: createContinuousEffectId(state, `${unitEntityId}_aura_atk`),
          sourceEntityId: unitEntityId,
          sourceCardId: cardId,
          controllerId,
          payload: { type: "stat_modifier", stat: "attackDamage", amount: aura.attackBonus },
          target: { type: "adjacent_allies", sourceEntityId: unitEntityId, roleFilter: aura.targetRole },
          expiry: { type: "while_source_alive", sourceEntityId: unitEntityId },
          layer: LAYER.STATIC,
          timestamp: ts,
        });
      }
      if (aura.armorBonus) {
        const ts = nextEffectTimestamp(state);
        state.continuousEffects.push({
          id: createContinuousEffectId(state, `${unitEntityId}_aura_arm`),
          sourceEntityId: unitEntityId,
          sourceCardId: cardId,
          controllerId,
          payload: { type: "stat_modifier", stat: "armor", amount: aura.armorBonus },
          target: { type: "adjacent_allies", sourceEntityId: unitEntityId, roleFilter: aura.targetRole },
          expiry: { type: "while_source_alive", sourceEntityId: unitEntityId },
          layer: LAYER.STATIC,
          timestamp: ts,
        });
      }
    }
  }

  state.log.push({
    turn: state.turn,
    text: `${controllerId} deployed ${cardDefinition.name} to (${coord.q}, ${coord.r}).`,
  });
}

function moveStackSourceCardToZoneInternal(
  state: GameState,
  stackItem: GameState["stack"][number],
  destination: "hand" | "discard" | "exile" | "none"
): void {
  if (destination === "none") return;
  if (!stackItem.sourceCardInstanceId || !stackItem.sourceCardId || !stackItem.sourceCardOwnerId) return;

  const card: CardInstance = {
    instanceId: stackItem.sourceCardInstanceId,
    cardId: stackItem.sourceCardId,
    ownerId: stackItem.sourceCardOwnerId,
  };
  state.zones[stackItem.sourceCardOwnerId][destination].push(card);
  syncPlayerZoneCounts(state);
}

// --- Per-instruction handlers ---

function handleDealDamage(state: GameState, instr: Extract<GameInstruction, { type: "DEAL_DAMAGE" }>): void {
  const target = state.entities[instr.targetEntityId];
  if (!target) {
    state.log.push({ turn: state.turn, text: `${instr.sourceLabel}: target entity not found.` });
    return;
  }

  const beforeHp = target.hp;
  target.hp = Math.max(0, target.hp - instr.amount);
  state.log.push({
    turn: state.turn,
    text: `${instr.sourceLabel}: dealt ${instr.amount} to ${instr.targetEntityId} (${beforeHp} -> ${target.hp}).`,
  });

  if (target.kind === "unit" && target.hp === 0) {
    destroyUnitInternal(state, target.id, `${target.id} was destroyed.`);
  }
}

function handleDestroyEntity(state: GameState, instr: Extract<GameInstruction, { type: "DESTROY_ENTITY" }>): void {
  const target = state.entities[instr.targetEntityId];
  if (!target || target.kind !== "unit") {
    state.log.push({ turn: state.turn, text: `${instr.sourceLabel}: target unit not found.` });
    return;
  }
  destroyUnitInternal(state, target.id, `${instr.sourceLabel} destroyed ${target.id}.`);
}

function handleDeployUnit(state: GameState, instr: Extract<GameInstruction, { type: "DEPLOY_UNIT" }>): void {
  deployUnitInternal(state, instr.cardId, instr.controllerId, instr.entityId, instr.spawnCoord);
}

function handleApplyContinuousEffect(
  state: GameState,
  instr: Extract<GameInstruction, { type: "APPLY_CONTINUOUS_EFFECT" }>
): void {
  const ts = nextEffectTimestamp(state);
  state.continuousEffects.push({
    id: instr.effectId,
    sourceEntityId: instr.sourceEntityId,
    sourceCardId: instr.sourceCardId,
    controllerId: instr.controllerId,
    payload: instr.payload,
    target: instr.target,
    expiry: instr.expiry,
    layer: instr.layer,
    timestamp: ts,
  });
}

function handleDrawCards(state: GameState, instr: Extract<GameInstruction, { type: "DRAW_CARDS" }>): void {
  for (let i = 0; i < instr.count; i++) {
    drawCardForPlayer(state, instr.playerId, "start_phase_draw");
  }
}

function handleGainResources(state: GameState, instr: Extract<GameInstruction, { type: "GAIN_RESOURCES" }>): void {
  const pool = state.players[instr.playerId].resources;
  for (const [resource, amount] of Object.entries(instr.resources)) {
    if (amount) {
      pool[resource as keyof typeof pool] += amount;
    }
  }
}

function handleCounterStackItem(
  state: GameState,
  instr: Extract<GameInstruction, { type: "COUNTER_STACK_ITEM" }>
): void {
  const countered = removeStackItemById(state.stack, instr.targetStackItemId);
  if (!countered) {
    state.log.push({ turn: state.turn, text: `${instr.sourceLabel}: target stack item not found.` });
    return;
  }

  const destination: CounterDestination =
    instr.destination === "none" ? countered.defaultCounterDestination : instr.destination;
  moveStackSourceCardToZoneInternal(state, countered, destination);
  state.log.push({
    turn: state.turn,
    text: `${instr.sourceLabel}: countered ${countered.label} -> ${destination}.`,
  });
}

function handleLog(state: GameState, instr: Extract<GameInstruction, { type: "LOG" }>): void {
  state.log.push({ turn: state.turn, text: instr.text });
}

// --- Single instruction dispatcher ---

function executeSingleInstruction(state: GameState, instr: GameInstruction): void {
  switch (instr.type) {
    case "DEAL_DAMAGE":
      handleDealDamage(state, instr);
      break;
    case "DESTROY_ENTITY":
      handleDestroyEntity(state, instr);
      break;
    case "DEPLOY_UNIT":
      handleDeployUnit(state, instr);
      break;
    case "APPLY_CONTINUOUS_EFFECT":
      handleApplyContinuousEffect(state, instr);
      break;
    case "DRAW_CARDS":
      handleDrawCards(state, instr);
      break;
    case "GAIN_RESOURCES":
      handleGainResources(state, instr);
      break;
    case "COUNTER_STACK_ITEM":
      handleCounterStackItem(state, instr);
      break;
    case "LOG":
      handleLog(state, instr);
      break;
  }
}

// --- Executor with replacement effect interception ---

export function executeInstructions(state: GameState, instructions: GameInstruction[]): void {
  for (const instr of instructions) {
    const replaced = applyReplacementEffects(state, instr);
    for (const r of replaced) {
      executeSingleInstruction(state, r);
    }
  }
}
