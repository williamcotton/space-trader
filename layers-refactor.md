# Layers Refactor: Pure Pipeline + State-Scoped Continuous Effect Resolution

## Context

The current continuous effects code resolves effective stats and keywords on-demand. That keeps gameplay correct in every simulation context, but it repeats the same work across combat, validators, AI, mechanics, and rendering.

The right refactor is not "render rebuilds a global cache, and gameplay reads from it." That would make simulation correctness depend on whether `runtime.step()` has run, which conflicts with the current architecture:

- authoritative mutable `GameState` lives in the runtime / simulation layer
- commands and instructions must observe correct gameplay state immediately
- rendering is not allowed to decide gameplay outcomes

So the goal is:

- introduce a pure layer pipeline for continuous-effect resolution
- reuse that pipeline for both UI-derived snapshots and simulation queries
- keep caches scoped to a specific `GameState` read pass, never process-global
- preserve correctness for reducers, auto-flow, AI search, tests, and multiplayer

## Non-Goals

- No module-level `currentDerivedState` ref
- No gameplay reads that depend on render timing
- No cache keyed only by `entityId`
- No CONTROL / COPY / SWAP semantics in this refactor
- No requirement that every existing consumer change at once

## Layer Model

Keep the existing authored layer ids unchanged for live content compatibility:

```typescript
export const LAYER = {
  BASE: 0,
  TYPE: 1,
  ABILITY: 2,
  STATIC: 3,
  TEMPORARY: 4,
  COUNTER: 5,
} as const;
```

Internally, resolve units through this ordered pipeline:

1. `BASE`
2. `TYPE`
3. `ABILITY`
4. `STATIC`
5. `TEMPORARY`
6. `COUNTER`
7. `HOOKS` (internal-only post-pass for registered unit stat hooks)

Notes:

- `HOOKS` is not a content-authored layer constant; it is an internal final stage.
- `BASE` and `TYPE` remain effectively pass-through for now unless existing content uses them.
- Future MTG-style `COPY`, `CONTROL`, or `SWAP` work needs a separate design because those mechanics can change which later effects apply. This plan does not pretend that current applicability rules are enough for that.

## Plan

### Step 1: Create a pure resolution module

**New file: `src/game/systems/effectPipeline.ts`**

Introduce a pure pipeline that can resolve either one unit or the full board from any `GameState`.

Suggested types:

```typescript
export type UnitStatName =
  | "attackDamage"
  | "armor"
  | "siegeDamageBonus"
  | "moveRange"
  | "attackRange"
  | "hp"
  | "maxHp";

export type EffectiveUnitStats = Record<UnitStatName, number>;

export type ResolvedUnitSnapshot = {
  stats: EffectiveUnitStats;
  keywords: string[];
};

export type ContinuousEffectSnapshot = {
  stats: Map<EntityId, EffectiveUnitStats>;
  keywords: Map<EntityId, string[]>;
};
```

Core entry points:

```typescript
export function buildResolvedUnitSnapshot(
  state: Readonly<GameState>,
  unit: Readonly<UnitEntity>,
  options?: {
    excludeEffectIdPrefix?: string;
  }
): ResolvedUnitSnapshot;

export function buildContinuousEffectSnapshot(
  state: Readonly<GameState>
): ContinuousEffectSnapshot;
```

Processing rules:

1. Start from the unit's printed/base stats and base keywords.
2. Collect applicable effects using the existing `doesEffectApplyToEntity()` rules.
3. Filter out `replacement_effect` payloads.
4. Group by authored layer and sort by `timestamp`.
5. Apply `ABILITY`, `STATIC`, `TEMPORARY`, and `COUNTER` in order.
6. Run registered unit stat hooks last using the pipeline-resolved keywords.
7. Clamp `moveRange` and `attackRange` to `>= 0`.

Important constraint:

- Applicability is still evaluated against the current base `GameState`. That is correct for the live rules set.
- Do not add fake `CONTROL` / `COPY` support here yet.

### Step 2: Make the pipeline the canonical logic in `continuousEffects.ts`

**File: `src/game/systems/continuousEffects.ts`**

Refactor the public helpers to delegate to the pipeline instead of carrying a second independent implementation.

Changes:

- Export `doesEffectApplyToEntity`
- Keep `getEffectiveKeywordsForUnit()` public API unchanged
- Keep `getEffectiveStatValue()` public API unchanged
- Implement both via `buildResolvedUnitSnapshot()`

Add targeted helpers for snapshot reads:

```typescript
export function getEffectiveStatValueFromSnapshot(
  snapshot: ContinuousEffectSnapshot,
  unit: Readonly<UnitEntity>,
  stat: UnitStatName
): number;

export function getEffectiveKeywordsForUnitFromSnapshot(
  snapshot: ContinuousEffectSnapshot,
  unit: Readonly<UnitEntity>
): string[];
```

This gives one source of truth for effect semantics before any caching work is layered on top.

### Step 3: Extend `DerivedState`, but keep it UI-scoped

**File: `src/game/derived.ts`**

Add:

- `effectiveStats: Map<EntityId, EffectiveUnitStats>`
- `effectiveKeywords: Map<EntityId, string[]>`

Update `rebuildDerivedState()` to call `buildContinuousEffectSnapshot(state)`.

Important boundary:

- `DerivedState` remains a render/UI convenience snapshot.
- Gameplay code must not read it through a global singleton.
- No `derivedStateRef.ts`.

