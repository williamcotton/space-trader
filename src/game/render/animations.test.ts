import { describe, expect, it } from "vitest";
import { requireMapDefinition } from "../content/maps/catalog";
import { createInitialGameState } from "../model/state";
import { buildAnimationsFromEvents, captureAnimationSnapshot } from "./animations";

describe("buildAnimationsFromEvents", () => {
  it("creates a spell-resolve animation for targeted damage effects", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const target = state.entities.unit_player_2_scout;
    if (!target || target.kind !== "unit") {
      throw new Error("Expected target unit for animation test.");
    }

    const before = captureAnimationSnapshot(state);
    const animations = buildAnimationsFromEvents(
      [
        {
          type: "STACK_ITEM_RESOLVED",
          itemId: "stack_1_1",
          label: "Arc Snap",
          controllerId: "player_1",
          ownerId: "player_1",
          effectId: "damage_enemy_unit_2",
          effectMagnitude: 2,
          targetStackItemId: null,
          targetEntityId: target.id,
          objectKind: "spell",
          counterable: true,
          defaultCounterDestination: "discard",
          sourceCardInstanceId: "player_1_card_99",
          sourceCardId: "arc_snap",
          sourceCardOwnerId: "player_1",
          pendingUnitEntityId: null,
        },
      ],
      before,
      state
    );

    expect(animations).toHaveLength(1);
    expect(animations[0]).toMatchObject({
      kind: "spell_resolve",
      playerId: "player_1",
      coord: target.coord,
      visual: "damage",
      amount: 2,
    });
  });

  it("adds a death burst when a unit is removed by the command result", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const target = state.entities.unit_player_2_scout;
    if (!target || target.kind !== "unit") {
      throw new Error("Expected target unit for death animation test.");
    }

    const before = captureAnimationSnapshot(state);
    delete state.entities[target.id];

    const animations = buildAnimationsFromEvents(
      [
        {
          type: "UNIT_ATTACK_DECLARED",
          playerId: "player_1",
          attackerId: "unit_player_1_scout",
          targetId: target.id,
          attacksRemaining: 0,
          damageDealt: 3,
          targetHpRemaining: 0,
          targetDestroyed: true,
        },
      ],
      before,
      state
    );

    expect(animations.some((animation) => animation.kind === "death_burst")).toBe(true);
  });

  it("adds a victory fanfare when the game gains a winner", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const before = captureAnimationSnapshot(state);

    state.winner = "player_1";

    const animations = buildAnimationsFromEvents([], before, state);

    expect(animations.some((animation) => animation.kind === "victory_fanfare" && animation.playerId === "player_1")).toBe(true);
  });

  it("captures the countered stack object's visual when a unit spell is countered", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    state.stack.push({
      id: "stack_unit_1",
      label: "Frontline Scout",
      controllerId: "player_1",
      ownerId: "player_1",
      effectId: "deploy_unit_card",
      effectMagnitude: 0,
      targetStackItemId: null,
      targetEntityId: null,
      objectKind: "spell",
      counterable: true,
      defaultCounterDestination: "discard",
      sourceCardInstanceId: "player_1_card_7",
      sourceCardId: "frontline_scout_card",
      sourceCardOwnerId: "player_1",
      pendingUnitEntityId: "unit_player_1_frontline_scout_card_7",
    });

    const before = captureAnimationSnapshot(state);
    const animations = buildAnimationsFromEvents(
      [
        {
          type: "STACK_ITEM_RESOLVED",
          itemId: "stack_counter_1",
          label: "Counter Pulse",
          controllerId: "player_2",
          ownerId: "player_2",
          effectId: "counter_top_item",
          effectMagnitude: 0,
          targetStackItemId: "stack_unit_1",
          targetEntityId: null,
          objectKind: "spell",
          counterable: true,
          defaultCounterDestination: "discard",
          sourceCardInstanceId: "player_2_card_9",
          sourceCardId: "counter_pulse",
          sourceCardOwnerId: "player_2",
          pendingUnitEntityId: null,
        },
      ],
      before,
      state
    );

    expect(animations).toHaveLength(1);
    expect(animations[0]).toMatchObject({
      kind: "stack_counter",
      playerId: "player_2",
      targetLabel: "Frontline Scout",
      targetVisual: "unit",
      returnToHand: false,
    });
  });

  it("uses a card-owned resolve animation profile for Ion Shower", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const before = captureAnimationSnapshot(state);
    const targetHex = { q: 0, r: 0 };

    const animations = buildAnimationsFromEvents(
      [
        {
          type: "STACK_ITEM_RESOLVED",
          itemId: "stack_1_7",
          label: "Ion Shower",
          controllerId: "player_2",
          ownerId: "player_2",
          effectId: "cascade_unit_buff",
          effectMagnitude: 1,
          targetStackItemId: null,
          targetEntityId: null,
          targetHex,
          objectKind: "spell",
          counterable: true,
          defaultCounterDestination: "discard",
          sourceCardInstanceId: "player_2_card_12",
          sourceCardId: "ion_shower",
          sourceCardOwnerId: "player_2",
          pendingUnitEntityId: null,
        },
      ],
      before,
      state
    );

    expect(animations).toHaveLength(1);
    expect(animations[0]).toMatchObject({
      kind: "hex_shower",
      playerId: "player_2",
      origin: targetHex,
      label: "Ion Shower",
      accent: "flux",
    });
    if (animations[0]?.kind !== "hex_shower") {
      throw new Error("Expected hex shower animation.");
    }
    expect(animations[0].hexes.length).toBeGreaterThan(0);
  });

  it("builds a hex-area animation for Meteor Chain from the card effect config", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const before = captureAnimationSnapshot(state);
    const targetHex = { q: 0, r: 0 };

    const animations = buildAnimationsFromEvents(
      [
        {
          type: "STACK_ITEM_RESOLVED",
          itemId: "stack_2_4",
          label: "Meteor Chain",
          controllerId: "player_2",
          ownerId: "player_2",
          effectId: "hex_area_damage",
          effectMagnitude: 4,
          targetStackItemId: null,
          targetEntityId: null,
          targetHex,
          objectKind: "spell",
          counterable: true,
          defaultCounterDestination: "discard",
          sourceCardInstanceId: "player_2_card_55",
          sourceCardId: "meteor_chain",
          sourceCardOwnerId: "player_2",
          pendingUnitEntityId: null,
        },
      ],
      before,
      state
    );

    expect(animations).toHaveLength(1);
    expect(animations[0]).toMatchObject({
      kind: "hex_shower",
      playerId: "player_2",
      origin: targetHex,
      label: "Meteor Chain",
      accent: "flux_collective",
    });
    if (animations[0]?.kind !== "hex_shower") {
      throw new Error("Expected hex shower animation for Meteor Chain.");
    }
    expect(animations[0].hexes.some((hex) => hex.q === 1 && hex.r === 0)).toBe(true);
  });

  it("uses a card-owned board-blast animation profile for Orbital Purge", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const before = captureAnimationSnapshot(state);

    const animations = buildAnimationsFromEvents(
      [
        {
          type: "STACK_ITEM_RESOLVED",
          itemId: "stack_9_1",
          label: "Orbital Purge",
          controllerId: "player_1",
          ownerId: "player_1",
          effectId: "mass_damage",
          effectMagnitude: 4,
          targetStackItemId: null,
          targetEntityId: null,
          objectKind: "spell",
          counterable: true,
          defaultCounterDestination: "discard",
          sourceCardInstanceId: "player_1_card_88",
          sourceCardId: "orbital_purge",
          sourceCardOwnerId: "player_1",
          pendingUnitEntityId: null,
        },
      ],
      before,
      state
    );

    expect(animations).toHaveLength(1);
    expect(animations[0]).toMatchObject({
      kind: "board_blast",
      playerId: "player_1",
      label: "Orbital Purge",
      accent: "neutral",
    });
    if (animations[0]?.kind !== "board_blast") {
      throw new Error("Expected board blast animation for Orbital Purge.");
    }
    expect(animations[0].hexes.length).toBeGreaterThan(0);
  });

  it("uses a board-blast animation for Scorched Protocol when damaged units are destroyed", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const target = state.entities.unit_player_2_scout;
    if (!target || target.kind !== "unit") {
      throw new Error("Expected target unit for Scorched Protocol animation test.");
    }
    target.hp = target.maxHp - 1;
    const before = captureAnimationSnapshot(state);
    delete state.entities[target.id];

    const animations = buildAnimationsFromEvents(
      [
        {
          type: "STACK_ITEM_RESOLVED",
          itemId: "stack_9_2",
          label: "Scorched Protocol",
          controllerId: "player_1",
          ownerId: "player_1",
          effectId: "destroy_damaged_units",
          effectMagnitude: 1,
          targetStackItemId: null,
          targetEntityId: null,
          objectKind: "spell",
          counterable: true,
          defaultCounterDestination: "discard",
          sourceCardInstanceId: "player_1_card_89",
          sourceCardId: "scorched_protocol",
          sourceCardOwnerId: "player_1",
          pendingUnitEntityId: null,
        },
      ],
      before,
      state
    );

    expect(animations.some((animation) => animation.kind === "board_blast")).toBe(true);
  });

  it("uses a board-blast animation for War Protocol on allied combat hexes", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const before = captureAnimationSnapshot(state);

    const animations = buildAnimationsFromEvents(
      [
        {
          type: "STACK_ITEM_RESOLVED",
          itemId: "stack_9_3",
          label: "War Protocol",
          controllerId: "player_1",
          ownerId: "player_1",
          effectId: "global_unit_buff",
          effectMagnitude: 2,
          targetStackItemId: null,
          targetEntityId: null,
          objectKind: "spell",
          counterable: true,
          defaultCounterDestination: "discard",
          sourceCardInstanceId: "player_1_card_90",
          sourceCardId: "war_protocol",
          sourceCardOwnerId: "player_1",
          pendingUnitEntityId: null,
        },
      ],
      before,
      state
    );

    expect(animations).toHaveLength(1);
    expect(animations[0]).toMatchObject({
      kind: "board_blast",
      playerId: "player_1",
      label: "War Protocol",
      accent: "alloy",
    });
    if (animations[0]?.kind !== "board_blast") {
      throw new Error("Expected board blast animation for War Protocol.");
    }
    expect(animations[0].hexes.some((hex) => hex.q === state.entities.unit_player_1_scout.coord.q && hex.r === state.entities.unit_player_1_scout.coord.r)).toBe(true);
  });

  it("uses a board-blast animation for Spore Harvest on friendly unit hexes", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const before = captureAnimationSnapshot(state);

    const animations = buildAnimationsFromEvents(
      [
        {
          type: "STACK_ITEM_RESOLVED",
          itemId: "stack_9_4",
          label: "Spore Harvest",
          controllerId: "player_1",
          ownerId: "player_1",
          effectId: "resources_by_unit_count",
          effectMagnitude: 3,
          targetStackItemId: null,
          targetEntityId: null,
          objectKind: "spell",
          counterable: true,
          defaultCounterDestination: "discard",
          sourceCardInstanceId: "player_1_card_91",
          sourceCardId: "spore_harvest",
          sourceCardOwnerId: "player_1",
          pendingUnitEntityId: null,
        },
      ],
      before,
      state
    );

    expect(animations).toHaveLength(1);
    expect(animations[0]).toMatchObject({
      kind: "board_blast",
      playerId: "player_1",
      label: "Spore Harvest",
      accent: "biomass",
    });
  });

  it("uses a board-blast animation for Emergency War Chest centered on the caster base", () => {
    const state = createInitialGameState({ map: requireMapDefinition("frontier_belt") });
    const before = captureAnimationSnapshot(state);
    const base = state.entities.base_player_2;
    if (!base || base.kind !== "base") {
      throw new Error("Expected player 2 base for Emergency War Chest animation test.");
    }

    const animations = buildAnimationsFromEvents(
      [
        {
          type: "STACK_ITEM_RESOLVED",
          itemId: "stack_9_5",
          label: "Emergency War Chest",
          controllerId: "player_2",
          ownerId: "player_2",
          effectId: "draw_and_gain_resources",
          effectMagnitude: 4,
          targetStackItemId: null,
          targetEntityId: null,
          objectKind: "spell",
          counterable: true,
          defaultCounterDestination: "discard",
          sourceCardInstanceId: "player_2_card_92",
          sourceCardId: "emergency_war_chest",
          sourceCardOwnerId: "player_2",
          pendingUnitEntityId: null,
        },
      ],
      before,
      state
    );

    expect(animations).toHaveLength(1);
    expect(animations[0]).toMatchObject({
      kind: "board_blast",
      playerId: "player_2",
      label: "Emergency War Chest",
      accent: "neutral",
    });
    if (animations[0]?.kind !== "board_blast") {
      throw new Error("Expected board blast animation for Emergency War Chest.");
    }
    expect(animations[0].center).toEqual(base.coord);
  });
});
