# Layers Refactor: Cached Derived Continuous Effects

## Context

The continuous effects system currently computes effective unit stats and keywords **on-demand** — every call to `getEffectiveStatValue()` or `getEffectiveKeywordsForUnit()` iterates all `state.continuousEffects`, filters for applicability, sorts by layer/timestamp, and reduces. With 15+ consumer files (combat, AI, validators, rendering, mechanics) calling these functions repeatedly, this is redundant work and architecturally fragile for future expansion (e.g., effects that depend on other effects' results across layers).

The refactor shifts to a **cached layer pipeline**: compute all effective stats and keywords once per state mutation, store results in `DerivedState`, and have consumers read from the cache with an on-demand fallback for AI simulation and special queries.

## Plan

### Step 1: Create the layer pipeline module

**New file: `src/game/systems/effectPipeline.ts`**

Export a single pure function:

```typescript
export function computeEffectiveEntityStats(
  state: Readonly<GameState>
): {
  stats: Map<EntityId, EffectiveUnitStats>;
  keywords: Map<EntityId, string[]>;
}
```

Algorithm:
1. Iterate all entities — for each unit, collect applicable non-replacement continuous effects via `doesEffectApplyToEntity()`
2. Sort each unit's effects by `(layer, timestamp)`
3. Process in order: `keyword_grant` adds to keyword set, `stat_set` overrides, `stat_modifier` adds
4. After all continuous effects, call `getRegisteredUnitStatAdjustments()` for each stat — pass a shallow copy of the unit with `keywords` set to the pipeline-resolved keywords so hooks (like bastion) see the correct keyword state
5. Clamp `moveRange` and `attackRange` to >= 0
6. Return the two Maps

Key detail: `doesEffectApplyToEntity` must be exported from `continuousEffects.ts` (currently module-private). Add the export.

### Step 2: Create the derived state reference module

**New file: `src/game/systems/derivedStateRef.ts`**

Simple module-level accessor:

```typescript
let currentDerivedState: DerivedState | null = null;
export function setCurrentDerivedState(d: DerivedState | null): void { ... }
export function getCurrentDerivedState(): DerivedState | null { ... }
```

This avoids passing `DerivedState` through every function signature. The runtime sets it after rebuild. AI workers and tests that don't use a runtime leave it null, so consumers fall back to on-demand computation.

### Step 3: Extend DerivedState

**File: `src/game/derived.ts`**

- Add `EffectiveUnitStats` type (7 stat fields: attackDamage, armor, siegeDamageBonus, moveRange, attackRange, hp, maxHp)
- Add `effectiveStats: Map<EntityId, EffectiveUnitStats>` and `effectiveKeywords: Map<EntityId, string[]>` to `DerivedState`
- Update `createEmptyDerivedState()` with empty Maps
- Update `rebuildDerivedState()` to call `computeEffectiveEntityStats(state)` and include results

### Step 4: Update unitStats.ts with cache-first path

**File: `src/game/systems/unitStats.ts`**

Each wrapper checks cache before falling back to on-demand:

```typescript
export function getEffectiveUnitAttackDamage(state: GameState, unit: UnitEntity): number {
  const derived = getCurrentDerivedState();
  if (derived?.effectiveStats.has(unit.id)) {
    return derived.effectiveStats.get(unit.id)!.attackDamage;
  }
  return getEffectiveStatValue(state, unit, "attackDamage");
}
```

Same pattern for all 5 stat getters. The fallback ensures AI minimax (which `structuredClone`s state without a runtime) continues working.

### Step 5: Update keywords.ts with cache-first path

**File: `src/game/systems/keywords.ts`**

Update `unitHasActiveKeyword`:
- When no `excludeEffectIdPrefix` option is set, check cache first
- When `excludeEffectIdPrefix` IS set (used by bloom mechanics to avoid re-triggering), always use on-demand path — this is a hypothetical query the cache can't answer

### Step 6: Wire runtime to set the derived state reference

**File: `src/game/runtime.ts`**

After the existing derived state rebuild in `step()`:
```typescript
setCurrentDerivedState(this.derivedState);
```

### Step 7: Export `doesEffectApplyToEntity` from continuousEffects.ts

**File: `src/game/systems/continuousEffects.ts`**

Change `doesEffectApplyToEntity` from a module-private function to an exported function. No logic changes.

### Step 8: Write tests

**New file: `src/game/systems/effectPipeline.test.ts`**

Test cases:
- Base stats with no effects return unit's raw values
- Single stat_modifier applies correctly
- Multiple modifiers across layers stack in order
- stat_set overrides preceding modifiers; stat_modifier in higher layer adds on top of stat_set
- keyword_grant at ABILITY layer is visible to stat hooks that check keywords
- replacement_effect payloads are skipped (not treated as stat/keyword effects)
- adjacent_allies targeting respects position
- moveRange and attackRange are clamped to >= 0

Also update `src/game/derived.test.ts` (or add to the new test file) to verify `rebuildDerivedState` populates the new fields.

### Step 9: Run full test suite, verify zero regressions

`npm test` — all existing tests in `continuousEffects.test.ts`, `reducers.test.ts`, and any other game logic tests must pass unchanged.

## Files Changed

| File | Change |
|------|--------|
| `src/game/systems/effectPipeline.ts` | **NEW** — core pipeline |
| `src/game/systems/derivedStateRef.ts` | **NEW** — module-level cache accessor |
| `src/game/systems/effectPipeline.test.ts` | **NEW** — pipeline tests |
| `src/game/derived.ts` | Add types, extend DerivedState, wire pipeline |
| `src/game/systems/continuousEffects.ts` | Export `doesEffectApplyToEntity` |
| `src/game/systems/unitStats.ts` | Cache-first path in each wrapper |
| `src/game/systems/keywords.ts` | Cache-first path in `unitHasActiveKeyword` |
| `src/game/runtime.ts` | Set derived state ref after rebuild |

## Files NOT Changed

- All 15+ consumer files (combat.ts, validators.ts, AI modules, overlays.ts, phaseMachine.ts, autoFlow.ts, mechanic modules) — zero changes, same API
- `replacementEngine.ts` — replacement effects are independent, filtered out of stat pipeline
- `unitStatHooks.ts` — registry mechanism unchanged; pipeline calls hooks with pre-resolved keywords
- `continuousEffects.test.ts` — existing tests continue testing the on-demand path

## Key Design Decisions

1. **Cache per-stat maps, not parallel entity objects** — avoids confusion about which entity is canonical
2. **Module-level ref (not GameState field)** — keeps GameState clean, avoids serialization issues for multiplayer
3. **On-demand fallback preserved** — AI minimax clones state without a runtime; the fallback ensures correctness
4. **Unit stat hooks run with pre-resolved keywords** — passing `{ ...unit, keywords: resolvedKeywords }` to hooks so bastion etc. see pipeline-computed keywords without recursion
5. **`excludeEffectIdPrefix` queries bypass cache** — these are hypothetical "what-if" queries used during card resolution that can't be answered from the cache
6. **Full recalculation, no dirty tracking** — at most ~30 entities x ~30 effects = trivial cost; simpler and more deterministic

## Verification

1. `npm test` — all existing tests pass
2. `npm run typecheck` — no type errors
3. Manual: run `npm run dev`, play a match, verify combat damage and keyword effects behave identically
4. Manual: play a network match to verify determinism (server and client derive same stats)
