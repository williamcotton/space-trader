import type { ResourceType } from "./enums";
import type { GameState, StackItem } from "./state";
import type { PlayerId } from "./ids";
import { getCardDefinition, getCardKeywords, type CardCost, type CardDefinition } from "../content/cards/catalog";
import { getRegisteredResourceIds } from "../content/registry";
import { getStackEffectDefinition, isCounterResponse } from "../content/stackEffects";
import { formatFactionName, getEntityDisplayName, getPlayerLabel, getUnitRoleTheme } from "../presentation";
import { getStackPreviewPresenter } from "../registries/stackPreviews";
import { getLegalPlayCardTargetOptions } from "../rules/cardPlayOptions";

// --- Stack Item Selectors (from CommandStackPanel) ---

export type StackPreviewItem = {
  id: string;
  label: string;
  controllerId: string;
  effectId: string;
  counterable: boolean;
  kindLabel: string;
  detail: string;
  ownerLabel: string;
};

export function getStackItemKindLabel(item: StackItem, state: GameState): string {
  const sourceCard = item.sourceCardId ? getCardDefinition(item.sourceCardId) : undefined;
  if (sourceCard?.kind === "unit" && item.effectId === "deploy_unit_card") {
    return "Unit Spell";
  }
  if (sourceCard?.kind === "tactic") {
    return "Tactic";
  }
  const effect = getStackEffectDefinition(item.effectId);
  const presenter = effect ? getStackPreviewPresenter(effect.behavior.type) : undefined;
  const presentation = presenter?.({
    item,
    state,
    sourceCard,
    effect,
    targetEntity: null,
    targetStackItem: null,
    targetHex: item.targetHex ?? null,
  });
  if (presentation?.kindLabel) {
    return presentation.kindLabel;
  }
  return item.objectKind === "ability" ? "Ability" : "Spell";
}

export function getStackItemDetail(item: StackItem, state: GameState): string {
  const sourceCard = item.sourceCardId ? getCardDefinition(item.sourceCardId) : undefined;
  const targetEntity = item.targetEntityId ? state.entities[item.targetEntityId] : null;
  const targetStackItem = item.targetStackItemId ? state.stack.find((si) => si.id === item.targetStackItemId) ?? null : null;
  const targetHex = item.targetHex ?? null;

  if (sourceCard?.kind === "unit" && item.effectId === "deploy_unit_card") {
    return `${sourceCard.unit.role} · ${sourceCard.unit.hp} HP · deploy near base on resolve`;
  }
  if (sourceCard?.kind === "tactic") {
    if (targetEntity) {
      return `${sourceCard.text} Target: ${getEntityDisplayName(targetEntity, { players: state.players })}.`;
    }
    if (targetStackItem) {
      return `${sourceCard.text} Target: ${targetStackItem.label}.`;
    }
    if (targetHex) {
      return `${sourceCard.text} Target: (${targetHex.q}, ${targetHex.r}).`;
    }
    return sourceCard.text;
  }
  const effect = getStackEffectDefinition(item.effectId);
  const presenter = effect ? getStackPreviewPresenter(effect.behavior.type) : undefined;
  const presentation = presenter?.({
    item,
    state,
    sourceCard,
    effect,
    targetEntity,
    targetStackItem,
    targetHex,
  });
  if (presentation?.detail) {
    return presentation.detail;
  }
  if (targetEntity) {
    return `${effect?.label ?? item.effectId} targeting ${getEntityDisplayName(targetEntity, { players: state.players })}.`;
  }
  if (targetHex) {
    return `${effect?.label ?? item.effectId} targeting (${targetHex.q}, ${targetHex.r}).`;
  }
  return effect?.label ?? item.effectId;
}

export function getStackItemPreview(item: StackItem, state: GameState): StackPreviewItem {
  return {
    id: item.id,
    label: item.label,
    controllerId: item.controllerId,
    effectId: item.effectId,
    counterable: item.counterable,
    kindLabel: getStackItemKindLabel(item, state),
    detail: getStackItemDetail(item, state),
    ownerLabel: getPlayerLabel(item.controllerId === "player_1" ? "player_1" : "player_2"),
  };
}

// --- Card Selectors (from HandTray) ---

export type CardTag = {
  label: string;
  tone: "neutral" | "speed" | "role";
  accent?: string;
};

export type UnitStatEntry = {
  label: string;
  value: number;
};

export type CostEntry = {
  resource: ResourceType;
  amount: number;
};

export function getCostEntries(cost: CardCost): CostEntry[] {
  return getRegisteredResourceIds()
    .map((resource) => ({ resource, amount: cost[resource] ?? 0 }))
    .filter((entry) => entry.amount > 0);
}

export function isCardPlayable(state: GameState, playerId: PlayerId, instanceId: string, definition: CardDefinition): boolean {
  return getLegalPlayCardTargetOptions(state, playerId, instanceId, definition).length > 0;
}

export function getCounterTarget(definition: CardDefinition, stack: GameState["stack"]): string | undefined {
  if (definition.play.targetMode !== "stack_item" || !isCounterResponse(definition.play.stackEffectId)) return undefined;
  return stack[stack.length - 1]?.id;
}

export function getCardTags(definition: CardDefinition): CardTag[] {
  const tags: CardTag[] = [];
  if (definition.kind === "tactic") {
    tags.push({ label: "Tactic", tone: "neutral" });
  }
  if (definition.kind === "unit") {
    const roleTheme = getUnitRoleTheme(definition.unit.role);
    tags.push({ label: `${roleTheme.label} Unit`, tone: "role", accent: roleTheme.accent });
  }
  for (const keyword of getCardKeywords(definition)) {
    tags.push({ label: keyword.replace(/_/g, " "), tone: "neutral" });
  }
  tags.push({ label: definition.speed === "instant" ? "Instant" : "Main", tone: "speed" });
  return tags;
}

export function getUnitStatEntries(definition: CardDefinition): UnitStatEntry[] {
  if (definition.kind !== "unit") return [];
  return [
    { label: "HP", value: definition.unit.hp },
    { label: "ATK", value: definition.unit.attackDamage },
    { label: "ARM", value: definition.unit.armor },
    { label: "RNG", value: definition.unit.attackRange },
    { label: "MOV", value: definition.unit.moveRange },
    { label: "SG", value: definition.unit.siegeDamageBonus },
  ];
}

export function getCardDisplayInfo(state: GameState, playerId: PlayerId, cardId: string, instanceId: string) {
  const definition = getCardDefinition(cardId);
  if (!definition) {
    return {
      instanceId,
      cardId,
      playable: false,
      title: cardId,
      subtitle: "Unknown",
      tags: [] as CardTag[],
      costEntries: [] as CostEntry[],
      unitStats: [] as UnitStatEntry[],
      text: "Unknown card",
      counterTarget: undefined as string | undefined,
    };
  }

  const counterTarget = getCounterTarget(definition, state.stack);
  return {
    instanceId,
    cardId,
    playable: isCardPlayable(state, playerId, instanceId, definition),
    title: definition.name,
    subtitle: formatFactionName(definition.faction),
    tags: getCardTags(definition),
    costEntries: getCostEntries(definition.cost),
    unitStats: getUnitStatEntries(definition),
    text: definition.text,
    counterTarget,
  };
}
