import type { SetInstallerModule } from "../../types";
import {
  combineConfiguredSpellScores,
  scoreBaseDamageSpell,
  scoreBraceProtocolTarget,
  scoreCascadeAttackBuffTarget,
  scoreDamageSpellTarget,
  scoreDestroyDamagedUnitsSpell,
  scoreDestroySpellTarget,
  scoreDrawAndGainResourcesSpell,
  scoreGlobalBuffSpell,
  scoreHexAreaDamageSpell,
  scoreMassDamageSpell,
  scoreResourcesByUnitCountSpell,
} from "../ai/spellScoring";
import { getCardDefinition, getCardPlayEffectConfigsByType, getResolvedCardPlayEffectConfigs } from "../../../cards/catalog";
import { installBasePlayEffectRegistrations, installBaseStackEffectMagnitudeRegistrations } from "../stackEffects";
import { hexDistance } from "../../../../model/hex";
import type { PlayerId } from "../../../../model/ids";
import type { GameState, HexCoord, UnitEntity } from "../../../../model/state";
import { registerAutoTargetResolver } from "../../../../registries/autoTargets";
import { getBoardBlastEffectResolver, registerBoardBlastEffectResolver } from "../../../../registries/boardBlastEffects";
import { registerCardResolveAnimationBuilder } from "../../../../registries/cardResolveAnimations";
import { registerDebugStackResponse } from "../../../../registries/debugStackResponses";
import { registerSpellScoringResolver } from "../../../../registries/spellScoring";
import { registerStackPreviewPresenter, registerStackPreviewPresenterByEffectId } from "../../../../registries/stackPreviews";
import { registerStackResolveAnimationBuilder } from "../../../../registries/stackResolveAnimations";
import { registerTriggerConditionEvaluator } from "../../../../registries/triggerConditions";
import {
  buildHexShowerAnimation,
  getAffectedUnitHexes,
  getCardAnimationAccent,
  getDestroyedUnitHexes,
  getLiveUnitHexes,
  getMapCenterHex,
  getRadiusAffectedHexes,
  getStackAnimationVisual,
  getUniqueHexes,
} from "../../../../render/animations";
import { canTargetEntityDirectly } from "../../../../rules/directInteraction";
import { getCascadeAffectedHexes } from "../../../../systems/cascade";

function sortWeakestEnemyUnits(units: UnitEntity[]): UnitEntity[] {
  return [...units].sort((a, b) => {
    const damagedDelta = Number(a.hp < a.maxHp) - Number(b.hp < b.maxHp);
    if (damagedDelta !== 0) {
      return damagedDelta > 0 ? -1 : 1;
    }
    if (a.hp !== b.hp) {
      return a.hp - b.hp;
    }
    return a.id.localeCompare(b.id);
  });
}

function getOpponentPlayer(playerId: PlayerId): PlayerId {
  return playerId === "player_1" ? "player_2" : "player_1";
}

function registerBaseAutoTargetResolvers(): void {
  registerAutoTargetResolver("weakest_enemy_unit", (state, controllerId, preferredTargetId) => {
    const preferredTarget = preferredTargetId ? state.entities[preferredTargetId] : null;
    if (
      preferredTarget &&
      preferredTarget.kind === "unit" &&
      preferredTarget.ownerId !== controllerId &&
      canTargetEntityDirectly(state, controllerId, preferredTarget)
    ) {
      return preferredTarget.id;
    }

    const enemyUnits = sortWeakestEnemyUnits(
      Object.values(state.entities).filter((entity): entity is UnitEntity =>
        entity.kind === "unit" &&
        entity.ownerId !== controllerId &&
        canTargetEntityDirectly(state, controllerId, entity)
      )
    );

    return enemyUnits[0]?.id ?? null;
  });

  registerAutoTargetResolver("weakest_enemy_unit_in_range_2", (state, controllerId, preferredTargetId, sourceUnit) => {
    if (!sourceUnit) {
      return null;
    }

    const preferredTarget = preferredTargetId ? state.entities[preferredTargetId] : null;
    if (
      preferredTarget &&
      preferredTarget.kind === "unit" &&
      preferredTarget.ownerId !== controllerId &&
      canTargetEntityDirectly(state, controllerId, preferredTarget) &&
      hexDistance(sourceUnit.coord, preferredTarget.coord) <= 2
    ) {
      return preferredTarget.id;
    }

    const enemyUnits = sortWeakestEnemyUnits(
      Object.values(state.entities).filter((entity): entity is UnitEntity =>
        entity.kind === "unit" &&
        entity.ownerId !== controllerId &&
        canTargetEntityDirectly(state, controllerId, entity) &&
        hexDistance(sourceUnit.coord, entity.coord) <= 2
      )
    );

    return enemyUnits[0]?.id ?? null;
  });
}

