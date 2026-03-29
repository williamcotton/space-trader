# Plan: Fully Pluggable Content Architecture

## Purpose

This document is the updated refactor plan for getting the game from its current partially data-driven architecture to a truly pluggable content system.

The desired end state is:
- core engine internals stay stable
- mechanics register themselves instead of being hardcoded into engine switches
- factions, resources, cards, starter decks, themes, and animations come from loaded content sets
- AI, validation, UI playability, and animation do not branch on specific mechanic or effect names in core files
- the Base Set is just the first loaded set
- future expansions can add cards, mechanics, factions, resources, themes, and deck recipes without editing engine files

This is a larger goal than the current engine can support today, so this plan includes both:
- the idealized target architecture
- a staged migration plan from the exact current codebase to that target

## What The Current Code Already Does Well

The current codebase is not a bad starting point. It already has strong foundations:

- card data is centralized in `catalog.ts`
- many tactics already use generic effect families via `instructionFactories.ts`
- stack effects are already close to a registry model in `stackEffects.ts`
- card play metadata is much cleaner than before
- keywords already exist as a real gameplay layer
- triggers are already card-owned rather than purely global hardcoding

So this is not a rewrite from zero. The right move is to continue the existing data-driven direction, but carry it all the way through the rest of the engine.

## Tradeoff: Type Exhaustiveness vs Runtime Extensibility

The current architecture still gets real value from TypeScript discriminated unions and switch exhaustiveness.

Moving to registries changes that tradeoff:

- we lose some compile-time closure over the full set of mechanics and effect families
- we gain the ability to extend the game at runtime by loading new mechanic, faction, and set modules

That trade is acceptable for the long-term goals of this project, but it needs mitigation.

The mitigation is:
- keep the engine kernel strongly typed
- give each mechanic typed registration contracts
- give each mechanic typed accessor helpers for its own state namespace
- preserve stable public facades where possible so the rest of the app is not flooded with raw untyped registry lookups

## Where The Current Architecture Is Still Closed

These are the main places where content-specific behavior still leaks into core files:

### Rule Dispatch

- trigger condition evaluation in `src/game/systems/triggerEngine.ts`
- auto-target strategy selection in `src/game/systems/triggerEngine.ts`
- instruction dispatch in `src/game/actions/instructionHandlers.ts`
- play effect config resolution in `src/game/content/stackEffects.ts`
- stack-effect magnitude calculation in `src/game/content/stackEffects.ts`
- combat keyword rewards in `src/game/actions/handlers/combat.ts`

### Keyword Semantics

Keyword behavior is still spread across core helpers in `src/game/systems/keywords.ts`, `src/game/systems/cascade.ts`, `src/game/rules/validators.ts`, `src/game/turn/autoFlow.ts`, `src/game/actions/handlers/cards.ts`, and `src/game/actions/instructionHandlers.ts`.

This means adding a new evergreen mechanic still tends to touch multiple engine files.

### Consumer Logic

Even if rule resolution were registry-driven, the rest of the engine is still not:

- AI still scores effect families by name in `src/game/ai/mvpBot.ts`
- animations still branch on effect/config types in `src/game/render/animations.ts`
- animations still map faction accent colors through a hardcoded faction switch in `src/game/render/animations.ts`
- validation still contains effect-specific and keyword-specific assumptions in `src/game/rules/validators.ts`
- playability and target discovery are still consumed unevenly by validators, bot logic, auto-flow, and runtime
- presentation still uses hardcoded faction/resource theme tables in `src/game/presentation.ts`

This is the most important critique of the earlier draft. The architecture is not truly extensible unless these consumer paths are also moved behind registries or set-provided metadata.

### Factions And Resources

Factions and resources are still compile-time unions in `src/game/model/enums.ts`, and faction wiring still assumes a fixed world:

- starter decks are keyed by `Record<Faction, ...>` in `src/game/content/decks/starterDecks.ts`
- faction primary-resource mapping is hardcoded in `src/game/model/state.ts`
- faction presentation themes are hardcoded in `src/game/presentation.ts`

