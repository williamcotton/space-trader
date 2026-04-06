# Layers Refactor: Cached Derived Continuous Effects

## Purpose

This document replaces the earlier over-abstracted proposal with a narrower refactor plan that matches the current engine.

The real goal is:

- reduce repeated continuous-effect work in the live runtime
- keep the current public stat/keyword APIs stable
- prepare for future layer growth without pretending we already need a full MTG-style layer engine

This is not a proposal to redesign ownership, copy effects, or swap effects yet.

## Current System

The live continuous-effect system is in [src/game/systems/continuousEffects.ts](/Users/administrator/Projects/space-trader/src/game/systems/continuousEffects.ts).

Today it works like this:

- `ContinuousEffect` has:
  - `payload`
  - `target`
  - `expiry`
  - `layer`
  - `timestamp`
- `doesEffectApplyToEntity(...)` checks whether an effect applies to one entity
- `getActiveEffectsForEntity(...)` filters all active effects for one entity
- `getEffectiveStatValue(...)`:
  - starts from the unit's base stat
  - filters applicable effects
  - filters again to matching stat modifiers/setters
  - sorts by `layer` then `timestamp`
  - reduces over the base stat
  - adds registered unit stat hook adjustments last
- `getEffectiveKeywordsForUnit(...)`:
  - starts from base keywords
  - unions in matching `keyword_grant` effects
  - supports the `excludeEffectIdPrefix` escape hatch used by some mechanics

Current layer constants are:

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

In practice, current gameplay content mainly uses:

- `ABILITY`
- `STATIC`
- `TEMPORARY`
- `COUNTER`

The current engine is therefore not a full layer pipeline. It is:

- per-query effect filtering
- per-query stat sorting and reduction
- separate keyword union logic
- separate unit stat hook application at the end

## Current Derived State

[src/game/derived.ts](/Users/administrator/Projects/space-trader/src/game/derived.ts) currently caches:

- `spatialIndex`
- `moveRangeOverlay`

It does not currently cache:

- effective stats
- effective keywords
- effect applicability buckets

That is the natural expansion point for this refactor.

## Problems Worth Solving

The current system has two real issues.

### 1. Repeated on-demand work

Many runtime consumers repeatedly ask for the same effective values:

- combat
- validators
- auto-flow
- render overlays
- AI scoring
- AI search
- mechanic checks such as Bastion, Predation, Emplaced, Salvage, Relay, Bloom

Each query re-filters and re-sorts continuous effects.

### 2. Hooks are only "implicitly last"

Today hooks are effectively applied after stat modifiers because [src/game/systems/unitStats.ts](/Users/administrator/Projects/space-trader/src/game/systems/unitStats.ts) adds hook adjustments after `getEffectiveStatValue(...)`.

That is workable, but it is not represented as a formal derived pass, and it makes future ordering harder to reason about.

## Problems Not Worth Solving Yet

This refactor should explicitly avoid trying to solve these bigger problems now:

- copy effects
- temporary control changes as derived ownership
- stat swaps
- a full MTG rules-engine layer framework
- a module-global derived state registry

Those are larger features and should not be used to justify extra abstraction in the first pass.

## Refactor Direction

The recommended refactor is:

1. compute effective stats and effective keywords once per derived-state rebuild
2. store those results in `DerivedState`
3. make existing stat/keyword accessors use the cache first
4. keep on-demand fallback behavior for code paths that do not have a runtime-derived cache

This keeps the current public engine surface stable while removing most repeated work from the live renderer/runtime.

## Design Principles

### Keep the current API stable

Consumers should continue using:

- `getEffectiveUnitAttackDamage(...)`
- `getEffectiveUnitArmor(...)`
- `getEffectiveUnitSiegeDamageBonus(...)`
- `getEffectiveUnitMoveRange(...)`
- `getEffectiveUnitAttackRange(...)`
- `unitHasActiveKeyword(...)`

The optimization should happen behind those APIs.

### Cache in `DerivedState`, not in `GameState`

`GameState` must stay serializable and deterministic for:

- save/hot-state migration
- multiplayer replay
- AI cloning

The cache belongs in [src/game/derived.ts](/Users/administrator/Projects/space-trader/src/game/derived.ts), not in authoritative match state.

### Do not add fake future layers yet

The engine should only encode layers that are doing real work now.

For this refactor, the meaningful pipeline is:

- keyword grants
- persistent stat modifiers/setters
- temporary stat modifiers/setters
- counter-based modifiers
- final hook adjustment pass

