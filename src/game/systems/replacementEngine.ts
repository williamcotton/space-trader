import type { EntityId, PlayerId } from "../model/ids";
import type { GameState } from "../model/state";
import type { GameInstruction } from "../actions/instructions";
import type { ContinuousEffect } from "./continuousEffects";

// --- Replacement Effect Payload ---

export type ReplacementCondition =
  | { type: "damage_to_entity"; entityId: EntityId }
  | { type: "destruction_of_entity"; entityId: EntityId }
  | { type: "any_damage_to_friendly"; ownerId: PlayerId }
  | { type: "any_instruction_type"; instructionType: GameInstruction["type"] };

export type ReplacementAction =
  | { type: "prevent" }
  | { type: "reduce_amount"; reduction: number }
  | { type: "redirect"; newTargetEntityId: EntityId }
  | { type: "substitute"; instructions: GameInstruction[] }
  | { type: "exile_instead_of_destroy" };

export type ReplacementEffectPayload = {
  type: "replacement_effect";
  replaces: ReplacementCondition;
  replacement: ReplacementAction;
};

// --- Matching ---

const MAX_REPLACEMENT_DEPTH = 5;

function doesReplacementMatch(
  condition: ReplacementCondition,
  instruction: GameInstruction,
  state: GameState
): boolean {
  switch (condition.type) {
    case "damage_to_entity":
      return instruction.type === "DEAL_DAMAGE" && instruction.targetEntityId === condition.entityId;

    case "destruction_of_entity":
      return instruction.type === "DESTROY_ENTITY" && instruction.targetEntityId === condition.entityId;

    case "any_damage_to_friendly": {
      if (instruction.type !== "DEAL_DAMAGE") return false;
      const target = state.entities[instruction.targetEntityId];
      return target != null && target.ownerId === condition.ownerId;
    }

    case "any_instruction_type":
      return instruction.type === condition.instructionType;
  }
}

function getReplacementEffects(state: GameState): ContinuousEffect[] {
  return state.continuousEffects
    .filter((e) => {
      if (e.payload.type !== "replacement_effect") return false;
      // Skip exhausted one-shot effects
      if (e.expiry.type === "until_used" && e.expiry.usesRemaining <= 0) return false;
      return true;
    })
    .sort((a, b) => {
      // Self-controlled replacement effects apply first (by controllerId of active player)
      const aIsActive = a.controllerId === state.activePlayerId ? 0 : 1;
      const bIsActive = b.controllerId === state.activePlayerId ? 0 : 1;
      if (aIsActive !== bIsActive) return aIsActive - bIsActive;
      // Timestamp tiebreaker
      return a.timestamp - b.timestamp;
    });
}

function consumeOneShot(effect: ContinuousEffect): void {
  if (effect.expiry.type === "until_used") {
    effect.expiry.usesRemaining -= 1;
  }
}

// --- Main API ---

export function applyReplacementEffects(
  state: GameState,
  instruction: GameInstruction,
  depth = 0,
  appliedEffectIds: Set<string> = new Set()
): GameInstruction[] {
  if (depth >= MAX_REPLACEMENT_DEPTH) {
    state.log.push({
      turn: state.turn,
      text: "Replacement effect depth limit reached — applying instruction as-is.",
    });
    return [instruction];
  }

  const replacementEffects = getReplacementEffects(state);

  for (const effect of replacementEffects) {
    if (appliedEffectIds.has(effect.id)) continue;

    const payload = effect.payload as ReplacementEffectPayload;
    if (!doesReplacementMatch(payload.replaces, instruction, state)) {
      continue;
    }

    // Found a matching replacement effect — apply it
    consumeOneShot(effect);
    const nextApplied = new Set(appliedEffectIds);
    nextApplied.add(effect.id);

    switch (payload.replacement.type) {
      case "prevent":
        state.log.push({
          turn: state.turn,
          text: `Replacement effect (${effect.id}): prevented ${instruction.type}.`,
        });
        return [];

      case "reduce_amount": {
        if (instruction.type === "DEAL_DAMAGE") {
          const reduced = Math.max(0, instruction.amount - payload.replacement.reduction);
          if (reduced === 0) {
            state.log.push({
              turn: state.turn,
              text: `Replacement effect (${effect.id}): reduced damage to 0 — prevented.`,
            });
            return [];
          }
          state.log.push({
            turn: state.turn,
            text: `Replacement effect (${effect.id}): reduced damage by ${payload.replacement.reduction}.`,
          });
          return applyReplacementEffects(
            state,
            { ...instruction, amount: reduced },
            depth + 1,
            nextApplied
          );
        }
        return [instruction];
      }

      case "redirect": {
        if (instruction.type === "DEAL_DAMAGE") {
          state.log.push({
            turn: state.turn,
            text: `Replacement effect (${effect.id}): redirected damage to ${payload.replacement.newTargetEntityId}.`,
          });
          return applyReplacementEffects(
            state,
            { ...instruction, targetEntityId: payload.replacement.newTargetEntityId },
            depth + 1,
            nextApplied
          );
        }
        if (instruction.type === "DESTROY_ENTITY") {
          state.log.push({
            turn: state.turn,
            text: `Replacement effect (${effect.id}): redirected destruction to ${payload.replacement.newTargetEntityId}.`,
          });
          return applyReplacementEffects(
            state,
            { ...instruction, targetEntityId: payload.replacement.newTargetEntityId },
            depth + 1,
            nextApplied
          );
        }
        return [instruction];
      }

      case "substitute":
        state.log.push({
          turn: state.turn,
          text: `Replacement effect (${effect.id}): substituted ${instruction.type} with ${payload.replacement.instructions.length} instructions.`,
        });
        return payload.replacement.instructions;

      case "exile_instead_of_destroy":
        if (instruction.type === "DESTROY_ENTITY") {
          state.log.push({
            turn: state.turn,
            text: `Replacement effect (${effect.id}): exile instead of destroy for ${instruction.targetEntityId}.`,
          });
          // For now, just prevent destruction (exile zone for entities is future work)
          return [];
        }
        return [instruction];
    }
  }

  // No replacement matched — instruction passes through unchanged
  return [instruction];
}