So while the current system can add more cards easily, it cannot honestly claim “new faction with no engine changes.”

### Mechanic State

Mechanic runtime state still lives in dedicated fields on `GameState`:

- `tacticsCastThisTurn`
- `bloomedUnitIdsThisTurn`
- `lastBloomSourceItemId`
- `lastBloomedUnitIds`
- `salvageTriggersThisTurn`

Those are reset in `phaseMachine.ts` and backfilled in `migrations.ts`.

So a new mechanic that needs its own per-turn or per-resolution bookkeeping still forces core state, reset, and migration edits.

## Target End State

The target architecture should be thought of as four layers:

1. Core engine kernel
2. Registries and dispatch services
3. Sets and content modules
4. Thin facades consumed by runtime, AI, UI, and rendering

## Core Engine Kernel

These remain generic and closed for routine content work:

- command and event pipeline
- turn and phase advancement
- priority and stack sequencing
- continuous effect layering
- replacement effect processing
- combat math
- hex math and map geometry
- rendering primitives and canvas loop
- runtime shell and persistence shell

Core does not know what “Bloom” or “Relay” is. It only knows how to:
- evaluate commands
- dispatch events
- execute instructions
- process registered hooks
- render animations built by registered builders

## Registry Families

The earlier version of this plan only focused on rules dispatch. That is not enough.

We need three registry families:

### 1. Content Registries

These answer “what content exists?”

- card registry
- stack effect registry
- faction registry
- resource registry
- starter deck / deck recipe registry
- map registry
- set registry

### 2. Rules Registries

These answer “how does this mechanic behave?”

- trigger condition evaluators
- auto-target strategies
- instruction handlers
- keyword rule hooks
- play effect config resolvers
- combat hooks
- validation hooks
- play-target enumerators
- phase reset hooks
- state initializer / migrator hooks

### 3. Consumer Registries

These answer “how do AI, UI, and rendering understand this content?”

- tactic/effect scoring resolvers for AI
- deploy and synergy scoring hooks for AI
- animation builders for stack push / resolve / death / victory / transients
- presentation themes for factions and resources
- keyword glossary / tooltip metadata
- card visualization hints

The big idea is:
- a mechanic does not just register how it resolves
- it also registers how it is validated, previewed, animated, and scored

That is what makes the system truly extensible rather than merely “less switch-heavy.”

## Set Model

The system should revolve around sets.

```typescript
type CardSet = {
  id: string;
  name: string;
  dependencies?: string[];
  mechanics?: MechanicModule[];
  factions?: FactionModule[];
  resources?: ResourceModule[];
  cards?: Record<string, CardDefinition>;
  deckRecipes?: DeckRecipeModule[];
  maps?: MapModule[];
  presentation?: PresentationModule[];
};
```

### Design Intent

- the Base Set is the first set
- expansions are loaded after the Base Set
- later sets can add new cards to existing factions
- later sets can add entirely new factions and mechanics
- later sets can contribute starter deck recipes, theme variants, and animation overrides

## Base Set And Expansion Model

The Base Set is not special because it lives in core. It is special because it is always loaded.

### Base Set Responsibilities

The Base Set should define:

- canonical starting resources and initial factions
- the current card pool
- the default starter deck recipes
- the default faction themes
- the default maps
- the first wave of mechanics:
  - `sprout`
  - `stealth`
  - `relay`
  - `surge`
  - `bloom`
  - `salvage`
  - `bastion`
  - `uncounterable`

### Expansion Responsibilities

An expansion may:

- add cards for existing factions
- add new factions
- add new resources
- add new mechanics
- add maps
- add or replace deck recipes for game modes that use that expansion
- contribute additional presentation themes or animation profiles

### Load Order And Collision Rules

The loader needs explicit rules:

- set IDs are unique
- card IDs are unique
- mechanic IDs are unique
- faction IDs are unique
- resource IDs are unique
- later sets may extend an existing faction only through an explicit faction-extension contract, not by silently overwriting it
- deck recipes should compose through named recipes or modes, not global overwrites