### Preserve on-demand fallback

Some code paths still need uncached behavior:

- AI search over cloned states outside the runtime
- targeted hypothetical keyword checks using `excludeEffectIdPrefix`
- isolated tests that do not rebuild runtime derived state

The new system must still be correct there.

## Proposed Data Shape

Extend `DerivedState` with cached effective values:

```typescript
export type EffectiveUnitStats = {
  attackDamage: number;
  armor: number;
  siegeDamageBonus: number;
  moveRange: number;
  attackRange: number;
  hp: number;
  maxHp: number;
};

export type DerivedState = {
  sourceVersion: number;
  spatialIndex: SpatialIndex;
  moveRangeOverlay: MoveRangeCell[];
  effectiveStats: Map<EntityId, EffectiveUnitStats>;
  effectiveKeywords: Map<EntityId, string[]>;
};
```

This is enough for the current game.

There is no need yet for:

- derived ownership
- derived card identity
- per-layer debug traces
- cached non-unit entity transforms

## Proposed Computation Model

Create one derived computation entry point:

```typescript
computeEffectiveEntityState(state: Readonly<GameState>): {
  effectiveStats: Map<EntityId, EffectiveUnitStats>;
  effectiveKeywords: Map<EntityId, string[]>;
}
```

For each unit:

1. collect applicable continuous effects
2. bucket or sort them by `layer` then `timestamp`
3. build effective keywords
4. build effective stats from base stats plus stat effects
5. apply registered unit stat hooks last
6. clamp `moveRange` and `attackRange` to `>= 0`
7. store final results in the output maps

That is enough for the current engine.

## Hook Behavior

Hooks must remain a final pass, but the first refactor should not pretend hooks are a perfect formal layer yet.

Important current reality:

- Bastion in [src/game/content/sets/alpha/mechanics/bastion.ts](/Users/administrator/Projects/space-trader/src/game/content/sets/alpha/mechanics/bastion.ts) calls `unitHasActiveKeyword(...)`
- Predation and Emplaced attack-permission checks also depend on keyword queries

So the first pass should:

- compute effective keywords first
- compute effective stats second
- apply hook-based stat adjustments last

If hook recursion becomes awkward, a later follow-up can change hook signatures to accept pre-resolved keyword/state inputs directly.

That should be treated as a separate cleanup, not part of the first cache pass.

## Phased Plan

### Phase 1: Add Cached Effective Stats And Keywords

Goal:

- cache effective unit stats and keywords inside `DerivedState`
- keep the rest of the engine API unchanged

Changes:

- extend [src/game/derived.ts](/Users/administrator/Projects/space-trader/src/game/derived.ts)
- add `EffectiveUnitStats`
- add `effectiveStats` and `effectiveKeywords` maps
- update `createEmptyDerivedState()`
- update `rebuildDerivedState()` to compute those maps

New helper:

- `computeEffectiveEntityState(...)`

This helper should live either:

- in [src/game/systems/continuousEffects.ts](/Users/administrator/Projects/space-trader/src/game/systems/continuousEffects.ts), if kept compact
- or in a new focused module such as `src/game/systems/effectiveEntityState.ts`

I would prefer a focused new module over a grandly named future-framework file like `effectPipeline.ts`.

### Phase 2: Make Accessors Cache-First

Goal:

- let existing stat/keyword helpers use the cache when available

Changes:

- update [src/game/systems/unitStats.ts](/Users/administrator/Projects/space-trader/src/game/systems/unitStats.ts)
- update [src/game/systems/keywords.ts](/Users/administrator/Projects/space-trader/src/game/systems/keywords.ts)

Behavior:

- if a derived cache is available, read from it
- otherwise fall back to current on-demand calculation
- if `excludeEffectIdPrefix` is provided, bypass cache and use the current on-demand path

### Phase 3: Export Effect Applicability Helper

Goal:

- avoid duplicating effect-target logic in both old and new resolution paths

Changes:

- export `doesEffectApplyToEntity(...)` from [src/game/systems/continuousEffects.ts](/Users/administrator/Projects/space-trader/src/game/systems/continuousEffects.ts)

No logic change should happen here.

### Phase 4: Runtime Integration

Goal:

- ensure the live runtime always rebuilds and uses the richer derived cache

Changes:

- [src/game/runtime.ts](/Users/administrator/Projects/space-trader/src/game/runtime.ts) already rebuilds derived state when `stateVersion` changes
- that rebuild should simply produce the richer derived object