This stays aligned with the architecture note that `src/game/derived.ts` is cached derived state keyed off runtime version, while gameplay authority remains in `GameState`.

### Step 4: Add an explicit state-scoped resolver for hot simulation paths

**New code in `src/game/systems/effectPipeline.ts` or `src/game/systems/continuousEffects.ts`**

Add a resolver object with memoization scoped to a single state/read phase:

```typescript
export type EffectResolver = {
  getStats(unit: Readonly<UnitEntity>): EffectiveUnitStats;
  getKeywords(
    unit: Readonly<UnitEntity>,
    options?: { excludeEffectIdPrefix?: string }
  ): string[];
};

export function createEffectResolver(
  state: Readonly<GameState>
): EffectResolver;
```

Rules:

- Memoize by `entityId` inside the resolver instance only
- Never store the resolver globally
- When `excludeEffectIdPrefix` is present, bypass memoization for that query
- Callers create a fresh resolver when they need repeated reads against the current state

This gives the performance win without cross-state contamination.

### Step 5: Adopt the resolver in the actual hot paths

The original plan's "zero consumer changes" goal should be dropped. To get meaningful wins safely, thread the resolver explicitly where repeated reads happen inside a single call graph.

Priority consumers:

- `src/game/turn/autoFlow.ts`
- `src/game/rules/validators.ts`
- `src/game/systems/combat.ts`
- `src/game/ai/minimax/evaluate.ts`
- `src/game/ai/minimax/generate.ts`
- `src/game/content/sets/foundation/ai/spellScoring.ts`
- `src/game/content/sets/alpha/ai/spellScoring.ts`
- `src/game/render/overlays.ts` if needed

Implementation options:

- Either pass `resolver` through local helper functions
- Or add an optional `resolver` parameter to `unitStats.ts` / `keywords.ts` wrappers

Recommended approach:

- keep existing wrapper signatures valid
- add optional `resolver` support through an options bag
- migrate only the hot loops in this refactor

### Step 6: Preserve immediate simulation correctness

Explicitly verify the cases that the original plan would have broken:

- applying a `moveRange` effect and clamping `movesRemaining` in the same instruction flow
- resetting turn action budgets during phase advance
- auto-flow deciding immediately after a command resolves
- main-thread bot fallback evaluating the current state before the next render frame

This is the key architectural rule for the refactor:

- simulation reads must always be correct immediately after state mutation
- render-time derived snapshots are an optimization for UI, not gameplay authority

### Step 7: Tests

**New file: `src/game/systems/effectPipeline.test.ts`**

Add pipeline unit tests:

- base stats with no effects
- `keyword_grant` application
- `stat_modifier` and `stat_set`
- timestamp ordering within a layer
- layer ordering across `ABILITY`, `STATIC`, `TEMPORARY`, `COUNTER`
- `adjacent_allies` targeting
- `moveRange` / `attackRange` clamping
- hooks seeing resolved keywords
- replacement effects excluded from the stat/keyword pipeline

Add parity tests:

- `buildResolvedUnitSnapshot()` matches `getEffectiveStatValue()` and `getEffectiveKeywordsForUnit()`
- `buildContinuousEffectSnapshot()` matches per-unit getter results for every unit in a state

Add isolation tests:

- two runtimes in one process do not share cached results
- minimax `structuredClone()` states do not accidentally reuse another state's cache
- runtime reset / HMR rebuild produces fresh derived snapshots

Keep and extend existing reducer/runtime tests for immediate correctness without requiring `runtime.step()`.

### Step 8: Verification

Required verification:

1. `npm test`
2. `npm run typecheck`
3. Manual local game: verify combat damage, buffs, and keyword mechanics behave identically
4. Manual network game: verify command outcomes remain deterministic between client and server
5. Manual bot game with worker enabled and disabled: confirm both paths agree

## Files Changed

| File | Change |
|------|--------|
| `src/game/systems/effectPipeline.ts` | **NEW** pure layer pipeline and state-scoped resolver |
| `src/game/systems/effectPipeline.test.ts` | **NEW** pipeline, parity, and isolation tests |
| `src/game/systems/continuousEffects.ts` | Make pipeline canonical; export `doesEffectApplyToEntity`; add snapshot helpers |
| `src/game/derived.ts` | Store precomputed effective stats/keywords for UI/frame consumers |
| `src/game/systems/unitStats.ts` | Optional resolver-aware wrappers, if needed for hot loops |
| `src/game/systems/keywords.ts` | Optional resolver-aware wrappers, if needed for hot loops |
| Hot consumers listed above | Explicit resolver plumbing where repeated reads justify it |

## Files Not Added

- No `src/game/systems/derivedStateRef.ts`
- No module-global gameplay cache

## Key Design Decisions

1. **Pure pipeline first**: effect semantics move into one testable place before optimization is spread through the codebase.
2. **State-scoped caching only**: caches live inside a snapshot or resolver tied to one state/read phase.
3. **Render and gameplay stay separate**: `DerivedState` can store precomputed effect data, but gameplay code cannot depend on render rebuild timing.
4. **Explicit optimization beats hidden magic**: hot loops opt into a resolver instead of silently consulting a global singleton.
5. **Future layers are deferred, not faked**: CONTROL / COPY / SWAP need a richer applicability model and should be designed separately.
6. **Existing behavior remains authoritative**: reducers, AI, multiplayer, and tests must continue to work before the next animation frame runs.