The goal is extension, not accidental mutation.

## Mechanic Module Contract

Each mechanic module should be able to self-register everything it needs.

```typescript
type MechanicModule = {
  id: string;
  name: string;
  description: string;
  register(engine: GameEngine): void;
};
```

In practice a mechanic module may register:

- keyword semantics
- trigger conditions
- instruction handlers
- effect-family resolvers
- validation hooks
- AI scoring hooks
- animation builders
- state initialization defaults
- phase reset behavior
- migration/backfill behavior for older saves

That is the key change from the older draft.

The old version was too focused on “mechanics register rules.”
The new version is: mechanics register all the places the engine needs to understand them.

Important note:
- trigger conditions are not just string labels
- some conditions carry additional structured properties
  - `on_death.whose`
  - `at_start_of_phase.phase`
- registry evaluators therefore need the full condition object, not just a condition type string

## Faction Module Contract

Factions should also be moved out of static enums/tables and into registry-backed modules.

```typescript
type FactionModule = {
  id: string;
  label: string;
  primaryResourceId: string;
  mechanics: string[];
  themes: {
    primary: ThemeDefinition;
    mirrorAlt?: ThemeDefinition;
  };
  cards: Record<string, CardDefinition>;
  starterRecipe?: DeckRecipe;
};
```

This is what removes hardcoded faction knowledge from:

- `state.ts`
- `starterDecks.ts`
- `presentation.ts`

## Resource Module Contract

If the long-term goal really includes new factions and new resource systems, then resources also need to be registry-driven.

```typescript
type ResourceModule = {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  glow: string;
};
```

This is the step that eventually lets a future faction introduce a new primary resource without editing `enums.ts` and `state.ts`.

It is also the point where `Faction` and `ResourceType` stop being fixed compile-time unions and become registry-backed string IDs with typed facades layered on top.

## State Model Changes

This is the biggest architectural gap in the current code.

The earlier draft claimed mechanics could reuse “existing extensible fields.” That is not true enough to support future mechanics cleanly.

The end state should introduce namespaced mechanic state.

### Desired Direction

Instead of hardcoding one field per mechanic on `GameState`, the engine should expose namespaced mechanic storage:

```typescript
type GameState = {
  ...
  mechanicState: {
    match: Record<string, unknown>;
    turn: Record<string, unknown>;
    resolution: Record<string, unknown>;
  };
};
```

And optionally:

```typescript
type UnitEntity = {
  ...
  mechanicState?: Record<string, unknown>;
};

type StackItem = {
  ...
  metadata?: Record<string, unknown>;
};
```

### What This Solves

- `surge` no longer needs a dedicated `tacticsCastThisTurn` field
- `bloom` no longer needs dedicated bloom arrays on `GameState`
- `salvage` no longer needs a dedicated per-turn counter field
- future mechanics can add per-turn or per-resolution bookkeeping without editing core state types every time

### Important Constraint

Mechanic state still needs typed helpers.

The goal is not to dump raw JSON everywhere and lose safety.
The goal is:
- core state remains generic
- each mechanic owns typed accessor helpers for its own namespace

## Authoritative Rules Services

To make the engine truly extensible, there must be one authoritative playability and targeting service.

This is especially important because the current code still has multiple consumers that “guess” legality in different ways.

The target architecture should include shared services for:

- legal card target enumeration
- keyword-based targeting blocks
- keyword-based attack blocks
- stack-response legality
- action blocking reasons

These services should be used by:

- validators
- bot logic
- auto-flow
- runtime targeting prompts
- UI playability indicators

If that remains fragmented, the engine will still require consumer-specific edits whenever a new target mode or keyword rule appears.

## AI Extensibility

The earlier draft did not go far enough here.

Today, the bot still branches heavily on effect and mechanic names.
That means new effect families still require edits to `mvpBot.ts`.

The target architecture should include:

- effect-family spell scoring registry
- tactic targeting scoring registry
- deploy-value heuristics registry
- trigger/payoff heuristic registry
- keyword and mechanic valuation hooks