function registerBaseTriggerConditions(): void {
  registerTriggerConditionEvaluator("on_owner_tactic_played", (_state, event, _condition, unit) => {
    if (event.type !== "CARD_PLAYED_TO_STACK" || event.playerId !== unit.ownerId) {
      return false;
    }
    return getCardDefinition(event.cardId)?.kind === "tactic";
  });

  registerTriggerConditionEvaluator("on_cascaded", (state, event, _condition, unit) => {
    if (event.type !== "STACK_ITEM_RESOLVED" || event.controllerId !== unit.ownerId || !event.targetHex || !event.sourceCardId) {
      return false;
    }

    const sourceCard = getCardDefinition(event.sourceCardId);
    const cascadeConfig = getCardPlayEffectConfigsByType(sourceCard, "cascade_unit_buff")[0];
    const waves = Number(cascadeConfig?.waves ?? Number.NaN);
    if (!Number.isFinite(waves)) {
      return false;
    }

    const affectedHexes = getCascadeAffectedHexes(state, event.controllerId, event.targetHex, waves, {
      excludeKeywordEffectIdPrefix: `ce_${event.itemId}_`,
    });
    return affectedHexes.some((coord) => coord.q === unit.coord.q && coord.r === unit.coord.r);
  });

  registerTriggerConditionEvaluator("on_enter_battlefield", (_state, event) => event.type === "CARD_PLAYED_TO_BATTLEFIELD");
  registerTriggerConditionEvaluator("on_death", () => false);
  registerTriggerConditionEvaluator("on_damage_dealt", () => false);
  registerTriggerConditionEvaluator(
    "at_start_of_phase",
    (_state, event, condition) => event.type === "PHASE_ADVANCED" && typeof condition.phase === "string" && event.phase === condition.phase
  );
  registerTriggerConditionEvaluator("at_end_of_turn", () => false);
}

