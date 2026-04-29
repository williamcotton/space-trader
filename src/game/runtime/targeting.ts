import type { GameCommand } from "../actions/commands";
import type { DispatchResult } from "../actions/reducers";
import { getCardDefinition } from "../content/cards/catalog";
import { getEntityDisplayName } from "../presentation";
import { canAttackEntityDirectly, canUnitDeclareAttack, getAttackableEntitiesForUnit } from "../rules/directInteraction";
import { getLegalPlayCardTargetOptions, getPlayCardTargetPrompt, getRequiredPlayCardTargetMode } from "../rules/cardPlayOptions";
import { hexDistance, isWithinMapBounds } from "../model/hex";
import { findEntityAtHex } from "../model/queries";
import type { PlayerId } from "../model/ids";
import type { GameState, HexCoord } from "../model/state";
import { canUnitHarvestNode, getResourceNodeAtCoord } from "../systems/harvesting";
import { getEffectiveUnitAttackRange } from "../systems/unitStats";
import { RuntimeTransients } from "./transients";

export type RuntimeTargetingHost = {
  state: GameState;
  dispatch(command: GameCommand): DispatchResult;
  canLocalPlayerActAs(playerId: PlayerId): boolean;
  getNetworkLocalPlayerId(): PlayerId | null;
  isNetworkedMatch(): boolean;
  notifyStateChanged(): void;
  notifyTransientChanged(): void;
};

function getSelectedUnitForPlayer(state: GameState, playerId: PlayerId) {
  if (!state.selectedEntityId) {
    return null;
  }

  const entity = state.entities[state.selectedEntityId];
  if (!entity || entity.kind !== "unit" || entity.ownerId !== playerId) {
    return null;
  }

  return entity;
}

function buildPendingAttackPrompt(attackerName: string): string {
  return `Choose an attack target for ${attackerName}. Press A or Esc to cancel.`;
}

export function getBoardClickCommand(state: GameState, clickedHex: { q: number; r: number } | null): GameCommand | null {
  return getBoardClickCommandForPlayer(state, state.activePlayerId, clickedHex);
}

export function getBoardClickCommandForPlayer(
  state: GameState,
  playerId: PlayerId,
  clickedHex: { q: number; r: number } | null,
  options?: { toggleSelectedUnitOff?: boolean }
): GameCommand | null {
  if (playerId !== state.activePlayerId || playerId !== state.priorityPlayerId) {
    return null;
  }

  if (!clickedHex) {
    if (!state.selectedEntityId) {
      return null;
    }

    return {
      type: "CLEAR_SELECTION",
      playerId,
      reason: "clicked_outside_map",
    };
  }

  const selectedUnit = getSelectedUnitForPlayer(state, playerId);

  const clickedEntity = findEntityAtHex(state, clickedHex);
  if (clickedEntity?.kind === "unit") {
    if (state.selectedEntityId === clickedEntity.id && options?.toggleSelectedUnitOff !== false) {
      return {
        type: "CLEAR_SELECTION",
        playerId,
        reason: "clicked_selected_unit",
      };
    }

    return {
      type: "SELECT_ENTITY",
      playerId,
      entityId: clickedEntity.id,
    };
  }

  if (selectedUnit && !clickedEntity && state.phase === "tactical") {
    return {
      type: "MOVE_UNIT",
      playerId,
      entityId: selectedUnit.id,
      to: clickedHex,
    };
  }

  if (!state.selectedEntityId) {
    return null;
  }

  return {
    type: "CLEAR_SELECTION",
    playerId,
    reason: "clicked_empty_or_enemy_tile",
  };
}

export class RuntimeTargetingController {
  constructor(
    private readonly host: RuntimeTargetingHost,
    private readonly transients: RuntimeTransients
  ) {}

  clearPendingAttackTargeting(options?: { notifyTransient?: boolean }): void {
    if (!this.transients.getRawPendingAttackTargeting()) {
      return;
    }
    this.transients.clearPendingAttackTargeting();
    if (options?.notifyTransient !== false) {
      this.host.notifyTransientChanged();
    }
  }

  syncPendingAttackTargeting(): void {
    const pending = this.transients.getRawPendingAttackTargeting();
    if (!pending) {
      return;
    }

    const attacker = this.host.state.entities[pending.attackerId];
    if (!attacker || attacker.kind !== "unit") {
      this.transients.clearPendingAttackTargeting();
      return;
    }

    if (
      attacker.ownerId !== pending.playerId ||
      this.host.state.selectedEntityId !== attacker.id ||
      this.host.state.phase !== "tactical" ||
      this.host.state.activePlayerId !== attacker.ownerId ||
      this.host.state.priorityPlayerId !== attacker.ownerId ||
      getAttackableEntitiesForUnit(this.host.state, attacker).length === 0
    ) {
      this.transients.clearPendingAttackTargeting();
    }
  }

  clearPendingCardTargeting(logText?: string): void {
    if (!this.transients.getRawPendingCardTargeting()) {
      return;
    }
    if (logText) {
      this.host.state.log.push({
        turn: this.host.state.turn,
        text: logText,
      });
    }
    this.transients.clearPendingCardTargeting();
  }

