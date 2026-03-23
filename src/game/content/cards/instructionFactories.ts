import type { GameInstruction, InstructionContext } from "../../actions/instructions";
import { areSameHex } from "../../model/hex";
import type { UnitEntity } from "../../model/state";
import { LAYER } from "../../systems/continuousEffects";
import { getCascadeAffectedHexes } from "../../systems/cascade";
import type { ResourceType, UnitRole } from "../../model/enums";

type CascadeUnitBuffOptions = {
  attackBonus?: number;
  armorBonus?: number;
  waves: number;
  roleFilter?: UnitRole;
  reward?: {
    resource: ResourceType;
    amount: number;
    minUnits: number;
  };
};

function getAffectedFriendlyUnits(context: InstructionContext, waves: number, roleFilter?: UnitRole) {
  if (!context.targetHex) {
    return {
      affectedHexes: [],
      friendlyUnits: [],
    };
  }

  const affectedHexes = getCascadeAffectedHexes(context.state, context.controllerId, context.targetHex, waves);
  const friendlyUnits = Object.values(context.state.entities)
    .filter((entity): entity is UnitEntity =>
      entity.kind === "unit" &&
      entity.ownerId === context.controllerId &&
      (!roleFilter || entity.role === roleFilter) &&
      affectedHexes.some((coord) => areSameHex(coord, entity.coord))
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  return { affectedHexes, friendlyUnits };
}

export function createCascadeUnitBuffInstructions(options: CascadeUnitBuffOptions) {
  const attackBonus = options.attackBonus ?? 0;
  const armorBonus = options.armorBonus ?? 0;

  return (context: InstructionContext): GameInstruction[] => {
    if (!context.targetHex) {
      return [{ type: "LOG", text: `Resolved ${context.item.label}: no hex target configured.` }];
    }

    const { affectedHexes, friendlyUnits } = getAffectedFriendlyUnits(context, options.waves, options.roleFilter);

    if (friendlyUnits.length === 0) {
      return [{
        type: "LOG",
        text: `Resolved ${context.item.label}: cascade touched ${affectedHexes.length} hexes but found no eligible friendly units.`,
      }];
    }

    const instructions: GameInstruction[] = [];
    for (const unit of friendlyUnits) {
      if (attackBonus !== 0) {
        instructions.push({
          type: "APPLY_CONTINUOUS_EFFECT",
          effectId: `ce_${context.item.id}_${unit.id}_cascade_atk`,
          sourceEntityId: null,
          sourceCardId: context.item.sourceCardId,
          controllerId: context.controllerId,
          payload: { type: "stat_modifier", stat: "attackDamage", amount: attackBonus },
          target: { type: "specific_entity", entityId: unit.id },
          expiry: { type: "end_of_turn", turn: context.state.turn },
          layer: LAYER.TEMPORARY,
        });
      }

      if (armorBonus !== 0) {
        instructions.push({
          type: "APPLY_CONTINUOUS_EFFECT",
          effectId: `ce_${context.item.id}_${unit.id}_cascade_arm`,
          sourceEntityId: null,
          sourceCardId: context.item.sourceCardId,
          controllerId: context.controllerId,
          payload: { type: "stat_modifier", stat: "armor", amount: armorBonus },
          target: { type: "specific_entity", entityId: unit.id },
          expiry: { type: "end_of_turn", turn: context.state.turn },
          layer: LAYER.TEMPORARY,
        });
      }
    }

    if (options.reward && friendlyUnits.length >= options.reward.minUnits) {
      instructions.push({
        type: "GAIN_RESOURCES",
        playerId: context.controllerId,
        resources: {
          [options.reward.resource]: options.reward.amount,
        },
      });
    }

    const buffLabelParts: string[] = [];
    if (attackBonus !== 0) {
      buffLabelParts.push(`${attackBonus > 0 ? "+" : ""}${attackBonus} ATK`);
    }
    if (armorBonus !== 0) {
      buffLabelParts.push(`${armorBonus > 0 ? "+" : ""}${armorBonus} ARM`);
    }

    const rewardText = options.reward && friendlyUnits.length >= options.reward.minUnits
      ? ` and generated ${options.reward.amount} ${options.reward.resource}`
      : "";

    instructions.push({
      type: "LOG",
      text: `Resolved ${context.item.label}: cascaded across ${affectedHexes.length} hexes, buffed ${friendlyUnits.length} unit${friendlyUnits.length === 1 ? "" : "s"} with ${buffLabelParts.join(" and ")}${rewardText}.`,
    });

    return instructions;
  };
}

export function createCascadeAttackBuffInstructions(amount: number, waves: number) {
  return createCascadeUnitBuffInstructions({
    attackBonus: amount,
    waves,
  });
}
