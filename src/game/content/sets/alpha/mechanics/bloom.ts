import type { EntityId } from "../../../../model/ids";
import type { GameState } from "../../../../model/state";
import { getRegisteredResourceIds } from "../../../registry";
import { registerSpellScoringResolver } from "../../../../registries/spellScoring";
import { registerUnitBuffScoreContributor } from "../../../../registries/aiMechanics";
import { registerTriggerConditionEvaluator } from "../../../../registries/triggerConditions";
import { registerMechanicInstructionHandler } from "../../../../registries/mechanicInstructions";
import {
  registerMechanicResolutionResetHook,
  registerMechanicStateInitializer,
  registerMechanicTurnResetHook,
} from "../../../../registries/mechanicState";
import { unitHasActiveKeyword } from "../../../../systems/keywords";
import { ensureMechanicStateNamespace } from "../../../mechanics/stateAccess";
import { registerMechanicApi } from "../../../../registries/mechanicApis";
import { BLOOM_KEYWORD } from "./keywordIds";

const BLOOM_MECHANIC_ID = "bloom";

type BloomTurnState = {
  bloomedUnitIdsThisTurn: EntityId[];
};

type BloomResolutionState = {
  lastSourceItemId: string | null;
  lastBloomedUnitIds: EntityId[];
};

function getBloomTurnState(state: GameState): BloomTurnState {
  return ensureMechanicStateNamespace(state, "turn", BLOOM_MECHANIC_ID, () => ({
    bloomedUnitIdsThisTurn: [],
  }));
}

function getBloomResolutionState(state: GameState): BloomResolutionState {
  return ensureMechanicStateNamespace(state, "resolution", BLOOM_MECHANIC_ID, () => ({
    lastSourceItemId: null,
    lastBloomedUnitIds: [],
  }));
}

export function getBloomedUnitIdsThisTurn(state: GameState): EntityId[] {
  return getBloomTurnState(state).bloomedUnitIdsThisTurn;
}

export function getLastBloomSourceItemId(state: GameState): string | null {
  return getBloomResolutionState(state).lastSourceItemId;
}

export function setLastBloomSourceItemId(state: GameState, itemId: string | null): void {
  getBloomResolutionState(state).lastSourceItemId = itemId;
}

export function getLastBloomedUnitIds(state: GameState): EntityId[] {
  return getBloomResolutionState(state).lastBloomedUnitIds;
}

export function resetBloomResolutionState(state: GameState): void {
  setLastBloomSourceItemId(state, null);
  getLastBloomedUnitIds(state).length = 0;
}

export function resetBloomTurnState(state: GameState): void {
  getBloomedUnitIdsThisTurn(state).length = 0;
  resetBloomResolutionState(state);
}

export function installBloomMechanic(): void {
  registerMechanicStateInitializer(BLOOM_MECHANIC_ID, (state) => {
    getBloomTurnState(state);
    getBloomResolutionState(state);
  });

  registerMechanicApi(BLOOM_MECHANIC_ID, {
    getBloomedUnitIdsThisTurn,
    getLastBloomSourceItemId,
    setLastBloomSourceItemId,
    getLastBloomedUnitIds,
    resetBloomResolutionState,
    resetBloomTurnState,
  });

  registerMechanicTurnResetHook(BLOOM_MECHANIC_ID, resetBloomTurnState);
  registerMechanicResolutionResetHook(BLOOM_MECHANIC_ID, resetBloomResolutionState);

  registerMechanicInstructionHandler(BLOOM_MECHANIC_ID, (state, operation, payload) => {
    if (operation !== "trigger") {
      state.log.push({
        turn: state.turn,
        text: `Unknown bloom mechanic instruction: ${operation}.`,
      });
      return;
    }

    const sourceItemId = typeof payload.sourceItemId === "string" ? payload.sourceItemId : null;
    if (!sourceItemId) {
      return;
    }

    if (getLastBloomSourceItemId(state) !== sourceItemId) {
      setLastBloomSourceItemId(state, sourceItemId);
      getLastBloomedUnitIds(state).length = 0;
    }

    const sourceLabel = typeof payload.sourceLabel === "string" ? payload.sourceLabel : "Bloom";
    const excludeEffectIdPrefix =
      typeof payload.excludeEffectIdPrefix === "string" ? payload.excludeEffectIdPrefix : undefined;
    const unitIds = Array.isArray(payload.unitIds)
      ? [...new Set(payload.unitIds.filter((unitId): unitId is EntityId => typeof unitId === "string"))].sort((a, b) => a.localeCompare(b))
      : [];

    let bloomsTriggered = 0;
    for (const unitId of unitIds) {
      const entity = state.entities[unitId];
      if (!entity || entity.kind !== "unit") {
        continue;
      }

      if (getBloomedUnitIdsThisTurn(state).includes(unitId)) {
        continue;
      }

      if (!unitHasActiveKeyword(state, entity, BLOOM_KEYWORD, { excludeEffectIdPrefix })) {
        continue;
      }

      getBloomedUnitIdsThisTurn(state).push(unitId);
      getLastBloomedUnitIds(state).push(unitId);
      state.players[entity.ownerId].resources.biomass += 1;
      bloomsTriggered += 1;
    }

    if (bloomsTriggered > 0) {
      state.log.push({
        turn: state.turn,
        text: `${sourceLabel}: Bloom triggered on ${bloomsTriggered} unit${bloomsTriggered === 1 ? "" : "s"} and generated ${bloomsTriggered} biomass.`,
      });
    }
  });

  registerTriggerConditionEvaluator("on_self_bloomed", (state, event, _condition, unit) =>
    event.type === "STACK_ITEM_RESOLVED" &&
    getLastBloomSourceItemId(state) === event.itemId &&
    getLastBloomedUnitIds(state).includes(unit.id)
  );

  registerTriggerConditionEvaluator("on_owner_unit_bloomed", (state, event, _condition, unit) =>
    event.type === "STACK_ITEM_RESOLVED" &&
    getLastBloomSourceItemId(state) === event.itemId &&
    getLastBloomedUnitIds(state).some((unitId) => {
      const bloomedUnit = state.entities[unitId];
      return bloomedUnit?.kind === "unit" && bloomedUnit.ownerId === unit.ownerId;
    })
  );

  registerUnitBuffScoreContributor("bloom_fresh_unit_bonus", ({ state, affectedUnits }) => {
    const freshBloomUnits = affectedUnits.filter((unit) =>
      !getBloomedUnitIdsThisTurn(state).includes(unit.id) &&
      unitHasActiveKeyword(state, unit, BLOOM_KEYWORD)
    );

    if (freshBloomUnits.length === 0) {
      return null;
    }

    return {
      scoreDelta: freshBloomUnits.length * 12,
      hasMeaningfulOpportunity: true,
    };
  });

  registerSpellScoringResolver("resources_by_bloom_count", ({ state, botPlayerId, targeting, effectConfigs }) => {
    if (targeting.targetEntityId || targeting.targetHex || targeting.targetStackItemId) {
      return -Infinity;
    }

    const effectConfig = effectConfigs.find((config) => config.type === "resources_by_bloom_count");
    if (!effectConfig || effectConfig.type !== "resources_by_bloom_count") {
      return -Infinity;
    }

    const bloomedUnits = getBloomedUnitIdsThisTurn(state)
      .map((unitId) => state.entities[unitId])
      .filter((entity): entity is NonNullable<typeof entity> & { kind: "unit" } => entity?.kind === "unit" && entity.ownerId === botPlayerId);
    const thresholdsMet = Math.floor(bloomedUnits.length / Number(effectConfig.threshold ?? 1));
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