  setHoveredHexFromBoardCoord(coord: HexCoord | null): void {
    const next = coord && isWithinMapBounds(coord, this.host.state.map) ? coord : null;
    if (this.transients.setHoveredHex(next)) {
      this.host.notifyTransientChanged();
    }
  }

  clearHoveredHex(): void {
    if (this.transients.setHoveredHex(null)) {
      this.host.notifyTransientChanged();
    }
  }

  selectBoardHex(hoveredHex: HexCoord | null): void {
    if (hoveredHex && !isWithinMapBounds(hoveredHex, this.host.state.map)) {
      hoveredHex = null;
    }
    if (this.transients.setHoveredHex(hoveredHex)) {
      this.host.notifyTransientChanged();
    }

    const pendingCardTargeting = this.transients.getRawPendingCardTargeting();
    if (pendingCardTargeting) {
      if (!hoveredHex) {
        this.clearPendingCardTargeting(`Cancelled targeting for ${pendingCardTargeting.cardName}.`);
        this.host.notifyStateChanged();
        return;
      }

      const pending = pendingCardTargeting;
      let result: DispatchResult;
      if (pending.targetMode === "entity") {
        const targetEntity = findEntityAtHex(this.host.state, hoveredHex);
        if (!targetEntity) {
          this.clearPendingCardTargeting(`Cancelled targeting for ${pending.cardName}.`);
          this.host.notifyStateChanged();
          return;
        }

        result = this.host.dispatch({
          type: "PLAY_CARD",
          playerId: pending.playerId,
          cardInstanceId: pending.cardInstanceId,
          targetStackItemId: pending.targetStackItemId,
          targetEntityId: targetEntity.id,
        });
      } else {
        result = this.host.dispatch({
          type: "PLAY_CARD",
          playerId: pending.playerId,
          cardInstanceId: pending.cardInstanceId,
          targetStackItemId: pending.targetStackItemId,
          targetHex: hoveredHex,
        });
      }
      if (result.ok) {
        this.transients.clearPendingCardTargeting();
      }
      return;
    }

    const pendingAttackTargeting = this.transients.getRawPendingAttackTargeting();
    if (pendingAttackTargeting) {
      const pending = pendingAttackTargeting;
      const attacker = this.host.state.entities[pending.attackerId];
      if (!attacker || attacker.kind !== "unit") {
        this.clearPendingAttackTargeting();
        return;
      }

      if (!hoveredHex) {
        this.clearPendingAttackTargeting();
        return;
      }

      const clickedEntity = findEntityAtHex(this.host.state, hoveredHex);
      if (!clickedEntity) {
        this.clearPendingAttackTargeting();
        return;
      }

      if (clickedEntity.ownerId === pending.playerId) {
        if (clickedEntity.id === attacker.id) {
          this.clearPendingAttackTargeting();
          return;
        }

        this.clearPendingAttackTargeting({ notifyTransient: false });
      } else {
        const result = this.host.dispatch({
          type: "ATTACK_UNIT",
          playerId: pending.playerId,
          attackerId: pending.attackerId,
          targetId: clickedEntity.id,
        });
        if (result.ok) {
          this.clearPendingAttackTargeting();
        }
        return;
      }
    }

    const actingPlayerId = this.host.getNetworkLocalPlayerId() ?? this.host.state.activePlayerId;
    const command = getBoardClickCommandForPlayer(this.host.state, actingPlayerId, hoveredHex, {
      toggleSelectedUnitOff: !this.host.isNetworkedMatch(),
    });
    if (!command) {
      this.host.notifyStateChanged();
      return;
    }
    void this.host.dispatch(command);
  }

  endPhase(): DispatchResult | null {
    const playerId = this.host.state.activePlayerId;
    if (!this.host.canLocalPlayerActAs(playerId)) {
      return null;
    }
    this.clearPendingAttackTargeting({ notifyTransient: false });
    return this.host.dispatch({
      type: "END_PHASE",
      playerId,
    });
  }

  passPriority(): DispatchResult | null {
    const playerId = this.host.state.priorityPlayerId;
    if (!playerId || !this.host.canLocalPlayerActAs(playerId)) {
      return null;
    }
    this.clearPendingAttackTargeting({ notifyTransient: false });
    return this.host.dispatch({
      type: "PASS_PRIORITY",
      playerId,
    });
  }

  cancelPendingTargeting(): boolean {
    const pendingCardTargeting = this.transients.getRawPendingCardTargeting();
    if (pendingCardTargeting) {
      this.clearPendingCardTargeting(`Cancelled targeting for ${pendingCardTargeting.cardName}.`);
      this.host.notifyStateChanged();
      return true;
    }

    if (this.transients.getRawPendingAttackTargeting()) {
      this.clearPendingAttackTargeting();
      return true;
    }

    return false;
  }