Important design decision:

- do not add a module-global `derivedStateRef`

Reason:

- it couples unrelated runtimes
- it is brittle under HMR
- it is awkward for tests
- it is unnecessary when the runtime already owns `derivedState`

If a helper truly needs derived state outside the render frame, prefer an explicit optional parameter over a process-global singleton.

### Phase 5: Tests

Goal:

- prove the cached path matches current behavior

Add or update tests for:

- base stats with no effects
- stat modifiers
- stat setters
- layer ordering by `layer`, then `timestamp`
- keyword grants
- adjacent-allies aura targeting
- clamping negative `moveRange` / `attackRange`
- hooks still applying after regular stat effects
- `excludeEffectIdPrefix` still bypassing cache correctly
- derived rebuild populating the new maps

Also verify that existing tests in:

- [src/game/systems/continuousEffects.test.ts](/Users/administrator/Projects/space-trader/src/game/systems/continuousEffects.test.ts)
- [src/game/actions/reducers.test.ts](/Users/administrator/Projects/space-trader/src/game/actions/reducers.test.ts)
- combat, validators, and mechanic tests

continue to pass unchanged.

### Phase 6: Optional Hook Cleanup

This phase is optional and should only happen if Phase 1 exposes awkward recursion or repeated cache misses.

Possible follow-up:

- update unit stat hook APIs so hooks can consume already-resolved keyword information directly
- reduce internal calls from hooks back into generic keyword resolution

This is not required for the initial caching refactor.

## Files To Change

### Phase 1

- [src/game/derived.ts](/Users/administrator/Projects/space-trader/src/game/derived.ts)
- either:
  - [src/game/systems/continuousEffects.ts](/Users/administrator/Projects/space-trader/src/game/systems/continuousEffects.ts)
  - or a new small focused helper module for effective entity resolution

### Phase 2

- [src/game/systems/unitStats.ts](/Users/administrator/Projects/space-trader/src/game/systems/unitStats.ts)
- [src/game/systems/keywords.ts](/Users/administrator/Projects/space-trader/src/game/systems/keywords.ts)

### Phase 3

- [src/game/systems/continuousEffects.ts](/Users/administrator/Projects/space-trader/src/game/systems/continuousEffects.ts)

### Phase 4

- [src/game/runtime.ts](/Users/administrator/Projects/space-trader/src/game/runtime.ts)

### Phase 5

- new or updated tests in:
  - [src/game/systems/continuousEffects.test.ts](/Users/administrator/Projects/space-trader/src/game/systems/continuousEffects.test.ts)
  - [src/game/derived.test.ts](/Users/administrator/Projects/space-trader/src/game/derived.test.ts)
  - optionally a new focused effect-resolution test file

## Files Explicitly Not In Scope

This refactor should not change:

- multiplayer protocol
- `GameState` serialization shape
- ownership semantics
- `signal_hijack` control-changing behavior
- copy-effect support
- stat-swap support
- consumer call sites across combat, AI, validators, render, and mechanics

## Risks

### 1. Cache mismatch vs fallback path

If cached and uncached resolution differ, behavior becomes inconsistent between:

- runtime play
- tests
- AI search

Mitigation:

- keep the current on-demand logic as the reference path
- compare cached results against uncached tests

### 2. Hook recursion

Some hooks call generic keyword helpers today.

Mitigation:

- treat hook cleanup as a later follow-up
- do not overdesign Phase 1 around theoretical future layers

### 3. Overstating performance gains

This helps the live runtime most.

It does not automatically accelerate:

- minimax search
- server-side command validation

because those paths do not currently operate through the runtime's derived cache.

## Acceptance Criteria

The refactor is successful when:

- runtime behavior is unchanged
- public stat/keyword APIs remain unchanged
- live runtime uses cached effective stats/keywords from derived state
- fallback behavior still works outside the runtime cache
- all existing tests pass
- typecheck passes

## Recommended Implementation Order

1. extend `DerivedState`
2. implement cached effective stat/keyword rebuild
3. make `unitStats.ts` cache-first
4. make `keywords.ts` cache-first with `excludeEffectIdPrefix` bypass
5. export `doesEffectApplyToEntity(...)`
6. add tests
7. only then decide whether hook API cleanup is needed

## Summary

The right refactor is not "build a grand future layer framework."

The right refactor is:

- cache what the runtime already recomputes too often
- keep current APIs stable
- model only the layers the game actually uses now
- leave COPY / CONTROL / SWAP for the day those mechanics really exist