function registerBaseSpellScoring(): void {
  registerSpellScoringResolver("damage_entity", ({ state, botPlayerId, targeting, effect }) => {
    if (!targeting.targetEntityId) {
      return -Infinity;
    }
    const entity = state.entities[targeting.targetEntityId];
    if (!entity) {
      return -Infinity;
    }
    return scoreDamageSpellTarget(state, botPlayerId, entity, Number(effect.amount ?? 0), state.phase);
  });

  registerSpellScoringResolver("destroy_entity", ({ state, botPlayerId, targeting }) => {
    if (!targeting.targetEntityId) {
      return -Infinity;
    }
    const entity = state.entities[targeting.targetEntityId];
    if (!entity || entity.kind !== "unit") {
      return -Infinity;
    }
    return scoreDestroySpellTarget(state, botPlayerId, entity);
  });

  registerSpellScoringResolver("modify_unit_until_end_of_turn", ({ state, botPlayerId, targeting }) => {
    if (!targeting.targetEntityId) {
      return -Infinity;
    }
    const entity = state.entities[targeting.targetEntityId];
    if (!entity || entity.kind !== "unit") {
      return -Infinity;
    }
    return scoreBraceProtocolTarget(state, botPlayerId, entity);
  });

  registerSpellScoringResolver("mass_damage", ({ state, botPlayerId, targeting, effectConfigs }) => {
    if (targeting.targetEntityId || targeting.targetHex || targeting.targetStackItemId) {
      return -Infinity;
    }
    return combineConfiguredSpellScores(
      effectConfigs
        .filter((effectConfig) => effectConfig.type === "mass_damage")
        .map((effectConfig) =>
          scoreMassDamageSpell(state, botPlayerId, {
            amount: Number(effectConfig.amount ?? 0),
            relation: effectConfig.relation === "ally" || effectConfig.relation === "enemy" ? effectConfig.relation : "any",
          })
        )
    );
  });

  registerSpellScoringResolver("global_unit_buff", ({ state, botPlayerId, targeting, effectConfigs }) => {
    if (targeting.targetEntityId || targeting.targetHex || targeting.targetStackItemId) {
      return -Infinity;
    }
    return combineConfiguredSpellScores(
      effectConfigs
        .filter((effectConfig) => effectConfig.type === "global_unit_buff")
        .map((effectConfig) =>
          scoreGlobalBuffSpell(state, botPlayerId, {
            attackBonus: Number(effectConfig.attackBonus ?? 0),
            armorBonus: Number(effectConfig.armorBonus ?? 0),
            relation: effectConfig.relation === "ally" || effectConfig.relation === "enemy" ? effectConfig.relation : "any",
            roleFilter:
              effectConfig.roleFilter === "combat" || effectConfig.roleFilter === "resource" || effectConfig.roleFilter === "utility"
                ? effectConfig.roleFilter
                : undefined,
          })
        )
    );
  });

  registerSpellScoringResolver("destroy_damaged_units", ({ state, botPlayerId, targeting, effectConfigs }) => {
    if (targeting.targetEntityId || targeting.targetHex || targeting.targetStackItemId) {
      return -Infinity;
    }
    return combineConfiguredSpellScores(
      effectConfigs
        .filter((effectConfig) => effectConfig.type === "destroy_damaged_units")
        .map((effectConfig) =>
          scoreDestroyDamagedUnitsSpell(
            state,
            botPlayerId,
            effectConfig.relation === "ally" || effectConfig.relation === "enemy" ? effectConfig.relation : "any"
          )
        )
    );
  });

  registerSpellScoringResolver("draw_and_gain_resources", ({ state, botPlayerId, targeting, effectConfigs }) => {
    if (targeting.targetEntityId || targeting.targetHex || targeting.targetStackItemId) {
      return -Infinity;
    }
    return combineConfiguredSpellScores(
      effectConfigs
        .filter((effectConfig) => effectConfig.type === "draw_and_gain_resources")
        .map((effectConfig) =>
          scoreDrawAndGainResourcesSpell(state, botPlayerId, {
            drawCount: Number(effectConfig.drawCount ?? 0),
            resources: (effectConfig.resources as Record<string, number> | undefined) ?? {},
          })
        )
    );
  });

  registerSpellScoringResolver("resources_by_unit_count", ({ state, botPlayerId, targeting, effectConfigs }) => {
    if (targeting.targetEntityId || targeting.targetHex || targeting.targetStackItemId) {
      return -Infinity;
    }
    return combineConfiguredSpellScores(
      effectConfigs
        .filter((effectConfig) => effectConfig.type === "resources_by_unit_count")
        .map((effectConfig) =>
          scoreResourcesByUnitCountSpell(state, botPlayerId, {
            relation: effectConfig.relation === "ally" || effectConfig.relation === "enemy" ? effectConfig.relation : "any",
            threshold: Number(effectConfig.threshold ?? 1),
            resourcesPerThreshold: (effectConfig.resourcesPerThreshold as Record<string, number> | undefined) ?? {},
            roleFilter:
              effectConfig.roleFilter === "combat" || effectConfig.roleFilter === "resource" || effectConfig.roleFilter === "utility"
                ? effectConfig.roleFilter
                : undefined,
            maxThresholds: typeof effectConfig.maxThresholds === "number" ? effectConfig.maxThresholds : undefined,
          })
        )
    );
  });

  registerSpellScoringResolver("damage_enemy_base", ({ state, botPlayerId, targeting, effect }) => {
    if (targeting.targetEntityId || targeting.targetHex || targeting.targetStackItemId) {
      return -Infinity;
    }
    return scoreBaseDamageSpell(state, botPlayerId, Number(effect.amount ?? 0), state.phase);
  });

  registerSpellScoringResolver("hex_area_damage", ({ state, botPlayerId, targeting, effectConfigs }) => {
    if (!targeting.targetHex) {
      return -Infinity;
    }
    return combineConfiguredSpellScores(
      effectConfigs
        .filter((effectConfig) => effectConfig.type === "hex_area_damage")
        .map((effectConfig) =>
          scoreHexAreaDamageSpell(state, botPlayerId, targeting.targetHex as HexCoord, {
            amount: Number(effectConfig.amount ?? 0),
            radius: Number(effectConfig.radius ?? 0),
            relation: effectConfig.relation === "ally" || effectConfig.relation === "enemy" ? effectConfig.relation : "any",
          })
        )
    );
  });

  registerSpellScoringResolver("cascade_unit_buff", ({ state, botPlayerId, targeting, effectConfigs }) => {
    if (!targeting.targetHex) {
      return -Infinity;
    }
    const targetHex = targeting.targetHex;
    return combineConfiguredSpellScores(
      effectConfigs
        .filter((effectConfig) => effectConfig.type === "cascade_unit_buff")
        .map((effectConfig) =>
          scoreCascadeAttackBuffTarget(state, botPlayerId, targetHex, {
            attackBonus: Number(effectConfig.attackBonus ?? 0),
            armorBonus: Number(effectConfig.armorBonus ?? 0),
            waves: Number(effectConfig.waves ?? 0),
            roleFilter:
              effectConfig.roleFilter === "combat" ||
              effectConfig.roleFilter === "resource" ||
              effectConfig.roleFilter === "utility"
                ? effectConfig.roleFilter
                : undefined,
            grantedKeywords: Array.isArray(effectConfig.grantedKeywords) ? effectConfig.grantedKeywords : undefined,
            reward: typeof effectConfig.reward === "object" && effectConfig.reward !== null ? effectConfig.reward as never : undefined,
          })
        )
    );
  });

  registerSpellScoringResolver("counter", () => -Infinity);
  registerSpellScoringResolver("deploy_unit", () => -Infinity);
  registerSpellScoringResolver("draw_cards", () => -Infinity);
  registerSpellScoringResolver("gain_resources", () => -Infinity);
  registerSpellScoringResolver("noop_log", () => -Infinity);
}

