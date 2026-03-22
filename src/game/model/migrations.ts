import { getCardDefinition, getUnitCardKeywords } from "../content/cards/catalog";
import { getStackEffectDefinition, getStackEffectMagnitude } from "../content/stackEffects";
import { ensureEntityPresentation } from "../presentation";
import { BASE_STARTING_HP, OPENING_HAND_SIZE, createInitialZonesForPlayer } from "./state";
import type { GameState } from "./state";

export const CURRENT_STATE_VERSION = 19;

function migratePhaseFourHarvesters(state: GameState): void {
  const playerOneHarvesterId = "unit_player_1_harvester";
  const playerTwoHarvesterId = "unit_player_2_harvester";

  if (!state.entities[playerOneHarvesterId]) {
    const spawn = state.map.spawnPoints.player_1;
    state.entities[playerOneHarvesterId] = {
      id: playerOneHarvesterId,
      kind: "unit",
      name: "Expedition Harvester",
      ownerId: "player_1",
      role: "resource",
      hp: 5,
      maxHp: 5,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: { q: spawn.q, r: spawn.r + 1 },
      keywords: getUnitCardKeywords("expedition_harvester_card"),
      carries: null,
      sourceCardId: "expedition_harvester_card",
      hasSummoningSickness: false,
      movesRemaining: 2,
      attacksRemaining: 1,
      temporaryAttackBonus: 0,
      temporaryArmorBonus: 0,
    };
  }

  if (!state.entities[playerTwoHarvesterId]) {
    const spawn = state.map.spawnPoints.player_2;
    state.entities[playerTwoHarvesterId] = {
      id: playerTwoHarvesterId,
      kind: "unit",
      name: "Expedition Harvester",
      ownerId: "player_2",
      role: "resource",
      hp: 5,
      maxHp: 5,
      attackDamage: 1,
      siegeDamageBonus: 0,
      armor: 0,
      moveRange: 2,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: { q: spawn.q, r: spawn.r - 1 },
      keywords: getUnitCardKeywords("expedition_harvester_card"),
      carries: null,
      sourceCardId: "expedition_harvester_card",
      hasSummoningSickness: false,
      movesRemaining: 2,
      attacksRemaining: 1,
      temporaryAttackBonus: 0,
      temporaryArmorBonus: 0,
    };
  }
}

