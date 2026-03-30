import { describe, expect, it } from "vitest";
import { getCardDefinition, type UnitCardDefinition } from "../content/cards/catalog";
import { requireMapDefinition } from "../content/maps/catalog";
import { getLastBloomedUnitIds, setLastBloomSourceItemId } from "../content/sets/base/mechanics/bloom";
import { createInitialGameState } from "../model/state";
import { evaluateTriggersFromEvent, resetTriggerDepth, incrementTriggerDepth } from "./triggerEngine";
import type { CardPlayedToStackEvent, GameEvent } from "../actions/events";
import { dispatchCommand } from "../actions/reducers";

function createState() {
  return createInitialGameState({ map: requireMapDefinition("frontier_belt") });
}

function moveCardFromDeckToHand(state: ReturnType<typeof createState>, playerId: "player_1" | "player_2", cardId: string) {
  const deck = state.zones[playerId].deck;
  const idx = deck.findIndex((c) => c.cardId === cardId);
  if (idx < 0) throw new Error(`Card ${cardId} not found in ${playerId} deck.`);
  const [card] = deck.splice(idx, 1);
  state.zones[playerId].hand.push(card);
  return card.instanceId;
}

describe("triggerEngine", () => {
  describe("evaluateTriggersFromEvent", () => {
    it("fires on_owner_tactic_played for relay savant", () => {
      const state = createState();
      // Deploy a relay savant manually
      state.entities["unit_player_1_relay"] = {
        id: "unit_player_1_relay",
        kind: "unit",
        name: "Relay Savant",
        ownerId: "player_1",
        role: "utility",
        hp: 4,
        maxHp: 4,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        carries: null,
        sourceCardId: "relay_savant_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      const tacticEvent: CardPlayedToStackEvent = {
        type: "CARD_PLAYED_TO_STACK",
        playerId: "player_1",
        cardInstanceId: "test_card",
        cardId: "orbital_ping",
        cardName: "Orbital Ping",
        cost: { credits: 1, flux: 1 },
        stackItemId: "stack_1",
        effectId: "damage_enemy_base_2",
        effectMagnitude: 2,
        targetStackItemId: null,
        targetEntityId: null,
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        nextPriorityPlayerId: "player_2",
        pendingUnitEntityId: null,
      };

      resetTriggerDepth();
      incrementTriggerDepth();
      const triggered = evaluateTriggersFromEvent(state, tacticEvent);

      expect(triggered).toHaveLength(1);
      expect(triggered[0].type).toBe("STACK_ITEM_PUSHED");
      expect(triggered[0].label).toContain("Relay Savant");
      expect(triggered[0].label).toContain("Pulse");
      expect(triggered[0].effectId).toBe("damage_enemy_unit_1_uncounterable");
      expect(triggered[0].counterable).toBe(false);
      // Should target an enemy unit
      expect(triggered[0].targetEntityId).toBeTruthy();
    });

    it("fires on_owner_surged_tactic_played for Surge Archivist", () => {
      const state = createState();
      state.entities.unit_player_1_archivist = {
        id: "unit_player_1_archivist",
        kind: "unit",
        name: "Surge Archivist",
        ownerId: "player_1",
        role: "utility",
        hp: 2,
        maxHp: 2,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        carries: null,
        sourceCardId: "surge_archivist_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      const surgedTacticEvent: CardPlayedToStackEvent = {
        type: "CARD_PLAYED_TO_STACK",
        playerId: "player_1",
        cardInstanceId: "test_card",
        cardId: "ion_surge_archive",
        cardName: "Ion Surge Archive",
        cost: { credits: 3, flux: 2 },
        stackItemId: "stack_1",
        effectId: "draw_and_gain_resources",
        effectMagnitude: 5,
        activeModifierIds: ["surge"],
        targetStackItemId: null,
        targetEntityId: null,
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        nextPriorityPlayerId: "player_2",
        pendingUnitEntityId: null,
      };

      resetTriggerDepth();
      incrementTriggerDepth();
      const triggered = evaluateTriggersFromEvent(state, surgedTacticEvent);

      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.effectId).toBe("draw_card_1_uncounterable");
      expect(triggered[0]?.targetEntityId).toBeNull();
      expect(triggered[0]?.counterable).toBe(false);
    });

    it("does not fire when owner is not the tactic player", () => {
      const state = createState();
      state.entities["unit_player_1_relay"] = {
        id: "unit_player_1_relay",
        kind: "unit",
        name: "Relay Savant",
        ownerId: "player_1",
        role: "utility",
        hp: 4,
        maxHp: 4,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        carries: null,
        sourceCardId: "relay_savant_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      const enemyTacticEvent: CardPlayedToStackEvent = {
        type: "CARD_PLAYED_TO_STACK",
        playerId: "player_2",
        cardInstanceId: "test_card",
        cardId: "slag_barrage",
        cardName: "Slag Barrage",
        cost: { credits: 1, alloy: 1 },
        stackItemId: "stack_1",
        effectId: "damage_enemy_base_2",
        effectMagnitude: 2,
        targetStackItemId: null,
        targetEntityId: null,
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        nextPriorityPlayerId: "player_1",
        pendingUnitEntityId: null,
      };

      resetTriggerDepth();
      incrementTriggerDepth();
      const triggered = evaluateTriggersFromEvent(state, enemyTacticEvent);
      expect(triggered).toHaveLength(0);
    });

    it("does not fire surge payoffs for non-surged tactics", () => {
      const state = createState();
      state.entities.unit_player_1_archivist = {
        id: "unit_player_1_archivist",
        kind: "unit",
        name: "Surge Archivist",
        ownerId: "player_1",
        role: "utility",
        hp: 2,
        maxHp: 2,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        carries: null,
        sourceCardId: "surge_archivist_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      const regularTacticEvent: CardPlayedToStackEvent = {
        type: "CARD_PLAYED_TO_STACK",
        playerId: "player_1",
        cardInstanceId: "test_card",
        cardId: "static_insight",
        cardName: "Static Insight",
        cost: { flux: 1 },
        stackItemId: "stack_1",
        effectId: "draw_and_gain_resources",
        effectMagnitude: 1,
        activeModifierIds: [],
        targetStackItemId: null,
        targetEntityId: null,
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        nextPriorityPlayerId: "player_2",
        pendingUnitEntityId: null,
      };

      resetTriggerDepth();
      incrementTriggerDepth();
      const triggered = evaluateTriggersFromEvent(state, regularTacticEvent);
      expect(triggered).toHaveLength(0);
    });

    it("fires on_self_bloomed for Bloom Archivist", () => {
      const state = createState();
      state.entities.unit_player_1_bloom_archivist = {
        id: "unit_player_1_bloom_archivist",
        kind: "unit",
        name: "Bloom Archivist",
        ownerId: "player_1",
        role: "utility",
        hp: 3,
        maxHp: 3,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        keywords: ["bloom"],
        carries: null,
        sourceCardId: "bloom_archivist_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };
      setLastBloomSourceItemId(state, "stack_bloom_1");
      getLastBloomedUnitIds(state).push("unit_player_1_bloom_archivist");

      const bloomEvent: GameEvent = {
        type: "STACK_ITEM_RESOLVED",
        itemId: "stack_bloom_1",
        label: "Overgrowth Wave",
        controllerId: "player_1",
        ownerId: "player_1",
        effectId: "global_unit_buff",
        effectMagnitude: 1,
        targetStackItemId: null,
        targetEntityId: null,
        targetHex: null,
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        sourceCardInstanceId: null,
        sourceCardId: "overgrowth_wave",
        sourceCardOwnerId: "player_1",
        pendingUnitEntityId: null,
      };

      resetTriggerDepth();
      incrementTriggerDepth();
      const triggered = evaluateTriggersFromEvent(state, bloomEvent);

      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.effectId).toBe("draw_card_1_uncounterable");
    });

    it("fires on_owner_unit_bloomed for Compost Broker", () => {
      const state = createState();
      state.entities.unit_player_1_compost_broker = {
        id: "unit_player_1_compost_broker",
        kind: "unit",
        name: "Compost Broker",
        ownerId: "player_1",
        role: "utility",
        hp: 4,
        maxHp: 4,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        carries: null,
        sourceCardId: "compost_broker_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };
      state.entities.unit_player_1_bloom_target = {
        id: "unit_player_1_bloom_target",
        kind: "unit",
        name: "Support Drone",
        ownerId: "player_1",
        role: "combat",
        hp: 6,
        maxHp: 6,
        attackDamage: 2,
        siegeDamageBonus: 1,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 1, r: 0 },
        keywords: ["sprout", "bloom"],
        carries: null,
        sourceCardId: "support_drone_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };
      setLastBloomSourceItemId(state, "stack_bloom_2");
      getLastBloomedUnitIds(state).push("unit_player_1_bloom_target");

      const bloomEvent: GameEvent = {
        type: "STACK_ITEM_RESOLVED",
        itemId: "stack_bloom_2",
        label: "Spore Bloom",
        controllerId: "player_1",
        ownerId: "player_1",
        effectId: "cascade_unit_buff",
        effectMagnitude: 1,
        targetStackItemId: null,
        targetEntityId: null,
        targetHex: { q: 1, r: 0 },
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        sourceCardInstanceId: null,
        sourceCardId: "spore_bloom",
        sourceCardOwnerId: "player_1",
        pendingUnitEntityId: null,
      };

      resetTriggerDepth();
      incrementTriggerDepth();
      const triggered = evaluateTriggersFromEvent(state, bloomEvent);

      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.effectId).toBe("gain_credit_1_uncounterable");
    });

    it("fires on_owner_salvaged for Scrap Quartermaster", () => {
      const state = createState();
      state.entities.unit_player_1_quartermaster = {
        id: "unit_player_1_quartermaster",
        kind: "unit",
        name: "Scrap Quartermaster",
        ownerId: "player_1",
        role: "utility",
        hp: 4,
        maxHp: 4,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        keywords: ["bastion"],
        carries: null,
        sourceCardId: "scrap_quartermaster_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };
      state.entities.unit_player_1_salvager = {
        id: "unit_player_1_salvager",
        kind: "unit",
        name: "Frontline Scout",
        ownerId: "player_1",
        role: "combat",
        hp: 6,
        maxHp: 6,
        attackDamage: 2,
        siegeDamageBonus: 1,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 1, r: 0 },
        keywords: ["salvage"],
        carries: null,
        sourceCardId: "frontline_scout_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      const salvageEvent: GameEvent = {
        type: "UNIT_ATTACK_DECLARED",
        playerId: "player_1",
        attackerId: "unit_player_1_salvager",
        targetId: "unit_player_2_target",
        attacksRemaining: 0,
        damageDealt: 2,
        targetHpRemaining: 0,
        targetDestroyed: true,
      };

      resetTriggerDepth();
      incrementTriggerDepth();
      const triggered = evaluateTriggersFromEvent(state, salvageEvent);

      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.effectId).toBe("damage_enemy_base_1_uncounterable");
    });

    it("fires on_cascaded for Arc Repeater and targets an enemy within range 2", () => {
      const state = createState();
      state.entities.unit_player_1_arc = {
        id: "unit_player_1_arc",
        kind: "unit",
        name: "Arc Repeater",
        ownerId: "player_1",
        role: "utility",
        hp: 3,
        maxHp: 3,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 1, r: 0 },
        keywords: ["relay"],
        carries: null,
        sourceCardId: "arc_repeater_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      state.entities.unit_player_2_near = {
        id: "unit_player_2_near",
        kind: "unit",
        name: "Nearby Target",
        ownerId: "player_2",
        role: "combat",
        hp: 1,
        maxHp: 4,
        attackDamage: 2,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 2, r: 0 },
        carries: null,
        sourceCardId: null,
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };
      state.entities.unit_player_2_far = {
        id: "unit_player_2_far",
        kind: "unit",
        name: "Far Target",
        ownerId: "player_2",
        role: "utility",
        hp: 1,
        maxHp: 4,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 5, r: 0 },
        carries: null,
        sourceCardId: null,
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      const cascadeEvent: GameEvent = {
        type: "STACK_ITEM_RESOLVED",
        itemId: "stack_signal",
        label: "Signal Fork",
        controllerId: "player_1",
        ownerId: "player_1",
        effectId: "cascade_unit_buff",
        effectMagnitude: 1,
        targetStackItemId: null,
        targetEntityId: null,
        targetHex: { q: 0, r: 0 },
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        sourceCardInstanceId: "signal_fork_1",
        sourceCardId: "signal_fork",
        sourceCardOwnerId: "player_1",
        pendingUnitEntityId: null,
      };

      resetTriggerDepth();
      incrementTriggerDepth();
      const triggered = evaluateTriggersFromEvent(state, cascadeEvent);

      expect(triggered).toHaveLength(1);
      expect(triggered[0].label).toContain("Arc Repeater");
      expect(triggered[0].label).toContain("Arc");
      expect(triggered[0].targetEntityId).toBe("unit_player_2_near");
    });

    it("does not fire for non-tactic events", () => {
      const state = createState();
      state.entities["unit_player_1_relay"] = {
        id: "unit_player_1_relay",
        kind: "unit",
        name: "Relay Savant",
        ownerId: "player_1",
        role: "utility",
        hp: 4,
        maxHp: 4,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        carries: null,
        sourceCardId: "relay_savant_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      const moveEvent: GameEvent = {
        type: "UNIT_MOVED",
        playerId: "player_1",
        entityId: "unit_player_1_relay",
        from: { q: 0, r: 0 },
        to: { q: 1, r: 0 },
        movesRemaining: 1,
      };

      resetTriggerDepth();
      incrementTriggerDepth();
      const triggered = evaluateTriggersFromEvent(state, moveEvent);
      expect(triggered).toHaveLength(0);
    });

    it("does not fire when the owner plays a unit spell", () => {
      const state = createState();
      state.entities["unit_player_1_relay"] = {
        id: "unit_player_1_relay",
        kind: "unit",
        name: "Relay Savant",
        ownerId: "player_1",
        role: "utility",
        hp: 4,
        maxHp: 4,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        carries: null,
        sourceCardId: "relay_savant_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      const unitEvent: CardPlayedToStackEvent = {
        type: "CARD_PLAYED_TO_STACK",
        playerId: "player_1",
        cardInstanceId: "test_card",
        cardId: "frontline_scout_card",
        cardName: "Frontline Scout",
        cost: { credits: 2, alloy: 1 },
        stackItemId: "stack_1",
        effectId: "deploy_unit_card",
        effectMagnitude: 0,
        targetStackItemId: null,
        targetEntityId: null,
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        nextPriorityPlayerId: "player_2",
        pendingUnitEntityId: "pending_scout",
      };

      resetTriggerDepth();
      incrementTriggerDepth();
      const triggered = evaluateTriggersFromEvent(state, unitEvent);
      expect(triggered).toHaveLength(0);
    });

    it("does not fire if no enemy units exist (no valid target)", () => {
      const state = createState();
      // Remove all player_2 units
      for (const [id, entity] of Object.entries(state.entities)) {
        if (entity.kind === "unit" && entity.ownerId === "player_2") {
          delete state.entities[id];
        }
      }

      state.entities["unit_player_1_relay"] = {
        id: "unit_player_1_relay",
        kind: "unit",
        name: "Relay Savant",
        ownerId: "player_1",
        role: "utility",
        hp: 4,
        maxHp: 4,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        carries: null,
        sourceCardId: "relay_savant_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      const tacticEvent: CardPlayedToStackEvent = {
        type: "CARD_PLAYED_TO_STACK",
        playerId: "player_1",
        cardInstanceId: "test_card",
        cardId: "orbital_ping",
        cardName: "Orbital Ping",
        cost: { credits: 1, flux: 1 },
        stackItemId: "stack_1",
        effectId: "damage_enemy_base_2",
        effectMagnitude: 2,
        targetStackItemId: null,
        targetEntityId: null,
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        nextPriorityPlayerId: "player_2",
        pendingUnitEntityId: null,
      };

      resetTriggerDepth();
      incrementTriggerDepth();
      const triggered = evaluateTriggersFromEvent(state, tacticEvent);
      expect(triggered).toHaveLength(0);
    });

    it("does not auto-target stealthed enemy units", () => {
      const fluxRunnerCard = getCardDefinition("flux_runner_card") as UnitCardDefinition;
      const original = fluxRunnerCard.unit.keywords;
      fluxRunnerCard.unit.keywords = ["stealth"];

      try {
        const state = createState();
        delete state.entities.unit_player_2_harvester;

        state.entities["unit_player_1_relay"] = {
          id: "unit_player_1_relay",
          kind: "unit",
          name: "Relay Savant",
          ownerId: "player_1",
          role: "utility",
          hp: 4,
          maxHp: 4,
          attackDamage: 1,
          siegeDamageBonus: 0,
          armor: 0,
          moveRange: 2,
          attackRange: 1,
          attackActionsPerTurn: 1,
          coord: { q: 0, r: 0 },
          carries: null,
          sourceCardId: "relay_savant_card",
          hasSummoningSickness: false,
          movesRemaining: 2,
          attacksRemaining: 1,
          temporaryAttackBonus: 0,
          temporaryArmorBonus: 0,
        };

        const tacticEvent: CardPlayedToStackEvent = {
          type: "CARD_PLAYED_TO_STACK",
          playerId: "player_1",
          cardInstanceId: "test_card",
          cardId: "orbital_ping",
          cardName: "Orbital Ping",
          cost: { credits: 1, flux: 1 },
          stackItemId: "stack_1",
          effectId: "damage_enemy_base_2",
          effectMagnitude: 2,
          targetStackItemId: null,
          targetEntityId: null,
          objectKind: "spell",
          counterable: true,
          defaultCounterDestination: "discard",
          nextPriorityPlayerId: "player_2",
          pendingUnitEntityId: null,
        };

        resetTriggerDepth();
        incrementTriggerDepth();
        const triggered = evaluateTriggersFromEvent(state, tacticEvent);
        expect(triggered).toHaveLength(0);
      } finally {
        fluxRunnerCard.unit.keywords = original;
      }
    });
  });

  describe("integration via dispatch", () => {
    it("relay savant trigger fires when owner plays a tactic via dispatch", () => {
      const state = createState();
      // Deploy relay savant for player_1
      state.entities["unit_player_1_relay"] = {
        id: "unit_player_1_relay",
        kind: "unit",
        name: "Relay Savant",
        ownerId: "player_1",
        role: "utility",
        hp: 4,
        maxHp: 4,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        carries: null,
        sourceCardId: "relay_savant_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      const cardInstanceId = moveCardFromDeckToHand(state, "player_1", "slag_barrage");
      state.priorityPlayerId = "player_1";
      state.players.player_1.resources.credits = 5;
      state.players.player_1.resources.alloy = 5;

      const result = dispatchCommand(state, {
        type: "PLAY_CARD",
        playerId: "player_1",
        cardInstanceId,
        targetEntityId: "base_player_2",
      });
      expect(result.ok).toBe(true);

      // Should have CARD_PLAYED_TO_STACK + STACK_ITEM_PUSHED (trigger)
      expect(result.events.length).toBeGreaterThanOrEqual(2);
      const triggerEvent = result.events.find(
        (e) => e.type === "STACK_ITEM_PUSHED" && "label" in e && e.label.includes("Pulse")
      );
      expect(triggerEvent).toBeDefined();

      // Stack should have 2 items: the tactic and the trigger
      expect(state.stack).toHaveLength(2);
    });
  });

  describe("trigger depth limit", () => {
    it("respects max trigger depth", () => {
      const state = createState();
      state.entities["unit_player_1_relay"] = {
        id: "unit_player_1_relay",
        kind: "unit",
        name: "Relay Savant",
        ownerId: "player_1",
        role: "utility",
        hp: 4,
        maxHp: 4,
        attackDamage: 1,
        siegeDamageBonus: 0,
        armor: 0,
        moveRange: 2,
        attackRange: 1,
        attackActionsPerTurn: 1,
        coord: { q: 0, r: 0 },
        carries: null,
        sourceCardId: "relay_savant_card",
        hasSummoningSickness: false,
        movesRemaining: 2,
        attacksRemaining: 1,
        temporaryAttackBonus: 0,
        temporaryArmorBonus: 0,
      };

      // Simulate exceeding depth
      resetTriggerDepth();
      for (let i = 0; i < 11; i++) incrementTriggerDepth();

      const tacticEvent: CardPlayedToStackEvent = {
        type: "CARD_PLAYED_TO_STACK",
        playerId: "player_1",
        cardInstanceId: "test_card",
        cardId: "orbital_ping",
        cardName: "Orbital Ping",
        cost: { credits: 1, flux: 1 },
        stackItemId: "stack_1",
        effectId: "damage_enemy_base_2",
        effectMagnitude: 2,
        targetStackItemId: null,
        targetEntityId: null,
        objectKind: "spell",
        counterable: true,
        defaultCounterDestination: "discard",
        nextPriorityPlayerId: "player_2",
        pendingUnitEntityId: null,
      };

      const triggered = evaluateTriggersFromEvent(state, tacticEvent);
      expect(triggered).toHaveLength(0);
      expect(state.log.some((l) => l.text.includes("Trigger depth limit"))).toBe(true);
    });
  });
});
