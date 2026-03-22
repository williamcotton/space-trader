import type { GameInstruction, InstructionContext } from "../../actions/instructions";
import { areSameHex } from "../../model/hex";
import type { UnitEntity } from "../../model/state";
import { LAYER } from "../../systems/continuousEffects";
import { getCascadeAffectedHexes } from "../../systems/cascade";

export function createCascadeAttackBuffInstructions(amount: number, waves: number) {
  return (context: InstructionContext): GameInstruction[] => {
    if (!context.targetHex) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no hex target configured.` }];
    }

    const affectedHexes = getCascadeAffectedHexes(context.state, context.controllerId, context.targetHex, waves);
    const friendlyUnits = Object.values(context.state.entities)
      .filter((entity): entity is UnitEntity =>
        entity.kind === "unit" &&
        entity.ownerId === context.controllerId &&
        affectedHexes.some((coord) => areSameHex(coord, entity.coord))
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    if (friendlyUnits.length === 0) {
      return [{
        type: "LOG",
        text: `Resolved ${context.item.label}: cascade touched ${affectedHexes.length} hexes but found no friendly units.`,
      }];
    }

    const instructions: GameInstruction[] = friendlyUnits.map((unit) => ({
      type: "APPLY_CONTINUOUS_EFFECT",
      effectId: `ce_${context.item.id}_${unit.id}_cascade_atk`,
      sourceEntityId: null,
      sourceCardId: context.item.sourceCardId,
      controllerId: context.controllerId,
      payload: { type: "stat_modifier", stat: "attackDamage", amount },
      target: { type: "specific_entity", entityId: unit.id },
      expiry: { type: "end_of_turn", turn: context.state.turn },
      layer: LAYER.TEMPORARY,
    }));

    instructions.push({
      type: "LOG",
      text: `Resolved ${context.item.label}: cascaded across ${affectedHexes.length} hexes and energized ${friendlyUnits.length} friendly unit${friendlyUnits.length === 1 ? "" : "s"}.`,
    });
    return instructions;
  };
}