function registerBaseStackPreviewPresenters(): void {
  registerStackPreviewPresenterByEffectId("deploy_unit_card", ({ sourceCard }) =>
    sourceCard?.kind === "unit"
      ? {
          kindLabel: "Unit Spell",
          detail: `${sourceCard.unit.role} · ${sourceCard.unit.hp} HP · deploy near base on resolve`,
        }
      : null
  );

  registerStackPreviewPresenter("counter", ({ effect, targetStackItem }) => ({
    kindLabel: "Counter",
    detail: targetStackItem
      ? `${effect?.label ?? "Counter"} targeting ${targetStackItem.label}.`
      : (effect?.label ?? "Counter target stack item."),
  }));

  registerStackPreviewPresenter("damage_enemy_base", ({ effect }) => ({
    kindLabel: "Ability",
    detail:
      effect?.behavior.type === "damage_enemy_base"
        ? `Deal ${Number(effect.behavior.amount ?? 0)} damage to the enemy base.`
        : (effect?.label ?? "Deal damage to the enemy base."),
  }));
}

function registerBaseCardResolveAnimations(): void {
  registerCardResolveAnimationBuilder("hex_shower", ({ event, state, baseId, sourceCard, profile }) => {
    const label = typeof profile.label === "string" ? profile.label : sourceCard.name;
    const waves = Number(profile.waves ?? getCardPlayEffectConfigsByType(sourceCard, "cascade_unit_buff")[0]?.waves ?? 0);
    const accent = typeof profile.accent === "string" ? profile.accent : getCardAnimationAccent(event.sourceCardId);

    return buildHexShowerAnimation(event, state, baseId, label, waves, accent);
  });

  registerCardResolveAnimationBuilder("board_blast", ({ event, before, state, baseId, sourceCard, profile }) => {
    const effectConfigs = getResolvedCardPlayEffectConfigs(sourceCard, event.activeModifierIds ?? []);
    const effectResolutions = effectConfigs
      .map((effectConfig) =>
        getBoardBlastEffectResolver(effectConfig.type)?.({
          before,
          state,
          controllerId: event.controllerId,
          effectConfig,
        }) ?? null
      )
      .filter((resolution): resolution is NonNullable<typeof resolution> => Boolean(resolution));
    const controllerBase = state.entities[state.players[event.controllerId].baseEntityId];
    const affectedHexes = getUniqueHexes(effectResolutions.flatMap((resolution) => resolution.hexes));

    if (affectedHexes.length === 0) {
      return null;
    }

    return {
      id: baseId,
      kind: "board_blast",
      playerId: event.controllerId,
      ageSeconds: 0,
      durationSeconds: 1.15,
      center:
        effectResolutions.some((resolution) => resolution.prefersMapCenter)
          ? getMapCenterHex(state)
          : controllerBase && controllerBase.kind === "base"
            ? controllerBase.coord
            : getMapCenterHex(state),
      hexes: affectedHexes,
      label: typeof profile.label === "string" ? profile.label : sourceCard.name,
      accent: typeof profile.accent === "string" ? profile.accent : getCardAnimationAccent(event.sourceCardId),
    };
  });
}

