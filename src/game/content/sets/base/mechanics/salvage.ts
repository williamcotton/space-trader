import type { PlayerId } from "../../../../model/ids";
import type { GameState } from "../../../../model/state";
import { registerCombatHook } from "../../../../registries/combatHooks";
import { registerSpellScoringResolver } from "../../../../registries/spellScoring";
import { registerTriggerConditionEvaluator } from "../../../../registries/triggerConditions";
import { registerTriggerConditionScoreContributor } from "../../../../registries/aiMechanics";
import { registerMechanicStateInitializer, registerMechanicStateMigrator, registerMechanicTurnResetHook } from "../../../../registries/mechanicState";
import { getRegisteredResourceIds } from "../../../registry";
import { unitHasActiveKeyword } from "../../../../systems/keywords";
import { ensureMechanicStateNamespace } from "../../../mechanics/stateAccess";
import { registerMechanicApi } from "../../../../registries/mechanicApis";
import { SALVAGE_KEYWORD } from "./keywordIds";

const SALVAGE_MECHANIC_ID = "salvage";

declare module "../../../../model/state" {
  interface GameState {
    /** @deprecated Use salvage mechanic helpers. */
    salvageTriggersThisTurn: Record<PlayerId, number>;
  }
}

type SalvageTurnState = {
  triggersByPlayer: Record<PlayerId, number>;
};

function getSalvageTurnState(state: GameState): SalvageTurnState {
  return ensureMechanicStateNamespace(state, "turn", SALVAGE_MECHANIC_ID, () => ({
    triggersByPlayer: {
      player_1: 0,
      player_2: 0,
    },
  }));
}

export function getSalvageTriggersThisTurn(state: GameState, playerId: PlayerId): number {
  return getSalvageTurnState(state).triggersByPlayer[playerId];
}

export function incrementSalvageTriggersThisTurn(state: GameState, playerId: PlayerId): void {
  getSalvageTurnState(state).triggersByPlayer[playerId] += 1;
}

export function resetSalvageTurnState(state: GameState): void {
  getSalvageTurnState(state).triggersByPlayer.player_1 = 0;
  getSalvageTurnState(state).triggersByPlayer.player_2 = 0;
}

export function installSalvageCompatibilityShim(state: GameState): void {
  Object.defineProperty(state, "salvageTriggersThisTurn", {
    configurable: true,
    enumerable: true,
    get: () => getSalvageTurnState(state).triggersByPlayer,
    set: (value: Record<PlayerId, number>) => {
      getSalvageTurnState(state).triggersByPlayer = value;
    },
  });
}

let installed = false;

export function installSalvageMechanic(): void {
  if (installed) {
    return;
  }
  installed = true;

  registerMechanicStateInitializer(SALVAGE_MECHANIC_ID, (state) => {
    getSalvageTurnState(state);
  });

  registerMechanicApi(SALVAGE_MECHANIC_ID, {
    installCompatibilityShim: installSalvageCompatibilityShim,
    getSalvageTriggersThisTurn,
    incrementSalvageTriggersThisTurn,
  });

  registerMechanicStateMigrator(SALVAGE_MECHANIC_ID, (state) => {
    const legacy = (state as GameState & { salvageTriggersThisTurn?: Record<PlayerId, number> }).salvageTriggersThisTurn;
    const next = getSalvageTurnState(state).triggersByPlayer;
    next.player_1 = typeof legacy?.player_1 === "number" ? legacy.player_1 : 0;
    next.player_2 = typeof legacy?.player_2 === "number" ? legacy.player_2 : 0;
  });

  registerMechanicTurnResetHook(SALVAGE_MECHANIC_ID, resetSalvageTurnState);

  registerCombatHook("salvage_reward", {
    onUnitDestroyedByAttack: ({ state, attacker, target }) => {
      if (target.ownerId === attacker.ownerId || !unitHasActiveKeyword(state, attacker, SALVAGE_KEYWORD)) {
        return;
      }

      state.players[attacker.ownerId].resources.alloy += 1;
      incrementSalvageTriggersThisTurn(state, attacker.ownerId);
      state.log.push({
        turn: state.turn,
        text: `${attacker.id} salvaged wreckage and generated 1 alloy.`,
      });
    },
  });

  registerTriggerConditionEvaluator("on_owner_salvaged", (state, event, _condition, unit) => {
    if (event.type !== "UNIT_ATTACK_DECLARED" || !event.targetDestroyed) {
      return false;
    }

    const attacker = state.entities[event.attackerId];
    return Boolean(
      attacker &&
      attacker.kind === "unit" &&
      attacker.ownerId === unit.ownerId &&
      unitHasActiveKeyword(state, attacker, SALVAGE_KEYWORD)
    );
  });

  registerTriggerConditionScoreContributor("salvage_trigger_bonus", (condition) =>
    condition.type === "on_owner_salvaged" ? 14 : null
  );

  registerSpellScoringResolver("resources_by_salvage_count", ({ state, botPlayerId, targeting, effectConfigs }) => {
    if (targeting.targetEntityId || targeting.targetHex || targeting.targetStackItemId) {
      return -Infinity;
    }

    const effectConfig = effectConfigs.find((config) => config.type === "resources_by_salvage_count");
    if (!effectConfig || effectConfig.type !== "resources_by_salvage_count") {
      return -Infinity;
    }

    const thresholdsMet = Math.floor(getSalvageTriggersThisTurn(state, botPlayerId) / Number(effectConfig.threshold ?? 1));
    const maxThresholds = typeof effectConfig.maxThresholds === "number" ? effectConfig.maxThresholds : undefined;
    const payoutMultiplier = maxThresholds
      ? Math.min(thresholdsMet, maxThresholds)
      : thresholdsMet;

    if (payoutMultiplier <= 0) {
      return -Infinity;
    }

    let score = 48 + payoutMultiplier * 18;
    for (const resource of getRegisteredResourceIds()) {
      const resourcesPerThreshold = effectConfig.resourcesPerThreshold as Record<string, number> | undefined;
      score += (resourcesPerThreshold?.[resource] ?? 0) * payoutMultiplier * 12;
    }

    return score;
  });
}
