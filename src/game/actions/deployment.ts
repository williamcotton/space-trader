import { getCardDefinition, getUnitCardKeywords } from "../content/cards/catalog";
import type { PlayerId } from "../model/ids";
import { getFirstOpenBaseAdjacentTile } from "../model/queries";
import type { GameState, HexCoord } from "../model/state";
import { createContinuousEffectId, LAYER, nextEffectTimestamp } from "../systems/continuousEffects";
import { getUnitDeploymentAdjustment } from "../registries/unitDeployment";

type DeployUnitFromCardOptions = {
  controllerId: PlayerId;
  cardId: string;
  entityId?: string;
  spawnCoord?: HexCoord;
  cardName?: string;
};

export function createSummonedUnitId(
  state: Readonly<Pick<GameState, "entities" | "log" | "turn">>,
  playerId: PlayerId,
  cardId: string
): string {
  const suffix = Object.keys(state.entities).length + state.log.length + state.turn;
  return `unit_${playerId}_${cardId}_${suffix}`;
}

function attachDeployedUnitAuras(
  state: GameState,
  controllerId: PlayerId,
  cardId: string,
  unitEntityId: string
): void {
  const cardDefinition = getCardDefinition(cardId);
  if (!cardDefinition || cardDefinition.kind !== "unit" || !cardDefinition.unit.auras) {
    return;
  }

  for (const aura of cardDefinition.unit.auras) {
    if (aura.attackBonus) {
      const ts = nextEffectTimestamp(state);
      state.continuousEffects.push({
        id: createContinuousEffectId(state, `${unitEntityId}_aura_atk`),
        sourceEntityId: unitEntityId,
        sourceCardId: cardId,
        controllerId,
        payload: { type: "stat_modifier", stat: "attackDamage", amount: aura.attackBonus },
        target: { type: "adjacent_allies", sourceEntityId: unitEntityId, roleFilter: aura.targetRole },
        expiry: { type: "while_source_alive", sourceEntityId: unitEntityId },
        layer: LAYER.STATIC,
        timestamp: ts,
      });
    }

    if (aura.armorBonus) {
      const ts = nextEffectTimestamp(state);
      state.continuousEffects.push({
        id: createContinuousEffectId(state, `${unitEntityId}_aura_arm`),
        sourceEntityId: unitEntityId,
        sourceCardId: cardId,
        controllerId,
        payload: { type: "stat_modifier", stat: "armor", amount: aura.armorBonus },
        target: { type: "adjacent_allies", sourceEntityId: unitEntityId, roleFilter: aura.targetRole },
        expiry: { type: "while_source_alive", sourceEntityId: unitEntityId },
        layer: LAYER.STATIC,
        timestamp: ts,
      });
    }

    if (aura.siegeBonus) {
      const ts = nextEffectTimestamp(state);
      state.continuousEffects.push({
        id: createContinuousEffectId(state, `${unitEntityId}_aura_sg`),
        sourceEntityId: unitEntityId,
        sourceCardId: cardId,
        controllerId,
        payload: { type: "stat_modifier", stat: "siegeDamageBonus", amount: aura.siegeBonus },
        target: { type: "adjacent_allies", sourceEntityId: unitEntityId, roleFilter: aura.targetRole },
        expiry: { type: "while_source_alive", sourceEntityId: unitEntityId },
        layer: LAYER.STATIC,
        timestamp: ts,
      });
    }
  }
}

export function deployUnitFromCard(
  state: GameState,
  { controllerId, cardId, entityId, spawnCoord, cardName }: DeployUnitFromCardOptions
): { entityId: string; coord: HexCoord } | null {
  const cardDefinition = getCardDefinition(cardId);
  if (!cardDefinition || cardDefinition.kind !== "unit") {
    return null;
  }

  const coord = spawnCoord ?? getFirstOpenBaseAdjacentTile(state, controllerId);
  const resolvedCardName = cardName ?? cardDefinition.name;
  if (!coord) {
    state.log.push({
      turn: state.turn,
      text: `Deploy ${resolvedCardName}: no open base-adjacent tile; failed.`,
    });
    return null;
  }

  const unitEntityId = entityId ?? createSummonedUnitId(state, controllerId, cardId);
  const keywords = getUnitCardKeywords(cardId);
  const deploymentAdjustment = getUnitDeploymentAdjustment(cardDefinition, keywords);
  const movesRemaining = deploymentAdjustment.movesRemaining ?? 0;
  const attacksRemaining = deploymentAdjustment.attacksRemaining ?? 0;

  state.entities[unitEntityId] = {
    id: unitEntityId,
    kind: "unit",
    name: resolvedCardName,
    ownerId: controllerId,
    role: cardDefinition.unit.role,
    hp: cardDefinition.unit.hp,
    maxHp: cardDefinition.unit.hp,
    attackDamage: cardDefinition.unit.attackDamage,
    siegeDamageBonus: cardDefinition.unit.siegeDamageBonus,
    armor: cardDefinition.unit.armor,
    moveRange: cardDefinition.unit.moveRange,
    attackRange: cardDefinition.unit.attackRange,
    attackActionsPerTurn: cardDefinition.unit.attackActionsPerTurn,
    coord: { ...coord },
    keywords,
    carries: null,
    sourceCardId: cardId,
    hasSummoningSickness: true,
    movesRemaining,
    attacksRemaining,
    temporaryAttackBonus: 0,
    temporaryArmorBonus: 0,
  };

  attachDeployedUnitAuras(state, controllerId, cardId, unitEntityId);
  state.log.push({
    turn: state.turn,
    text: `${controllerId} deployed ${resolvedCardName} to (${coord.q}, ${coord.r}).`,
  });

  return {
    entityId: unitEntityId,
    coord: { ...coord },
  };
}