function registerBaseDebugStackResponses(): void {
  registerDebugStackResponse({
    id: "noop_response",
    label: "Debug response",
    effectId: "noop_log",
  });
  registerDebugStackResponse({
    id: "base_strike",
    label: "Debug Base Strike",
    effectId: "damage_enemy_base_2",
  });
  registerDebugStackResponse({
    id: "counter_top_item",
    label: "Debug Counter",
    effectId: "counter_top_item",
    getTargetStackItemId: (state: Readonly<GameState>) => state.stack[state.stack.length - 1]?.id ?? null,
  });
}

function registerBaseStackResolveAnimations(): void {
  registerStackResolveAnimationBuilder("counter", ({ event, before, state, baseId, behavior }) => {
    const sourceBase = state.entities[state.players[event.controllerId].baseEntityId];
    const targetItem = event.targetStackItemId ? before.stackItems[event.targetStackItemId] : undefined;
    if (!sourceBase || sourceBase.kind !== "base" || !targetItem) {
      return null;
    }

    return {
      id: baseId,
      kind: "stack_counter",
      playerId: event.controllerId,
      ageSeconds: 0,
      durationSeconds: 0.88,
      from: sourceBase.coord,
      label: event.label,
      targetLabel: targetItem.label,
      targetVisual: getStackAnimationVisual(targetItem.effectId, targetItem.sourceCardId),
      returnToHand: behavior.destination === "hand",
    };
  });

  registerStackResolveAnimationBuilder("deploy_unit", ({ event, state, baseId }) => {
    if (!event.pendingUnitEntityId) {
      return null;
    }

    const resolvedUnit = state.entities[event.pendingUnitEntityId];
    if (!resolvedUnit || resolvedUnit.kind !== "unit") {
      return null;
    }

    return {
      id: baseId,
      kind: "deploy",
      playerId: resolvedUnit.ownerId,
      ageSeconds: 0,
      durationSeconds: 0.66,
      coord: resolvedUnit.coord,
    };
  });

  registerStackResolveAnimationBuilder("damage_entity", ({ event, before, state, baseId, behavior }) => {
    const targetId = event.targetEntityId;
    if (!targetId) {
      return null;
    }
    const target = before.entities[targetId] ?? state.entities[targetId];
    if (!target) {
      return null;
    }

    return {
      id: baseId,
      kind: "spell_resolve",
      playerId: event.controllerId,
      ageSeconds: 0,
      durationSeconds: 0.78,
      coord: target.coord,
      visual: target.kind === "base" ? "base_damage" : "damage",
      amount: Number(behavior.amount ?? 0),
      label: event.label,
    };
  });

  registerStackResolveAnimationBuilder("destroy_entity", ({ event, before, state, baseId }) => {
    const targetId = event.targetEntityId;
    if (!targetId) {
      return null;
    }
    const target = before.entities[targetId] ?? state.entities[targetId];
    if (!target) {
      return null;
    }

    return {
      id: baseId,
      kind: "spell_resolve",
      playerId: event.controllerId,
      ageSeconds: 0,
      durationSeconds: 0.84,
      coord: target.coord,
      visual: "destroy",
      label: event.label,
    };
  });

  registerStackResolveAnimationBuilder("modify_unit_until_end_of_turn", ({ event, before, state, baseId, behavior }) => {
    const targetId = event.targetEntityId;
    if (!targetId) {
      return null;
    }
    const target = before.entities[targetId] ?? state.entities[targetId];
    if (!target) {
      return null;
    }

    const buffLabelParts: string[] = [];
    const attackBonus = Number(behavior.attackBonus ?? 0);
    const armorBonus = Number(behavior.armorBonus ?? 0);
    if (attackBonus !== 0) {
      buffLabelParts.push(`${attackBonus > 0 ? "+" : ""}${attackBonus} ATK`);
    }
    if (armorBonus !== 0) {
      buffLabelParts.push(`${armorBonus > 0 ? "+" : ""}${armorBonus} ARM`);
    }

    return {
      id: baseId,
      kind: "spell_resolve",
      playerId: event.controllerId,
      ageSeconds: 0,
      durationSeconds: 0.86,
      coord: target.coord,
      visual: "buff",
      label: buffLabelParts.join(" · ") || event.label,
    };
  });

  registerStackResolveAnimationBuilder("cascade_unit_buff", ({ event, state, baseId, sourceCard, behavior }) =>
    buildHexShowerAnimation(
      event,
      state,
      baseId,
      event.label,
      Number(getCardPlayEffectConfigsByType(sourceCard, "cascade_unit_buff")[0]?.waves ?? behavior.waves ?? 0),
      getCardAnimationAccent(event.sourceCardId)
    )
  );

  registerStackResolveAnimationBuilder("hex_area_damage", ({ event, state, baseId, sourceCard }) => {
    if (!event.targetHex) {
      return null;
    }

    const effectConfigs = getResolvedCardPlayEffectConfigs(sourceCard, event.activeModifierIds ?? []).filter(
      (effectConfig) => effectConfig.type === "hex_area_damage"
    );
    if (effectConfigs.length === 0) {
      return null;
    }

    return {
      id: baseId,
      kind: "hex_shower",
      playerId: event.controllerId,
      ageSeconds: 0,
      durationSeconds: 1,
      origin: event.targetHex,
      hexes: getUniqueHexes(
        effectConfigs.flatMap((effectConfig) =>
          getRadiusAffectedHexes(state, event.targetHex as HexCoord, Number(effectConfig.radius ?? 0))
        )
      ),
      label: event.label,
      accent: getCardAnimationAccent(event.sourceCardId),
    };
  });

  registerStackResolveAnimationBuilder("damage_enemy_base", ({ event, state, baseId, behavior }) => {
    const targetPlayerId = getOpponentPlayer(event.controllerId);
    const targetBase = state.entities[state.players[targetPlayerId].baseEntityId];
    if (!targetBase || targetBase.kind !== "base") {
      return null;
    }

    return {
      id: baseId,
      kind: "base_hit",
      playerId: targetPlayerId,
      ageSeconds: 0,
      durationSeconds: 0.7,
      coord: targetBase.coord,
      damage: Number(behavior.amount ?? 0),
    };
  });
}

