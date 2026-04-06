import type { GamePhase } from "../game/model/enums";
import { hexDistance, isWithinMapBounds } from "../game/model/hex";
import type { EntityState, HexCoord, UnitEntity } from "../game/model/state";
import { getEntityAtCoord, getSelectedUnit } from "../game/model/queries";
import { formatFactionName, getEntityDisplayName, getPlayerLabel, getUnitRoleTheme } from "../game/presentation";
import { getCardDefinition } from "../game/content/cards/catalog";
import { getGameRuntime } from "../game/runtime";
import { canUnitDeclareAttack, getAttackableEntitiesForUnit } from "../game/rules/directInteraction";
import { resolveCombatAttack } from "../game/systems/combat";
import {
  getEffectiveUnitArmor,
  getEffectiveUnitAttackDamage,
  getEffectiveUnitAttackRange,
  getEffectiveUnitMoveRange,
  getEffectiveUnitSiegeDamageBonus,
} from "../game/systems/unitStats";
import { useRuntimeViewSnapshot } from "./useRuntimeViewSnapshot";

type SelectedUnitSnapshot = {
  id: string;
  name: string;
  ownerLabel: string;
  factionLabel: string;
  role: UnitEntity["role"];
  hp: number;
  armor: number;
  attackDamage: number;
  siegeDamageBonus: number;
  attackRange: number;
  movesRemaining: number;
  moveRange: number;
  attacksRemaining: number;
  attackActionsPerTurn: number;
  hasSummoningSickness: boolean;
  carries: UnitEntity["carries"];
  rulesText: string | null;
};

type HoverCombatSnapshot = {
  targetId: string;
  targetName: string;
  targetKind: EntityState["kind"];
  targetOwnerLabel: string;
  distance: number;
  attackRange: number;
  canAttackNow: boolean;
  baseAttack: number;
  siegeAttack: number;
  rawAttack: number;
  defense: number;
  supplyPenalty: number;
  distanceFromFriendlyBase: number;
  projectedDamage: number;
  targetHpBefore: number;
  targetHpAfter: number;
  targetDestroyed: boolean;
};

type TacticalHudSnapshot = {
  phase: GamePhase;
  selectedUnit: SelectedUnitSnapshot | null;
  hoveredHex: HexCoord | null;
  hoverCombat: HoverCombatSnapshot | null;
  pendingAttackPrompt: string | null;
  pendingAttackTargetCount: number;
};

function readSnapshot(): TacticalHudSnapshot {
  const runtime = getGameRuntime();
  const state = runtime.state;
  const hoveredHex = runtime.getHoveredHex();
  const selected = getSelectedUnit(state);
  const pendingAttackTargeting = runtime.getPendingAttackTargeting();
  const pendingAttackAttacker = pendingAttackTargeting
    ? state.entities[pendingAttackTargeting.attackerId]
    : null;
  const previewUnit =
    pendingAttackAttacker && pendingAttackAttacker.kind === "unit"
      ? pendingAttackAttacker
      : selected;
  const pendingAttackTargetCount =
    pendingAttackAttacker && pendingAttackAttacker.kind === "unit"
      ? getAttackableEntitiesForUnit(state, pendingAttackAttacker).length
      : 0;

  let hoverCombat: HoverCombatSnapshot | null = null;
  if (previewUnit && hoveredHex && isWithinMapBounds(hoveredHex, state.map)) {
    const hoveredEntity = getEntityAtCoord(state, hoveredHex, previewUnit.id);
    if (hoveredEntity && hoveredEntity.ownerId !== previewUnit.ownerId) {
      const distance = hexDistance(previewUnit.coord, hoveredEntity.coord);
      const attackRange = getEffectiveUnitAttackRange(state, previewUnit);
      const canAttackNow =
        state.phase === "tactical" &&
        previewUnit.attacksRemaining > 0 &&
        canUnitDeclareAttack(state, previewUnit) &&
        distance <= attackRange;
      const preview = resolveCombatAttack(state, previewUnit, hoveredEntity);
      hoverCombat = {
        targetId: hoveredEntity.id,
        targetName: getEntityDisplayName(hoveredEntity, state),
        targetKind: hoveredEntity.kind,
        targetOwnerLabel: getPlayerLabel(hoveredEntity.ownerId),
        distance,
        attackRange,
        canAttackNow,
        baseAttack: preview.baseAttack,
        siegeAttack: preview.siegeAttack,
        rawAttack: preview.rawAttack,
        defense: preview.defense,
        supplyPenalty: preview.supplyPenalty,
        distanceFromFriendlyBase: preview.distanceFromFriendlyBase,
        projectedDamage: preview.finalDamage,
        targetHpBefore: preview.targetHpBefore,
        targetHpAfter: preview.targetHpAfter,
        targetDestroyed: preview.targetDestroyed,
      };
    }
  }

  return {
    phase: state.phase,
    pendingAttackPrompt: pendingAttackTargeting?.prompt ?? null,
    pendingAttackTargetCount,
    selectedUnit: selected
      ? {
          id: selected.id,
          name: getEntityDisplayName(selected, state),
          ownerLabel: getPlayerLabel(selected.ownerId),
          factionLabel: formatFactionName(state.players[selected.ownerId].faction),
          role: selected.role,
          hp: selected.hp,
          armor: getEffectiveUnitArmor(state, selected),
          attackDamage: getEffectiveUnitAttackDamage(state, selected),
          siegeDamageBonus: getEffectiveUnitSiegeDamageBonus(state, selected),
          attackRange: getEffectiveUnitAttackRange(state, selected),
          movesRemaining: selected.movesRemaining,
          moveRange: getEffectiveUnitMoveRange(state, selected),
          attacksRemaining: selected.attacksRemaining,
          attackActionsPerTurn: selected.attackActionsPerTurn,
          hasSummoningSickness: selected.hasSummoningSickness,
          carries: selected.carries,
          rulesText: selected.sourceCardId ? getCardDefinition(selected.sourceCardId)?.text ?? null : null,
        }
      : null,
    hoveredHex,
    hoverCombat,
  };
}

