import { describe, expect, it } from "vitest";
import { FRONTIER_BELT_MAP } from "../content/maps/frontierBelt";
import { createInitialGameState } from "../model/state";
import { buildAnimationsFromEvents, captureAnimationSnapshot } from "./animations";

describe("buildAnimationsFromEvents", () => {
  it("creates a spell-resolve animation for targeted damage effects", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
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

  it("captures the countered stack object's visual when a unit spell is countered", () => {
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
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
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
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
    const state = createInitialGameState({ map: FRONTIER_BELT_MAP });
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
      accent: "flux",
    });
    if (animations[0]?.kind !== "hex_shower") {
      throw new Error("Expected hex shower animation for Meteor Chain.");
    }
    expect(animations[0].hexes.some((hex) => hex.q === 1 && hex.r === 0)).toBe(true);
  });
});