Core bot flow can stay generic:
- enumerate legal options
- ask registries to score them
- choose highest score

But content-specific reasoning should be registered by the effect family or mechanic module.

## Animation Extensibility

The same problem exists in rendering.

Today, the renderer still branches on effect family names and card-owned animation kinds.

The target architecture should include:

- stack push animation builders
- stack resolve animation builders
- transient event animation builders
- card-owned animation profiles
- effect-family fallback animation builders

The renderer should stay generic:
- ask card profile first
- ask effect-family builder second
- ask event-level transient builder third

This keeps faux-3D presentation extensible without stuffing `animations.ts` full of mechanic-specific branches forever.

## Presentation Extensibility

Faction colors, alt mirror themes, and resource colors should not stay hardcoded in `presentation.ts`.

Presentation should come from:

- faction modules
- resource modules
- optional set-provided theme overrides

`presentation.ts` should become a facade over a registry, not the place where faction identity is declared.

## What Should Stay Generic In Content

Not everything needs to become one module per mechanic.

Some things are already in a good place and should stay generic:

- `instructionFactories.ts` should remain a generic library of reusable effect builders
- `catalog.ts` should remain a thin content facade or aggregator
- card builder helpers should stay generic rather than being split too aggressively by faction/mechanic

The goal is not maximum file splitting.
The goal is maximum extensibility with minimum repeated plumbing.

## Recommended Directory Direction

This should be the eventual shape, not necessarily the first migration step:

```text
src/game/
  engine/
    types.ts
    registries.ts
    init.ts
    rules/
      triggerDispatch.ts
      instructionDispatch.ts
      keywordDispatch.ts
      validationDispatch.ts
      targetingDispatch.ts
      combatHooks.ts
      phaseHooks.ts
    consumers/
      aiDispatch.ts
      animationDispatch.ts
      presentationDispatch.ts
      stateDispatch.ts
  content/
    sets/
      base/
        index.ts
        mechanics/
        factions/
        resources/
        maps/
        decks/
      expansion_x/
        index.ts
        mechanics/
        factions/
        resources/
        maps/
        decks/
    cards/
      catalog.ts
      instructionFactories.ts
      cardBuilders.ts
```

## What Stays In Core

These should remain kernel responsibilities:

- command and event pipeline
- turn and phase loop
- stack sequencing and priority
- continuous effect system
- replacement effect system
- combat formula
- hex geometry and map math
- render primitives
- registry infrastructure and dispatch shells

What moves out of core is not “all code.”
What moves out is content-specific interpretation and configuration.

## Migration Plan From The Current Codebase

This is the important part.
The refactor should not happen as a single big-bang move.

### Phase 0: Freeze The Public Facades

Goal:
- preserve existing entry points while internals change

Work:
- keep `getCardDefinition`, `getStackEffectDefinition`, `getStarterDeckCardIds`, theme lookup helpers, and keyword helper APIs stable where possible
- document which files are temporary facades and which will become registry-backed later

Reason:
- this lets the refactor proceed behind stable interfaces

### Phase 1: Add Registries Behind The Existing Dispatch Points

Goal:
- replace core switches with registries without moving all content first

Work:
- add trigger-condition registry
- add auto-target registry
- add instruction-handler registry
- add play-effect resolver registry
- add combat-hook registry

Do not do yet:
- do not split all content into set directories
- do not replace faction/resource enums yet

Success criteria:
- existing tests pass
- current mechanics behave identically
- current files still export the same public helpers

### Phase 2: Unify Playability, Validation, And Target Enumeration

Goal:
- make legality authoritative in one place

Work:
- create shared legal-target enumeration services
- route validators, bot, auto-flow, runtime prompts, and UI playability through the same services
- move keyword target/attack blocking behind registry-aware legality helpers

Success criteria:
- adding a new target mode or keyword restriction should not require separate edits in validator, bot, and runtime flows

### Phase 3: Externalize Consumer Logic

Goal:
- remove content-specific branches from AI, animation, and presentation