export function GameHudPanels() {
  const snapshot = useRuntimeViewSnapshot(readSnapshot);

  const roleAccent = snapshot.selectedUnit ? getUnitRoleTheme(snapshot.selectedUnit.role).accent : undefined;
  const roleLabel = snapshot.selectedUnit ? getUnitRoleTheme(snapshot.selectedUnit.role).label : null;
  const selectedStatusLabel = snapshot.selectedUnit
    ? snapshot.selectedUnit.hasSummoningSickness
      ? "Summoning"
      : "Ready"
    : null;
  const cargoLabel = snapshot.selectedUnit?.carries ? snapshot.selectedUnit.carries : "No cargo";
  const canAttackLabel = snapshot.hoverCombat?.canAttackNow ? "Attack Ready" : "Out of Window";

  return (
    <aside className="game-hud-panels" aria-label="Tactical information">
      <section className="game-hud-panel selected-unit-panel">
        <div className="game-hud-panel-head">
          <p className="game-hud-title">Selected Unit</p>
          {roleLabel ? (
            <span className="game-hud-pill role" style={roleAccent ? { borderColor: roleAccent, color: roleAccent } : undefined}>
              {roleLabel}
            </span>
          ) : null}
        </div>
        {snapshot.selectedUnit ? (
          <>
            <div className="game-hud-entity-header">
              <strong style={roleAccent ? { color: roleAccent } : undefined}>{snapshot.selectedUnit.name}</strong>
              <span>
                {snapshot.selectedUnit.ownerLabel} · {snapshot.selectedUnit.factionLabel}
              </span>
            </div>
            <div className="game-hud-stat-grid">
              <span className="game-hud-stat-chip">
                <small>HP</small>
                <strong>{snapshot.selectedUnit.hp}</strong>
              </span>
              <span className="game-hud-stat-chip">
                <small>ARM</small>
                <strong>{snapshot.selectedUnit.armor}</strong>
              </span>
              <span className="game-hud-stat-chip">
                <small>ATK</small>
                <strong>{snapshot.selectedUnit.attackDamage}</strong>
              </span>
              <span className="game-hud-stat-chip">
                <small>RNG</small>
                <strong>{snapshot.selectedUnit.attackRange}</strong>
              </span>
              <span className="game-hud-stat-chip">
                <small>MOV</small>
                <strong>
                  {snapshot.selectedUnit.movesRemaining}/{snapshot.selectedUnit.moveRange}
                </strong>
              </span>
              <span className="game-hud-stat-chip">
                <small>ACT</small>
                <strong>
                  {snapshot.selectedUnit.attacksRemaining}/{snapshot.selectedUnit.attackActionsPerTurn}
                </strong>
              </span>
              <span className="game-hud-stat-chip">
                <small>SG</small>
                <strong>{snapshot.selectedUnit.siegeDamageBonus}</strong>
              </span>
            </div>
            <div className="game-hud-pill-row">
              <span className={["game-hud-pill", snapshot.selectedUnit.hasSummoningSickness ? "bad" : "good"].join(" ")}>
                {selectedStatusLabel}
              </span>
              <span className="game-hud-pill">{cargoLabel}</span>
            </div>
            {snapshot.selectedUnit.rulesText ? (
              <p className="game-hud-detail-line">{snapshot.selectedUnit.rulesText}</p>
            ) : null}
            <p className="game-hud-meta-line">Entity {snapshot.selectedUnit.id}</p>
          </>
        ) : (
          <p className="game-hud-empty">No unit selected.</p>
        )}
      </section>

      <section className="game-hud-panel combat-preview-panel">
        <div className="game-hud-panel-head">
          <p className="game-hud-title">Combat Preview</p>
          {snapshot.pendingAttackPrompt ? (
            <span className="game-hud-pill role">Attack Targeting</span>
          ) : snapshot.hoverCombat ? (
            <span className={["game-hud-pill", snapshot.hoverCombat.canAttackNow ? "good" : "bad"].join(" ")}>{canAttackLabel}</span>
          ) : null}
        </div>
        {snapshot.pendingAttackPrompt ? (
          <p className="game-hud-detail-line">
            {snapshot.pendingAttackPrompt} {snapshot.pendingAttackTargetCount > 0 ? `${snapshot.pendingAttackTargetCount} target${snapshot.pendingAttackTargetCount === 1 ? "" : "s"} in range.` : ""}
          </p>
        ) : null}
        {snapshot.hoverCombat ? (
          <>
            <div className="game-hud-entity-header">
              <strong>{snapshot.hoverCombat.targetName}</strong>
              <span>
                {snapshot.hoverCombat.targetOwnerLabel} · {snapshot.hoverCombat.targetKind}
              </span>
            </div>
            <div className="game-hud-stat-grid combat">
              <span className="game-hud-stat-chip">
                <small>RANGE</small>
                <strong>
                  {snapshot.hoverCombat.distance}/{snapshot.hoverCombat.attackRange}
                </strong>
              </span>
              <span className="game-hud-stat-chip">
                <small>DMG</small>
                <strong>{snapshot.hoverCombat.projectedDamage}</strong>
              </span>
              <span className="game-hud-stat-chip">
                <small>HP</small>
                <strong>
                  {snapshot.hoverCombat.targetHpBefore}
                  {" -> "}
                  {snapshot.hoverCombat.targetHpAfter}
                </strong>
              </span>
              <span className="game-hud-stat-chip">
                <small>KILL</small>
                <strong>{snapshot.hoverCombat.targetDestroyed ? "Yes" : "No"}</strong>
              </span>
              <span className="game-hud-stat-chip">
                <small>SUPPLY</small>
                <strong>{snapshot.hoverCombat.supplyPenalty}</strong>
              </span>
            </div>
            <p className="game-hud-detail-line">
              {snapshot.hoverCombat.targetKind === "base"
                ? `Base ${snapshot.hoverCombat.baseAttack} - Def ${snapshot.hoverCombat.defense} - Supply ${snapshot.hoverCombat.supplyPenalty}, then + SG ${snapshot.hoverCombat.siegeAttack} (distance ${snapshot.hoverCombat.distanceFromFriendlyBase})`
                : `Raw ${snapshot.hoverCombat.rawAttack} - Def ${snapshot.hoverCombat.defense} - Supply ${snapshot.hoverCombat.supplyPenalty} (distance ${snapshot.hoverCombat.distanceFromFriendlyBase})`}
            </p>
            <p className="game-hud-meta-line">Target {snapshot.hoverCombat.targetId}</p>
          </>
        ) : (
          <p className="game-hud-empty">
            {snapshot.pendingAttackPrompt
              ? "Click an enemy unit or base to attack."
              : snapshot.selectedUnit
              ? `Hover an enemy to preview combat (${snapshot.phase} phase).`
              : snapshot.hoveredHex
                ? "Select a unit to see combat previews."
                : "Hover the map and select a unit to preview combat."}
          </p>
        )}
      </section>
    </aside>
  );
}