function registerBaseBoardBlastResolvers(): void {
  registerBoardBlastEffectResolver("mass_damage", ({ before, controllerId, effectConfig }) => ({
    hexes: getAffectedUnitHexes(
      before,
      controllerId,
      effectConfig.relation === "ally" || effectConfig.relation === "enemy" ? effectConfig.relation : "any"
    ),
    prefersMapCenter: true,
  }));

  registerBoardBlastEffectResolver("global_unit_buff", ({ state, controllerId, effectConfig }) => ({
    hexes: getLiveUnitHexes(
      state,
      controllerId,
      effectConfig.relation === "ally" || effectConfig.relation === "enemy" ? effectConfig.relation : "any",
      effectConfig.roleFilter === "combat" || effectConfig.roleFilter === "resource" || effectConfig.roleFilter === "utility"
        ? effectConfig.roleFilter
        : undefined
    ),
  }));

  registerBoardBlastEffectResolver("destroy_damaged_units", ({ before, state, controllerId, effectConfig }) => ({
    hexes: getDestroyedUnitHexes(
      before,
      state,
      controllerId,
      effectConfig.relation === "ally" || effectConfig.relation === "enemy" ? effectConfig.relation : "any"
    ),
    prefersMapCenter: true,
  }));

  registerBoardBlastEffectResolver("draw_and_gain_resources", ({ state, controllerId }) => {
    const controllerBase = state.entities[state.players[controllerId].baseEntityId];
    return {
      hexes: controllerBase && controllerBase.kind === "base" ? [controllerBase.coord] : [],
    };
  });

  registerBoardBlastEffectResolver("resources_by_unit_count", ({ state, controllerId, effectConfig }) => ({
    hexes: getLiveUnitHexes(
      state,
      controllerId,
      effectConfig.relation === "ally" || effectConfig.relation === "enemy" ? effectConfig.relation : "any",
      effectConfig.roleFilter === "combat" || effectConfig.roleFilter === "resource" || effectConfig.roleFilter === "utility"
        ? effectConfig.roleFilter
        : undefined
    ),
  }));
}

export function installBaseRuntimeExtensions(): void {
  installBasePlayEffectRegistrations();
  installBaseStackEffectMagnitudeRegistrations();
  registerBaseAutoTargetResolvers();
  registerBaseBoardBlastResolvers();
  registerBaseCardResolveAnimations();
  registerBaseTriggerConditions();
  registerBaseSpellScoring();
  registerBaseStackPreviewPresenters();
  registerBaseDebugStackResponses();
  registerBaseStackResolveAnimations();
}

export const BASE_RUNTIME_INSTALLER: SetInstallerModule = {
  id: "base_runtime_extensions",
  install: installBaseRuntimeExtensions,
};