Work:
- add AI scoring registries for effect families and mechanic payoffs
- add animation builder registries for stack push / resolve / transient effects
- add presentation registries for factions, resources, and theme variants
- move card/effect-specific animation routing out of hardcoded core branches where possible

Success criteria:
- a new effect family can register scoring and animation support without editing `mvpBot.ts` or `animations.ts`

### Phase 4: Introduce Generic Mechanic State

Goal:
- stop adding one field per mechanic to `GameState`

Work:
- add namespaced mechanic-state storage
- add phase reset hooks and state-initializer hooks to mechanics
- move `surge`, `bloom`, and `salvage` bookkeeping into mechanic-owned namespaces
- add migration helpers that backfill mechanic namespaces from older saves

Important note:
- this is the point where the architecture becomes realistically extensible for future mechanics
- this should happen earlier than a late cleanup step because it removes one of the biggest remaining architecture bottlenecks
- however, it still depends on the initial facade-preserving registry work landing first, so it should follow dispatch and consumer extraction rather than replace them as the very first move

Success criteria:
- a new mechanic with per-turn counters or per-resolution metadata no longer requires editing core `GameState`, `phaseMachine.ts`, and `migrations.ts`

### Phase 5: Extract The Base Set

Goal:
- move current content out of “core-owned” files and into a real Base Set

Work:
- create `content/sets/base`
- move mechanic registrations into `base/mechanics`
- move faction cards and deck recipes into `base/factions`
- move faction themes into faction modules
- keep `catalog.ts`, `starterDecks.ts`, and `presentation.ts` as facades over loaded Base Set data

Important constraint:
- do not over-split generic helpers just for aesthetics
- generic effect builders should stay generic

Success criteria:
- Base Set loads the entire current playable game
- no gameplay changes

### Phase 6: Make Factions And Resources Registry-Backed

Goal:
- remove the final hardcoded worldview from enums and static theme tables

Work:
- move faction definitions to faction registry entries
- move resource definitions to resource registry entries
- convert starter decks and primary-resource mapping to registry lookups
- convert presentation theme lookup to registry lookup
- introduce typed string IDs or branded IDs in place of fixed unions where necessary

This is the first phase that truly enables “add a new faction without editing engine files.”

Success criteria:
- adding a faction module and starter recipe is enough to put a new faction in the game
- adding a new resource module is enough to theme and track that resource

### Phase 7: Expansion Set Loading

Goal:
- support multiple loaded sets rather than only a hardcoded Base Set

Work:
- add set manifest loading
- add dependency ordering
- add collision checks
- support faction extensions and additive deck recipes
- decide whether sets are code-registered in a manifest or discovered dynamically later

Recommended near-term stance:
- use a code manifest first
- dynamic discovery can come later if needed

Success criteria:
- Base Set and one expansion can load together cleanly
- an expansion can add cards to an existing faction and also add a new faction in the same package

### Phase 8: Remove Legacy Shims

Goal:
- finish the migration and stop carrying duplicate paths

Work:
- delete the old hardcoded tables and switches
- collapse compatibility wrappers
- update docs to describe the registry/set model as the real architecture

Success criteria:
- the core engine no longer directly knows specific mechanics, faction IDs, or effect-family names

## Practical Rules For The Refactor

- Do not change balance while doing the architecture pass unless required for correctness.
- Prefer compatibility facades over big-bang rewrites.
- Move one dispatch family at a time.
- Keep tests passing after each phase.
- Keep the Base Set playable at all times.
- Treat “new faction with no core edits” as a late-phase deliverable, not an early claim.

## Definition Of Done

The architecture should only be considered “done” when all of these are true:

- adding a card with existing mechanics only requires content edits
- adding a new mechanic only requires a mechanic module plus content using it
- adding a new faction only requires faction/resource/theme/deck modules and set registration
- AI and animation support for a new mechanic can be registered by that mechanic or effect family, not patched into core files
- state and migrations do not require new dedicated core fields for each mechanic
- Base Set and at least one expansion can load together without engine edits

At that point, the engine is genuinely open for content extension rather than merely “less hardcoded than before.”
