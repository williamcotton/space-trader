import { getCardDefinition, getUnitCardKeywords } from "../content/cards/catalog";
import { getStackEffectDefinition, getStackEffectMagnitude } from "../content/stackEffects";
import { migrateMechanicState } from "../mechanics";
import { ensureEntityPresentation } from "../presentation";
import { DEFAULT_PLAYER_ORDER, type PlayerId } from "./ids";
import { BASE_STARTING_HP, OPENING_HAND_SIZE, createDefaultGameRules, createInitialZonesForPlayer, syncPlayerZoneCounts } from "./state";
import type { GameState } from "./state";

export const CURRENT_STATE_VERSION = 26;

function inferNextGeneratedIdCounter(state: GameState): number {
  let maxSuffix = 0;

  for (const entityId of Object.keys(state.entities)) {
    const match = entityId.match(/_(\d+)$/);
    if (match) {
      maxSuffix = Math.max(maxSuffix, Number(match[1]));
    }
  }

  for (const stackItem of state.stack) {
    const match = stackItem.id.match(/_(\d+)$/);
    if (match) {
      maxSuffix = Math.max(maxSuffix, Number(match[1]));
    }
  }

  return maxSuffix + 1;
}

function migratePhaseFourHarvesters(state: GameState): void {
  const playerOneHarvesterId = "unit_player_1_harvester";
  const playerTwoHarvesterId = "unit_player_2_harvester";
  const expeditionHarvesterCard = getCardDefinition("expedition_harvester_card");
  const expeditionHarvesterMoveRange =
    expeditionHarvesterCard && expeditionHarvesterCard.kind === "unit" ? expeditionHarvesterCard.unit.moveRange : 3;

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
      moveRange: expeditionHarvesterMoveRange,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: { q: spawn.q, r: spawn.r + 1 },
      keywords: getUnitCardKeywords("expedition_harvester_card"),
      carries: null,
      sourceCardId: "expedition_harvester_card",
      hasSummoningSickness: false,
      movesRemaining: expeditionHarvesterMoveRange,
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
      moveRange: expeditionHarvesterMoveRange,
      attackRange: 1,
      attackActionsPerTurn: 1,
      coord: { q: spawn.q, r: spawn.r - 1 },
      keywords: getUnitCardKeywords("expedition_harvester_card"),
      carries: null,
      sourceCardId: "expedition_harvester_card",
      hasSummoningSickness: false,
      movesRemaining: expeditionHarvesterMoveRange,
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

  if (!Array.isArray((state as GameState & { playerOrder?: unknown }).playerOrder)) {
    state.playerOrder = Object.keys(state.players ?? {}).sort();
    if (state.playerOrder.length === 0) {
      state.playerOrder = [...DEFAULT_PLAYER_ORDER];
    }
  }

  if (!Array.isArray((state as GameState & { eliminatedPlayerIds?: unknown }).eliminatedPlayerIds)) {
    state.eliminatedPlayerIds = [];
  }

  if (typeof state.consecutivePriorityPasses !== "number") {
    state.consecutivePriorityPasses = 0;
  }

  if (typeof (state as GameState & { nextGeneratedIdCounter?: unknown }).nextGeneratedIdCounter !== "number") {
    state.nextGeneratedIdCounter = inferNextGeneratedIdCounter(state);
  }

  if (!state.rules) {
    state.rules = createDefaultGameRules();
  } else {
    const defaultRules = createDefaultGameRules();
    if (typeof (state.rules as typeof state.rules & { currencyDepositAmount?: unknown }).currencyDepositAmount !== "number") {
      state.rules.currencyDepositAmount = defaultRules.currencyDepositAmount;
    }
    if (typeof state.rules.primaryDepositAmount !== "number") {
      state.rules.primaryDepositAmount = defaultRules.primaryDepositAmount;
    }
    if (typeof (state.rules as typeof state.rules & { economyCurrencyIncome?: unknown }).economyCurrencyIncome !== "number") {
      state.rules.economyCurrencyIncome = defaultRules.economyCurrencyIncome;
    }
    if (typeof state.rules.economyPrimaryIncome !== "number") {
      state.rules.economyPrimaryIncome = defaultRules.economyPrimaryIncome;
    }
  }

  if (!Array.isArray(state.tacticalHarvestEligibleUnitIds)) {
    state.tacticalHarvestEligibleUnitIds = [];
  }

  if (!Array.isArray(state.tacticalHarvestedUnitIds)) {
    state.tacticalHarvestedUnitIds = [];
  }

  if (!state.players[state.activePlayerId]) {
    state.activePlayerId = state.playerOrder[0]!;
  }

  if (state.priorityPlayerId && !state.players[state.priorityPlayerId]) {
    state.priorityPlayerId = state.activePlayerId;
  }

  migrateMechanicState(state);

  for (const stackItem of state.stack) {
    if (typeof stackItem.effectId === "undefined") {
      stackItem.effectId = "noop_log";
    }
    if (!Array.isArray(stackItem.activeModifierIds)) {
      stackItem.activeModifierIds = [];
    }
    const definition = getStackEffectDefinition(stackItem.effectId);
    if (typeof stackItem.effectMagnitude !== "number") {
      stackItem.effectMagnitude = getStackEffectMagnitude(
        stackItem.effectId,
        stackItem.sourceCardId,
        stackItem.activeModifierIds
      );
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
      const sourceKeywords = getUnitCardKeywords(entity.sourceCardId);
      if (!Array.isArray(entity.keywords)) {
        entity.keywords = sourceKeywords;
      } else if (sourceKeywords.length > 0) {
        entity.keywords = [...new Set([...entity.keywords, ...sourceKeywords])];
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
    state.zones = {} as GameState["zones"];
  }

  for (const playerId of Object.keys(state.players) as PlayerId[]) {
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
  }

  syncPlayerZoneCounts(state);

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
      text: `State migrated to v${CURRENT_STATE_VERSION} (mechanic state compatibility).`,
    });
  }
}