  beginAttackTargetingForSelectedUnit(): boolean {
    if (this.transients.getRawPendingCardTargeting()) {
      return false;
    }

    const playerId = this.host.state.activePlayerId;
    if (!this.host.canLocalPlayerActAs(playerId) || this.host.state.priorityPlayerId !== playerId || this.host.state.phase !== "tactical") {
      return false;
    }

    const attacker = getSelectedUnitForPlayer(this.host.state, playerId);
    if (!attacker || !canUnitDeclareAttack(this.host.state, attacker) || attacker.attacksRemaining <= 0) {
      return false;
    }

    const validTargets = getAttackableEntitiesForUnit(this.host.state, attacker);
    if (validTargets.length === 0) {
      return false;
    }

    if (this.transients.getRawPendingAttackTargeting()?.attackerId === attacker.id) {
      this.clearPendingAttackTargeting();
      return false;
    }

    const attackerName = getEntityDisplayName(attacker, this.host.state);
    this.transients.setPendingAttackTargeting({
      playerId,
      attackerId: attacker.id,
      attackerName,
      prompt: buildPendingAttackPrompt(attackerName),
    });
    this.host.notifyTransientChanged();
    return true;
  }

  harvestSelectedUnit(): DispatchResult | null {
    const playerId = this.host.state.activePlayerId;
    if (!this.host.canLocalPlayerActAs(playerId)) {
      return null;
    }

    const selected = getSelectedUnitForPlayer(this.host.state, playerId);
    if (!selected || !canUnitHarvestNode(selected, playerId)) {
      return null;
    }

    const node = getResourceNodeAtCoord(this.host.state, selected.coord);
    if (!node || node.controlledBy !== playerId) {
      return null;
    }

    this.clearPendingAttackTargeting({ notifyTransient: false });
    return this.host.dispatch({
      type: "HARVEST_NODE",
      playerId,
      entityId: selected.id,
      nodeId: node.id,
    });
  }

  attackSelectedUnitFirstTargetInRange(): DispatchResult | null {
    const playerId = this.host.state.activePlayerId;
    if (!this.host.canLocalPlayerActAs(playerId)) {
      return null;
    }

    const attacker = getSelectedUnitForPlayer(this.host.state, playerId);
    if (!attacker) {
      return null;
    }
    if (!canUnitDeclareAttack(this.host.state, attacker) || attacker.attacksRemaining <= 0) {
      return null;
    }

    const target = Object.values(this.host.state.entities).find((entity) => {
      if (entity.ownerId === playerId) {
        return false;
      }
      return (
        canAttackEntityDirectly(this.host.state, playerId, entity) &&
        hexDistance(attacker.coord, entity.coord) <= getEffectiveUnitAttackRange(this.host.state, attacker)
      );
    });

    if (!target) {
      return null;
    }

    return this.host.dispatch({
      type: "ATTACK_UNIT",
      playerId,
      attackerId: attacker.id,
      targetId: target.id,
    });
  }

  playCardFromHand(
    cardInstanceId: string,
    targetStackItemId?: string,
    targetEntityId?: string,
    targetHex?: { q: number; r: number }
  ): DispatchResult {
    this.clearPendingAttackTargeting({ notifyTransient: false });
    if (this.host.state.phase === "discard") {
      this.transients.clearPendingCardTargeting();
      const discardPlayerId = this.host.getNetworkLocalPlayerId() ?? this.host.state.activePlayerId;
      return this.host.dispatch({
        type: "DISCARD_CARD",
        playerId: discardPlayerId,
        cardInstanceId,
      });
    }

    const playerId = this.host.getNetworkLocalPlayerId() ?? this.host.state.priorityPlayerId ?? this.host.state.activePlayerId;
    const handCard = this.host.state.zones[playerId].hand.find((card) => card.instanceId === cardInstanceId);
    const definition = handCard ? getCardDefinition(handCard.cardId) : undefined;
    const cardName = definition?.name ?? handCard?.cardId ?? cardInstanceId;
    const pendingTargetMode = definition ? getRequiredPlayCardTargetMode(definition) : null;
    const hasExplicitTarget =
      (pendingTargetMode === "entity" && Boolean(targetEntityId)) ||
      (pendingTargetMode === "hex" && Boolean(targetHex));

    if (pendingTargetMode && !hasExplicitTarget) {
      const legalTargets = definition
        ? getLegalPlayCardTargetOptions(this.host.state, playerId, cardInstanceId, definition)
        : [];
      if (legalTargets.length === 0) {
        return this.host.dispatch({
          type: "PLAY_CARD",
          playerId,
          cardInstanceId,
          targetStackItemId,
        });
      }

      const prompt = getPlayCardTargetPrompt(cardName, definition!);
      this.transients.setPendingCardTargeting({
        playerId,
        cardInstanceId,
        cardName,
        targetMode: pendingTargetMode,
        targetStackItemId,
        prompt,
      });
      this.host.state.log.push({
        turn: this.host.state.turn,
        text: prompt,
      });
      this.host.notifyStateChanged();
      return {
        ok: true,
        events: [],
      };
    }

    const result = this.host.dispatch({
      type: "PLAY_CARD",
      playerId,
      cardInstanceId,
      targetStackItemId,
      targetEntityId,
      targetHex,
    });
    if (result.ok) {
      this.transients.clearPendingCardTargeting();
    }
    return result;
  }
}
