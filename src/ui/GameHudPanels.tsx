import type { GamePhase } from "../game/model/enums";
import { areSameHex, hexDistance, isWithinMapBounds } from "../game/model/hex";
import type { EntityState, GameState, UnitEntity } from "../game/model/state";
import { formatFactionName, getEntityDisplayName, getPlayerLabel, getUnitRoleTheme } from "../game/presentation";
import { getGameRuntime } from "../game/runtime";
import { resolveCombatAttack } from "../game/systems/combat";
import { getEffectiveUnitArmor, getEffectiveUnitAttackDamage } from "../game/systems/unitStats";
import { useGameSnapshot } from "./useGameSnapshot";

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
};

type HoverCombatSnapshot = {
  targetId: string;
  targetName: string;
  targetKind: EntityState["kind"];
  targetOwnerLabel: string;
  distance: number;
  attackRange: number;
  canAttackNow: boolean;
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
  hoveredHex: GameState["hoveredHex"];
  hoverCombat: HoverCombatSnapshot | null;
};

function getSelectedUnit(state: GameState): UnitEntity | null {
  if (!state.selectedEntityId) {
    return null;
  }

  const selected = state.entities[state.selectedEntityId];
  if (!selected || selected.kind !== "unit") {
    return null;
  }
  return selected;
}

function getEntityAtCoord(state: GameState, coord: { q: number; r: number }, ignoreEntityId?: string): EntityState | null {
  return (
    Object.values(state.entities).find((entity) => {
      if (ignoreEntityId && entity.id === ignoreEntityId) {
        return false;
      }
      return areSameHex(entity.coord, coord);
    }) ?? null
  );
}

function readSnapshot(): TacticalHudSnapshot {
  const runtime = getGameRuntime();
  const state = runtime.state;
  const selected = getSelectedUnit(state);

  let hoverCombat: HoverCombatSnapshot | null = null;
  if (selected && state.hoveredHex && isWithinMapBounds(state.hoveredHex, state.map)) {
    const hoveredEntity = getEntityAtCoord(state, state.hoveredHex, selected.id);
    if (hoveredEntity && hoveredEntity.ownerId !== selected.ownerId) {
      const distance = hexDistance(selected.coord, hoveredEntity.coord);
      const canAttackNow = state.phase === "tactical" && selected.attacksRemaining > 0 && distance <= selected.attackRange;
      const preview = resolveCombatAttack(state, selected, hoveredEntity);
      hoverCombat = {
        targetId: hoveredEntity.id,
        targetName: getEntityDisplayName(hoveredEntity, state),
        targetKind: hoveredEntity.kind,
        targetOwnerLabel: getPlayerLabel(hoveredEntity.ownerId),
        distance,
        attackRange: selected.attackRange,
        canAttackNow,
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
          siegeDamageBonus: selected.siegeDamageBonus,
          attackRange: selected.attackRange,
          movesRemaining: selected.movesRemaining,
          moveRange: selected.moveRange,
          attacksRemaining: selected.attacksRemaining,
          attackActionsPerTurn: selected.attackActionsPerTurn,
          hasSummoningSickness: selected.hasSummoningSickness,
          carries: selected.carries,
        }
      : null,
    hoveredHex: state.hoveredHex,
    hoverCombat,
  };
}

export function GameHudPanels() {
  const snapshot = useGameSnapshot(readSnapshot);

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
            <p className="game-hud-meta-line">Entity {snapshot.selectedUnit.id}</p>
          </>
        ) : (
          <p className="game-hud-empty">No unit selected.</p>
        )}
      </section>

      <section className="game-hud-panel combat-preview-panel">
        <div className="game-hud-panel-head">
          <p className="game-hud-title">Combat Preview</p>
          {snapshot.hoverCombat ? (
            <span className={["game-hud-pill", snapshot.hoverCombat.canAttackNow ? "good" : "bad"].join(" ")}>{canAttackLabel}</span>
          ) : null}
        </div>
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
                <strong>{snapshot.hoverCombat.distanceFromFriendlyBase}</strong>
              </span>
            </div>
            <p className="game-hud-detail-line">
              Raw {snapshot.hoverCombat.rawAttack} - Def {snapshot.hoverCombat.defense} - Supply {snapshot.hoverCombat.supplyPenalty}
            </p>
            <p className="game-hud-meta-line">Target {snapshot.hoverCombat.targetId}</p>
          </>
        ) : (
          <p className="game-hud-empty">
            {snapshot.selectedUnit
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