export function migrateRuntimeState(state: GameState): void {
  if (typeof state.stateVersion !== "number") {
    state.stateVersion = 0;
  }

  if (typeof state.consecutivePriorityPasses !== "number") {
    state.consecutivePriorityPasses = 0;
  }

  if (typeof state.hoveredHex === "undefined") {
    state.hoveredHex = null;
  }

  if (!Array.isArray(state.tacticalHarvestEligibleUnitIds)) {
    state.tacticalHarvestEligibleUnitIds = [];
  }

  if (!Array.isArray(state.tacticalHarvestedUnitIds)) {
    state.tacticalHarvestedUnitIds = [];
  }

  for (const stackItem of state.stack) {
    if (typeof stackItem.effectId === "undefined") {
      stackItem.effectId = "noop_log";
    }
    const definition = getStackEffectDefinition(stackItem.effectId);
    if (typeof stackItem.effectMagnitude !== "number") {
      stackItem.effectMagnitude = getStackEffectMagnitude(stackItem.effectId);
    }
    if (typeof stackItem.targetStackItemId === "undefined") {
      stackItem.targetStackItemId = null;
    }
    if (typeof stackItem.targetEntityId === "undefined") {
      stackItem.targetEntityId = null;
    }
    if (typeof stackItem.targetHex === "undefined") {
      stackItem.targetHex = null;
    }
    if (typeof stackItem.ownerId === "undefined") {
      stackItem.ownerId = stackItem.controllerId;
    }
    if (typeof stackItem.objectKind === "undefined") {
      stackItem.objectKind = definition?.object.kind ?? "ability";
    }
    if (typeof stackItem.counterable === "undefined") {
      stackItem.counterable = definition?.object.counterable ?? false;
    }
    if (typeof stackItem.defaultCounterDestination === "undefined") {
      stackItem.defaultCounterDestination = definition?.object.defaultCounterDestination ?? "none";
    }
    if (typeof stackItem.sourceCardInstanceId === "undefined") {
      stackItem.sourceCardInstanceId = null;
    }
    if (typeof stackItem.sourceCardId === "undefined") {
      stackItem.sourceCardId = null;
    }
    if (typeof stackItem.sourceCardOwnerId === "undefined") {
      stackItem.sourceCardOwnerId = null;
    }
    if (typeof stackItem.pendingUnitEntityId === "undefined") {
      stackItem.pendingUnitEntityId = null;
    }
  }

  for (const entity of Object.values(state.entities)) {
    ensureEntityPresentation(entity, state);

    if (typeof entity.maxHp !== "number") {
      entity.maxHp = entity.hp;
    }

    if (state.stateVersion < CURRENT_STATE_VERSION && entity.kind === "base") {
      const previousMaxHp = entity.maxHp > 0 ? entity.maxHp : entity.hp;
      const hpRatio = previousMaxHp > 0 ? entity.hp / previousMaxHp : 1;
      entity.maxHp = BASE_STARTING_HP;
      entity.hp = entity.hp <= 0 ? 0 : Math.max(1, Math.round(BASE_STARTING_HP * hpRatio));
    }

    if (entity.kind === "unit") {
      const sourceCardId = entity.sourceCardId;
      const sourceCard = sourceCardId ? getCardDefinition(sourceCardId) : undefined;
      const defaultSiegeDamageBonus =
        sourceCard && sourceCard.kind === "unit" ? sourceCard.unit.siegeDamageBonus : entity.role === "combat" ? 1 : 0;

      if (state.stateVersion < CURRENT_STATE_VERSION || typeof entity.siegeDamageBonus !== "number") {
        entity.siegeDamageBonus = defaultSiegeDamageBonus;
      }
      if (typeof entity.carries === "undefined") {
        entity.carries = null;
      }
      if (!Array.isArray(entity.keywords)) {
        entity.keywords = getUnitCardKeywords(entity.sourceCardId);
      }
      if (typeof entity.temporaryAttackBonus !== "number") {
        entity.temporaryAttackBonus = 0;
      }
      if (typeof entity.temporaryArmorBonus !== "number") {
        entity.temporaryArmorBonus = 0;
      }
    }
  }

  migratePhaseFourHarvesters(state);

  if (typeof state.zones === "undefined") {
    state.zones = {
      player_1: createInitialZonesForPlayer("player_1", state.players.player_1.faction, state.players.player_1.handSize || OPENING_HAND_SIZE),
      player_2: createInitialZonesForPlayer("player_2", state.players.player_2.faction, state.players.player_2.handSize || OPENING_HAND_SIZE),
    };
  }

  for (const playerId of ["player_1", "player_2"] as const) {
    if (!state.zones[playerId]) {
      state.zones[playerId] = createInitialZonesForPlayer(
        playerId,
        state.players[playerId].faction,
        state.players[playerId].handSize || OPENING_HAND_SIZE
      );
    }
    if (!Array.isArray(state.zones[playerId].deck)) {
      state.zones[playerId].deck = [];
    }
    if (!Array.isArray(state.zones[playerId].hand)) {
      state.zones[playerId].hand = [];
    }
    if (!Array.isArray(state.zones[playerId].discard)) {
      state.zones[playerId].discard = [];
    }
    if (!Array.isArray(state.zones[playerId].exile)) {
      state.zones[playerId].exile = [];
    }

    state.players[playerId].handSize = state.zones[playerId].hand.length;
    state.players[playerId].deckSize = state.zones[playerId].deck.length;
  }

  if (!Array.isArray(state.continuousEffects)) {
    state.continuousEffects = [];
  }
  if (typeof state.effectTimestampCounter !== "number") {
    state.effectTimestampCounter = 0;
  }

  if (state.stateVersion < CURRENT_STATE_VERSION) {
    state.stateVersion = CURRENT_STATE_VERSION;
    state.log.push({
      turn: state.turn,
      text: "State migrated to v19 (hex target support).",
    });
  }
}
