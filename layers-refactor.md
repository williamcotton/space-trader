# Layers Refactor: Cached Derived Continuous Effects

## Context

The continuous effects system currently computes effective unit stats and keywords **on-demand** — every call to `getEffectiveStatValue()` or `getEffectiveKeywordsForUnit()` iterates all `state.continuousEffects`, filters for applicability, sorts by layer/timestamp, and reduces. With 15+ consumer files (combat, AI, validators, rendering, mechanics) calling these functions repeatedly, this is redundant work and architecturally fragile for future expansion (e.g., effects that depend on other effects' results across layers).

The refactor shifts to a **cached functional layer pipeline**: treat continuous effects as a domain-specific language defining mathematical operations and property overrides on game pieces. Build a pipeline of discrete, per-layer pure functions that pipe intermediate entity state through each layer sequentially — feeding the output of Layer N as input to Layer N+1. This makes each layer independently testable, keeps the door open for future MTG-style layer types (copy effects, control changes, stat swaps), and caches the final results in `DerivedState`.

## Layer Definitions

Expand the existing LAYER constants to represent the full MTG-inspired pipeline. Current layers used by game content are preserved at their existing numeric values; new layers are reserved for future expansion:

```typescript
export const LAYER = {
  COPY:      0,  // Future: "become a copy of target unit"
  CONTROL:   1,  // Future: "gain control of target unit"
  ABILITY:   2,  // Keyword grants (existing — keyword_grant effects live here)
  STATIC:    3,  // Persistent stat modifiers (existing — auras, permanent buffs)
  TEMPORARY: 4,  // Temporary stat modifiers (existing — end-of-turn buffs)
  COUNTER:   5,  // Counter-based modifiers (existing — +1/+1 counters)
  SWAP:      6,  // Future: "swap attack and HP"
  HOOKS:     7,  // Unit stat hooks (bastion etc.) — always last
} as const;
```

Note: the existing numeric values for ABILITY(2), STATIC(3), TEMPORARY(4), COUNTER(5) are unchanged, so all existing card content remains compatible.

## Plan

### Step 1: Create the per-layer functional pipeline module

**New file: `src/game/systems/effectPipeline.ts`**

The core idea: each layer is a pure function that takes the current derived entity state and returns a new derived entity state. The pipeline composes them:

```typescript
// --- Per-entity intermediate state piped through the pipeline ---
type DerivedEntityState = {
  stats: EffectiveUnitStats;
  keywords: Set<string>;
};

// --- Layer processor signature ---
type LayerProcessor = (
  state: Readonly<GameState>,
  unit: Readonly<UnitEntity>,
  effects: ContinuousEffect[],  // only effects in this layer, sorted by timestamp
  derived: DerivedEntityState,
) => DerivedEntityState;
```

Each layer gets its own processor function:

```typescript
// Layer 0 — COPY (stub for future)
function applyCopyLayer(state, unit, effects, derived): DerivedEntityState {
  // Future: if effects contain copy instructions, replace base stats/keywords
  return derived;
}

// Layer 1 — CONTROL (stub for future)
function applyControlLayer(state, unit, effects, derived): DerivedEntityState {
  // Future: if effects change ownership, update controllerId-dependent state
  return derived;
}

// Layer 2 — ABILITY (keyword grants)
function applyAbilityLayer(state, unit, effects, derived): DerivedEntityState {
  const keywords = new Set(derived.keywords);
  for (const effect of effects) {
    if (effect.payload.type === "keyword_grant") {
      keywords.add(effect.payload.keyword);
    }
  }
  return { ...derived, keywords };
}

// Layer 3 — STATIC (persistent stat modifiers/setters)
function applyStaticLayer(state, unit, effects, derived): DerivedEntityState {
  return applyStatEffects(effects, derived);
}

// Layer 4 — TEMPORARY (temporary stat modifiers/setters)
function applyTemporaryLayer(state, unit, effects, derived): DerivedEntityState {
  return applyStatEffects(effects, derived);
}

// Layer 5 — COUNTER (counter-based modifiers)
function applyCounterLayer(state, unit, effects, derived): DerivedEntityState {
  return applyStatEffects(effects, derived);
}

// Layer 6 — SWAP (stub for future)
function applySwapLayer(state, unit, effects, derived): DerivedEntityState {
  // Future: swap stat values (e.g., swap attackDamage and hp)
  return derived;
}

// Layer 7 — HOOKS (registered unit stat hooks like bastion)
function applyHooksLayer(state, unit, effects, derived): DerivedEntityState {
  const unitWithResolvedKeywords = { ...unit, keywords: [...derived.keywords] };
  const stats = { ...derived.stats };
  for (const stat of STAT_NAMES) {
    stats[stat] += getRegisteredUnitStatAdjustments(state, unitWithResolvedKeywords, stat);
  }
  return { ...derived, stats };
}
```

Shared helper for stat effect layers (STATIC, TEMPORARY, COUNTER all use the same logic):

```typescript
function applyStatEffects(effects: ContinuousEffect[], derived: DerivedEntityState): DerivedEntityState {
  const stats = { ...derived.stats };
  for (const effect of effects) {
    if (effect.payload.type === "stat_modifier") {
      stats[effect.payload.stat] += effect.payload.amount;
    } else if (effect.payload.type === "stat_set") {
      stats[effect.payload.stat] = effect.payload.value;
    }
  }
  return { ...derived, stats };
}
```

The pipeline composes them in strict order:

```typescript
const LAYER_PIPELINE: { layer: number; processor: LayerProcessor }[] = [
  { layer: LAYER.COPY,      processor: applyCopyLayer },
  { layer: LAYER.CONTROL,   processor: applyControlLayer },
  { layer: LAYER.ABILITY,   processor: applyAbilityLayer },
  { layer: LAYER.STATIC,    processor: applyStaticLayer },
  { layer: LAYER.TEMPORARY, processor: applyTemporaryLayer },
  { layer: LAYER.COUNTER,   processor: applyCounterLayer },
  { layer: LAYER.SWAP,      processor: applySwapLayer },
  { layer: LAYER.HOOKS,     processor: applyHooksLayer },
];
```

The top-level entry point:

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
2. Bucket effects by layer number, sort within each bucket by timestamp
3. Seed `DerivedEntityState` from the unit's base stats and base keywords
4. Pipe through `LAYER_PIPELINE` — each processor receives only the effects for its layer
5. After the pipeline, clamp `moveRange` and `attackRange` to >= 0
6. Store final stats and keywords in the output Maps

Key detail: `doesEffectApplyToEntity` must be exported from `continuousEffects.ts` (currently module-private). Add the export.

#### Why per-layer functions instead of a single sorted pass

- **Extensibility**: Adding copy effects, control-changing effects, or stat swaps later means writing a new processor function and inserting it in `LAYER_PIPELINE` — no changes to existing processors
- **Testability**: Each layer processor is a pure function that can be unit-tested in isolation
- **Dependency correctness**: Keywords resolved in ABILITY (Layer 2) are guaranteed visible to stat hooks in HOOKS (Layer 7) because the pipeline feeds each layer's output forward
- **Future layer types**: Copy and swap effects require fundamentally different processing logic (replacing stats wholesale vs. transposing values) that can't be expressed as additive/override in a flat loop

#### Existing cards and the CONTROL layer

`signal_hijack` ("Gain control of target enemy unit") already exists in the alpha set. Today it works via a `CHANGE_ENTITY_OWNER` instruction in `instructionHandlers.ts` that directly mutates `target.ownerId` — a permanent, immediate state change that does NOT go through continuous effects.

This refactor does **not** migrate `CHANGE_ENTITY_OWNER` into the CONTROL layer. Doing so would require making ownership a *derived* property, which touches every system that reads `entity.ownerId` (targeting, auras, combat, AI evaluation, rendering). That's a separate, larger refactor.

The CONTROL layer stub exists so that **future** temporary-control effects (e.g., "gain control of target unit until end of turn") can be implemented as continuous effects with expiry, at which point:
- `DerivedEntityState` would gain an `ownerId` field
- The CONTROL layer processor would resolve the effective owner
- Systems would read derived ownership for targeting/aura calculations
- The existing permanent `CHANGE_ENTITY_OWNER` instruction would remain for permanent control changes (it mutates the base state; the CONTROL layer would have no effects to override it)

For now, the permanent `signal_hijack` path stays as-is. No card content changes in this refactor.

#### Existing card coverage per layer

| Layer | Status | Existing cards/effects |
|-------|--------|----------------------|
| COPY (0) | Stub | None — no copy effects exist yet |
| CONTROL (1) | Stub | `signal_hijack` exists but uses `CHANGE_ENTITY_OWNER` instruction, not continuous effects |
| ABILITY (2) | Active | See keyword grant cards below |
| STATIC (3) | Active | See permanent modifier cards below |
| TEMPORARY (4) | Active | See end-of-turn modifier cards below |
| COUNTER (5) | Active | Counter-based modifiers (permanent +1/+1 style effects) |
| SWAP (6) | Stub | None — no stat swap effects exist yet |
| HOOKS (7) | Active | Bastion mechanic (+1 armor to adjacent allies via `unitStatHooks` registry) |

**ABILITY layer (keyword grants) — existing cards:**
- `phase_coil` — cascade grants Relay to friendly units until end of turn
- `feeding_frenzy` — global grant of Predation to friendly resource units until end of turn
- `bulwark_refit` — grants Emplaced to target allied resource unit permanently
- Unit base keywords: `salvage` (frontline_scout, alloy_guard), `bastion` (alloy_guard, linebreak_marshal, scrap_quartermaster, forge_hauler, spore_hauler), `relay` (relay_savant, arc_repeater), `bloom` (bloom_archivist, various biomass units), `stealth`, `sprout`, `surge` (on tactic cards), `predation`, `emplaced`, `uncounterable`

**STATIC layer (permanent modifiers) — existing cards:**
- `forge_captain_card` — aura: adjacent allied combat units get +1 ATK (via `adjacent_allies` target filter, `while_source_alive` expiry)
- `linebreak_marshal_card` — aura: adjacent allied combat units get +1 SG (same pattern)
- `bulwark_refit` — permanent +2 SG, +1 ARM, and `stat_set` moveRange to 0 on target resource unit

**TEMPORARY layer (end-of-turn modifiers) — existing cards:**
- `brace_protocol` — target allied unit gets +2 ARM until your next turn (start_of_turn expiry)
- `patchwork_barrier` — cascade +1 ARM to friendly combat units until end of turn
- `shrapnel_relay` — cascade +1 ATK and +1 ARM to friendly combat units until end of turn
- `neural_echo` — cascade +1 ATK to friendly units until end of turn
- `spore_bloom` — cascade +1 ARM to friendly units until end of turn
- `ion_shower` — cascade +1 ATK to friendly units until end of turn
- `signal_fork` — cascade +1 ATK to friendly units until end of turn
- `chain_beacon` — cascade +1 ATK to friendly units until end of turn
- `jammer_cloud` — +2 ARM to target allied unit until end of turn
- `surge_matrix` — global +1 ATK to friendly units (surge: also +1 ARM) until end of turn
- `overgrowth_wave` — global +1 ATK and +1 ARM to friendly units until end of turn
- `war_protocol` — global +2 ATK and +1 ARM to friendly combat units until end of turn
- `iron_formation` — global +1 ATK and +2 ARM to friendly units until end of turn

**HOOKS layer — existing mechanics:**
- Bastion: +1 ARM when adjacent to another allied unit (via `unitStatHooks` registry)

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

**Per-layer processor tests** (each processor is a pure function, tested in isolation):
- `applyAbilityLayer`: keyword_grant adds keywords; non-keyword payloads are ignored
- `applyStaticLayer`: stat_modifier adds, stat_set overrides
- `applyTemporaryLayer`: same logic as static, but effects at TEMPORARY layer
- `applyCounterLayer`: same logic, COUNTER layer
- `applyHooksLayer`: hooks see pipeline-resolved keywords (e.g., bastion hook returns +1 armor when keyword is present in resolved set)
- `applyCopyLayer` / `applyControlLayer` / `applySwapLayer`: stubs pass through unchanged (future-proofing tests)

**Full pipeline integration tests** (`computeEffectiveEntityStats`):
- Base stats with no effects return unit's raw values
- Single stat_modifier applies correctly
- stat_set at STATIC overrides base; stat_modifier at TEMPORARY adds on top
- keyword_grant at ABILITY is visible to stat hooks at HOOKS layer
- replacement_effect payloads are skipped (not treated as stat/keyword effects)
- adjacent_allies targeting respects position
- moveRange and attackRange are clamped to >= 0
- Effects at same layer sort by timestamp
- Cross-layer dependency: keyword granted at ABILITY feeds into hook at HOOKS that checks for that keyword

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

1. **Per-layer pure functions composed into a pipeline** — each layer is an independent processor that takes intermediate state and returns new intermediate state; layers are composed via `LAYER_PIPELINE` array. Adding future layer types (copy, control, swap) means writing a new processor and inserting it, not modifying existing ones
2. **Stub layers for future expansion** — COPY, CONTROL, and SWAP processors exist as pass-throughs now, establishing the pipeline structure so future work is additive
3. **Cache per-stat maps, not parallel entity objects** — avoids confusion about which entity is canonical
4. **Module-level ref (not GameState field)** — keeps GameState clean, avoids serialization issues for multiplayer
5. **On-demand fallback preserved** — AI minimax clones state without a runtime; the fallback ensures correctness
6. **Unit stat hooks are the final layer (HOOKS=7)** — passing `{ ...unit, keywords: resolvedKeywords }` so bastion etc. see pipeline-computed keywords without recursion
7. **`excludeEffectIdPrefix` queries bypass cache** — these are hypothetical "what-if" queries used during card resolution that can't be answered from the cache
8. **Full recalculation, no dirty tracking** — at most ~30 entities x ~30 effects = trivial cost; simpler and more deterministic

## Verification

1. `npm test` — all existing tests pass
2. `npm run typecheck` — no type errors
3. Manual: run `npm run dev`, play a match, verify combat damage and keyword effects behave identically
4. Manual: play a network match to verify determinism (server and client derive same stats)
