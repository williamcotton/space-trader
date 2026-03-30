import type { PlayerId } from "../../../../model/ids";
import type { GameState } from "../../../../model/state";
import { registerTriggerConditionEvaluator } from "../../../../registries/triggerConditions";
import { registerTriggerConditionScoreContributor } from "../../../../registries/aiMechanics";
import { registerCardPlayModifier } from "../../../../registries/cardPlayModifiers";
import { registerMechanicStateInitializer, registerMechanicTurnResetHook } from "../../../../registries/mechanicState";
import { getCardDefinition } from "../../../cards/catalog";
import { ensureMechanicStateNamespace } from "../../../mechanics/stateAccess";
import { registerMechanicApi } from "../../../../registries/mechanicApis";

const SURGE_MECHANIC_ID = "surge";

type SurgeTurnState = {
  tacticsCastByPlayer: Record<PlayerId, number>;
};

function createSurgeTurnState(): SurgeTurnState {
  return {
    tacticsCastByPlayer: {
      player_1: 0,
      player_2: 0,
    },
  };
}

function getSurgeTurnState(state: GameState): SurgeTurnState {
  return ensureMechanicStateNamespace(state, "turn", SURGE_MECHANIC_ID, createSurgeTurnState);
}

export function getTacticsCastThisTurn(state: Readonly<GameState>, playerId: PlayerId): number {
  return getSurgeTurnState(state).tacticsCastByPlayer[playerId];
}

export function incrementTacticsCastThisTurn(state: GameState, playerId: PlayerId): void {
  getSurgeTurnState(state).tacticsCastByPlayer[playerId] += 1;
}

export function resetSurgeTurnState(state: GameState): void {
  getSurgeTurnState(state).tacticsCastByPlayer.player_1 = 0;
  getSurgeTurnState(state).tacticsCastByPlayer.player_2 = 0;
}

export function installSurgeMechanic(): void {
  registerMechanicStateInitializer(SURGE_MECHANIC_ID, (state) => {
    getSurgeTurnState(state);
  });

  registerMechanicApi(SURGE_MECHANIC_ID, {
    getTacticsCastThisTurn,
    incrementTacticsCastThisTurn,
    resetSurgeTurnState,
  });

  registerCardPlayModifier(SURGE_MECHANIC_ID, {
    label: "Surge",
    isActive: (state, playerId, card) => card.kind === "tactic" && getTacticsCastThisTurn(state, playerId) > 0,
    onCardPlayedToStack: (state, playerId, card) => {
      if (card.kind === "tactic") {
        incrementTacticsCastThisTurn(state, playerId);
      }
    },
  });

  registerMechanicTurnResetHook(SURGE_MECHANIC_ID, resetSurgeTurnState);

  registerTriggerConditionEvaluator("on_owner_surged_tactic_played", (_state, event, _condition, unit) => {
    if (
      event.type !== "CARD_PLAYED_TO_STACK" ||
      event.playerId !== unit.ownerId ||
      !event.activeModifierIds?.includes(SURGE_MECHANIC_ID)
    ) {
      return false;
    }
    return getCardDefinition(event.cardId)?.kind === "tactic";
  });

  registerTriggerConditionScoreContributor("surge_trigger_bonus", (condition) =>
    condition.type === "on_owner_surged_tactic_played" ? 16 : null
  );
}
