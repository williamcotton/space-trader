import type { PlayerId } from "../../../../model/ids";
import type { GameState } from "../../../../model/state";
import { registerTriggerConditionEvaluator } from "../../../../registries/triggerConditions";
import { registerTriggerConditionScoreContributor } from "../../../../registries/aiMechanics";
import { registerCardPlayModifier } from "../../../../registries/cardPlayModifiers";
import { registerMechanicStateInitializer, registerMechanicStateMigrator, registerMechanicTurnResetHook } from "../../../../registries/mechanicState";
import { getCardDefinition } from "../../../cards/catalog";
import { ensureMechanicStateNamespace } from "../../../mechanics/stateAccess";
import { registerMechanicApi } from "../../../../registries/mechanicApis";

const SURGE_MECHANIC_ID = "surge";

declare module "../../../../model/state" {
  interface GameState {
    /** @deprecated Use surge mechanic helpers. */
    tacticsCastThisTurn: Record<PlayerId, number>;
  }
}

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

export function installSurgeCompatibilityShim(state: GameState): void {
  Object.defineProperty(state, "tacticsCastThisTurn", {
    configurable: true,
    enumerable: true,
    get: () => getSurgeTurnState(state).tacticsCastByPlayer,
    set: (value: Record<PlayerId, number>) => {
      getSurgeTurnState(state).tacticsCastByPlayer = value;
    },
  });
}

let installed = false;

export function installSurgeMechanic(): void {
  if (installed) {
    return;
  }
  installed = true;

  registerMechanicStateInitializer(SURGE_MECHANIC_ID, (state) => {
    getSurgeTurnState(state);
  });

  registerMechanicApi(SURGE_MECHANIC_ID, {
    installCompatibilityShim: installSurgeCompatibilityShim,
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

  registerMechanicStateMigrator(SURGE_MECHANIC_ID, (state) => {
    const legacy = (state as GameState & { tacticsCastThisTurn?: Record<PlayerId, number> }).tacticsCastThisTurn;
    const next = getSurgeTurnState(state).tacticsCastByPlayer;
    next.player_1 = typeof legacy?.player_1 === "number" ? legacy.player_1 : 0;
    next.player_2 = typeof legacy?.player_2 === "number" ? legacy.player_2 : 0;
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
