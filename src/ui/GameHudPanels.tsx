import { useEffect, useState } from "react";
import type { GamePhase } from "../game/model/enums";
import { areSameHex, hexDistance, isWithinMapBounds } from "../game/model/hex";
import type { EntityState, GameState, UnitEntity } from "../game/model/state";
import { formatFactionName, getEntityDisplayName, getPlayerLabel, getUnitRoleTheme } from "../game/presentation";
import { getGameRuntime } from "../game/runtime";
import { resolveCombatAttack } from "../game/systems/combat";

type SelectedUnitSnapshot = {
  id: string;
  name: string;
  ownerLabel: string;
  factionLabel: string;
  role: UnitEntity["role"];
  hp: number;
  armor: number;
  attackDamage: number;
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
          armor: selected.armor,
          attackDamage: selected.attackDamage,
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
  const [snapshot, setSnapshot] = useState<TacticalHudSnapshot>(() => readSnapshot());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSnapshot(readSnapshot());
    }, 120);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const roleAccent = snapshot.selectedUnit ? getUnitRoleTheme(snapshot.selectedUnit.role).accent : undefined;

  return (
    <aside className="game-hud-panels" aria-label="Tactical information">
      <section className="game-hud-panel">
        <p className="game-hud-title">Selected Unit</p>
        {snapshot.selectedUnit ? (
          <>
            <div className="game-hud-entity-header">
              <strong style={roleAccent ? { color: roleAccent } : undefined}>{snapshot.selectedUnit.name}</strong>
              <span>
                {snapshot.selectedUnit.ownerLabel} · {snapshot.selectedUnit.factionLabel}
              </span>
            </div>
            <div className="game-hud-grid">
              <span className="game-hud-label">Role</span>
              <span>{snapshot.selectedUnit.role}</span>
              <span className="game-hud-label">HP / Armor</span>
              <span>
                {snapshot.selectedUnit.hp} / {snapshot.selectedUnit.armor}
              </span>
              <span className="game-hud-label">Attack / Range</span>
              <span>
                {snapshot.selectedUnit.attackDamage} / {snapshot.selectedUnit.attackRange}
              </span>
              <span className="game-hud-label">Move</span>
              <span>
                {snapshot.selectedUnit.movesRemaining}/{snapshot.selectedUnit.moveRange}
              </span>
              <span className="game-hud-label">Attacks</span>
              <span>
                {snapshot.selectedUnit.attacksRemaining}/{snapshot.selectedUnit.attackActionsPerTurn}
              </span>
              <span className="game-hud-label">Summoning</span>
              <span>{snapshot.selectedUnit.hasSummoningSickness ? "Sick" : "Ready"}</span>
              <span className="game-hud-label">Cargo</span>
              <span>{snapshot.selectedUnit.carries ?? "none"}</span>
              <span className="game-hud-label">Entity ID</span>
              <span className="game-hud-id">{snapshot.selectedUnit.id}</span>
            </div>
          </>
        ) : (
          <p className="game-hud-empty">No unit selected.</p>
        )}
      </section>

      <section className="game-hud-panel">
        <p className="game-hud-title">Hover Combat Preview</p>
        {snapshot.hoverCombat ? (
          <>
            <div className="game-hud-entity-header">
              <strong>{snapshot.hoverCombat.targetName}</strong>
              <span>
                {snapshot.hoverCombat.targetOwnerLabel} · {snapshot.hoverCombat.targetKind}
              </span>
            </div>
            <div className="game-hud-grid">
              <span className="game-hud-label">Range Check</span>
              <span>
                {snapshot.hoverCombat.distance}/{snapshot.hoverCombat.attackRange}
              </span>
              <span className="game-hud-label">Can Attack Now</span>
              <span className={snapshot.hoverCombat.canAttackNow ? "game-hud-good" : "game-hud-bad"}>
                {snapshot.hoverCombat.canAttackNow ? "yes" : "no"}
              </span>
              <span className="game-hud-label">Projected Damage</span>
              <span>{snapshot.hoverCombat.projectedDamage}</span>
              <span className="game-hud-label">Projected HP</span>
              <span>
                {snapshot.hoverCombat.targetHpBefore}
                {" -> "}
                {snapshot.hoverCombat.targetHpAfter}
              </span>
              <span className="game-hud-label">Projected Kill</span>
              <span>{snapshot.hoverCombat.targetDestroyed ? "yes" : "no"}</span>
              <span className="game-hud-label">Formula</span>
              <span>
                raw {snapshot.hoverCombat.rawAttack} - def {snapshot.hoverCombat.defense} - supply {snapshot.hoverCombat.supplyPenalty}
              </span>
              <span className="game-hud-label">Supply Distance</span>
              <span>{snapshot.hoverCombat.distanceFromFriendlyBase}</span>
              <span className="game-hud-label">Target ID</span>
              <span className="game-hud-id">{snapshot.hoverCombat.targetId}</span>
            </div>
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
