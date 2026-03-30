# Space Trader Architecture

Last updated: March 29, 2026

## Purpose

This document describes the live architecture of the current prototype.

It is implementation-first:
- where authoritative game state lives
- how rules resolve
- how content is loaded
- what is kernel-owned vs set-owned
- which extension seams are now registry-driven
- where the architecture is still intentionally incomplete

## Live Scope

- Electron + React + TypeScript desktop game
- one live shipped content set: Base Set
- one live runtime profile: Base Default
- one live map in that profile: Frontier Belt
- 1v1 turn-based hex tactics
- 3 premade faction starter decks, 60 cards each, max 4 copies
- full stack / priority interaction for spells and abilities
- harvesting / node-control economy loop
- 6-phase turn flow:
  - `start`
  - `economy`
  - `main`
  - `tactical`
  - `end`
  - `discard`
- win by reducing enemy base HP to `0`

Current live rules snapshot:
- base HP: `20`
- opening hand: `5`
- opening resources:
  - player 1: `2 currency + 2 primary`
  - player 2: `5 currency + 2 primary`
- deposits:
  - `2` currency
  - `2` primary
- passive economy income:
  - `+1` currency
  - `+0` primary
- max hand size: `7`

## Core Principles

- Single source of truth:
  - one authoritative mutable `GameState` inside the runtime
- Deterministic simulation:
  - same command stream => same state outcomes
- Event-driven rules:
  - commands validate
  - reducers emit events
  - instructions mutate state
  - triggers react
  - rendering never decides gameplay
- Set-driven content:
  - cards, stack effects, factions, resources, decks, maps, runtime profiles, and mechanics are loaded from set manifests
- Registry-based runtime behaviors:
  - AI scoring
  - auto-targeting
  - direct interaction
  - stack previews
  - stack resolve animations
  - combat hooks
  - mechanic instructions
  - play effects
  - trigger evaluators
- HMR-safe development:
  - runtime survives module reloads
  - migrations backfill hot state when schema changes
  - loaded content can be reset and reloaded explicitly

## Runtime Topology

- React UI layer
  - panels, hand, top bar, stack, debug controls
  - subscribes to runtime snapshots
  - dispatches typed commands only
- Runtime layer: `src/game/runtime.ts`
  - owns the canonical `GameState`
  - owns bot toggles, pending targeting, priority-stop settings, and animation queue
  - carries the active runtime-profile context
  - bridges simulation and render systems
- Simulation layer
  - validators
  - reducers
  - instruction handlers
  - trigger engine
  - stack / phase / auto-flow logic
- Content layer
  - set manifests
  - registry population
  - runtime installers
  - set-owned mechanics
- Presentation layer
  - canvas rendering
  - frame animation stepping
  - no authority over gameplay outcomes

## Actual Module Layout

```text
src/game/
  runtime.ts
  systems.ts
  types.ts
  derived.ts
  presentation.ts

  model/
    state.ts
    enums.ts
    ids.ts
    hex.ts
    queries.ts
    selectors.ts
    migrations.ts

  content/
    loader.ts
    registry.ts
    sets/catalog.ts
    maps/catalog.ts
    decks/starterDecks.ts
    cards/
      catalog.ts
      helpers.ts
      types.ts
    stackEffects.ts
    stackEffects/
      helpers.ts
      types.ts
    mechanics/
      stateAccess.ts
      types.ts
    sets/
      types.ts
      base/
        index.ts
        cards.ts
        stackEffects.ts
        playEffects.ts
        decks.ts
        factions.ts
        resources.ts
        runtimeProfiles.ts
        presentation.ts
        installers/runtime.ts
        maps/frontierBelt.ts
        mechanics/
          index.ts
          keywordIds.ts
          stealth.ts
          sprout.ts
          relay.ts
          surge.ts
          bloom.ts
          salvage.ts
          bastion.ts
          uncounterable.ts

  mechanics/
    index.ts

  registries/
    aiMechanics.ts
    autoTargets.ts
    boardBlastEffects.ts
    cardCounterability.ts
    cardResolveAnimations.ts
    cardPlayModifiers.ts
    cascadeBranches.ts
    combatHooks.ts
    debugStackResponses.ts
    directInteraction.ts
    instructionHandlers.ts
    mechanicAnimations.ts
    mechanicApis.ts
    mechanicInstructions.ts
    mechanicState.ts
    playEffects.ts
    presentation.ts
    spellScoring.ts
    stackEffectMagnitudes.ts
    stackPreviews.ts
    stackResolveAnimations.ts
    triggerConditions.ts
    unitDeployment.ts
    unitStatHooks.ts

  actions/
    commands.ts
    events.ts
    reducers.ts
    instructions.ts
    instructionHandlers.ts
    handlers/
      cards.ts
      combat.ts
      phase.ts
      selection.ts

  rules/
    validators.ts
    cardPlayLegality.ts
    cardPlayOptions.ts
    directInteraction.ts

  turn/
    phaseMachine.ts
    stack.ts
    autoFlow.ts
    priorityStops.ts

  systems/
    combat.ts
    nodeControl.ts
    harvesting.ts
    victory.ts
    keywords.ts
    continuousEffects.ts
    unitStats.ts
    cascade.ts
    replacementEngine.ts
    triggerEngine.ts

  ai/
    mvpBot.ts

  render/
    layout.ts
    primitives.ts
    grid.ts
    entities.ts
    overlays.ts
    animations.ts
    animationDrawing.ts
```

## Canonical State Model

The canonical game state lives in `src/game/model/state.ts`.

Important live fields:
- match / turn state
  - `stateVersion`
  - `matchId`
  - `turn`
  - `phase`
  - `activePlayerId`
  - `priorityPlayerId`
  - `consecutivePriorityPasses`
- UI-integrated authoritative state
  - `hoveredHex`
  - `selectedEntityId`
  - `lastRejectedReason`
- economy / rules
  - `rules`
  - per-player resource pools
- board / zones
  - `map`
  - `players`
  - `zones`
  - `entities`
- stack / effects
  - `stack`
  - `continuousEffects`
  - `effectTimestampCounter`
- logs / win state
  - `log`
  - `winner`
- mechanic-owned bookkeeping
  - `mechanicState.match`
  - `mechanicState.turn`
  - `mechanicState.resolution`
- tactical-harvest bookkeeping
  - `tacticalHarvestEligibleUnitIds`
  - `tacticalHarvestedUnitIds`

Current state version:
- `24`

Mechanic-specific counters no longer belong on the base `GameState` surface.
They now belong in namespaced mechanic state owned by the mechanics themselves.

## Content Loading And Registry Lifecycle

The live game no longer relies on Base Set import-time side effects.

Content loading flow:
1. `content/sets/catalog.ts` exposes built-in set manifests.
2. `content/loader.ts` selects a content bundle through `loadConfiguredContentSets(...)`.
3. Dependency order is resolved.
4. Registries are reset if requested.
5. Each set registers:
   - resources
   - factions
   - cards
   - stack effects
   - deck recipes
   - maps
   - runtime profiles
   - mechanics
   - runtime installers

Important consequences:
- Base Set is now loaded through the same pathway future expansions should use.
- runtime can now be created or reset from explicit content bundles rather than only “whatever is globally loaded”
- The kernel no longer owns:
  - default map id
  - default faction ids
  - currency resource id
  - resource display order
  - resource glyph rendering data
- Runtime profiles now define:
  - default map id
  - optional default factions
  - match id prefix
  - default profile selection

## Command -> Event -> Instruction -> State Flow

The live rule pipeline is:

1. UI or bot emits a typed command.
2. `validators.ts` checks legality.
3. `reducers.ts` converts legal commands into events.
4. Events mutate state through reducer paths.
5. Stack resolution turns card/effect metadata into instructions.
6. `instructionHandlers.ts` applies instructions to state.
7. `triggerEngine.ts` reacts to resulting events and can push more stack items.
8. Auto-flow / phase / priority logic advances as needed.

This is still the core deterministic loop.

## Turn And Priority Model

Turn structure is explicit and state-machine driven:
- `start`
  - draw and start-of-turn setup
- `economy`
  - passive income and deposit resolution
- `main`
  - main-speed card play and deployment
- `tactical`
  - movement, attacks, harvest actions
- `end`
  - node control and cleanup transition
- `discard`
  - active player discards to `MAX_HAND_SIZE`

Priority model:
- stack uses explicit `priorityPlayerId`
- top stack item resolves only after consecutive passes
- stack items carry:
  - controller / owner
  - targets
  - source card metadata
  - `counterable`
  - `defaultCounterDestination`
  - active modifier ids

## Data-Driven Card And Stack Architecture

Card definitions no longer live as the kernel source of truth.
The live kernel consumes registry-backed content facades:

- `content/cards/catalog.ts`
  - registry-backed card access and helpers
- `content/stackEffects.ts`
  - registry-backed stack effect access
- `content/decks/starterDecks.ts`
  - registry-backed starter deck access
- `content/maps/catalog.ts`
  - registry-backed map access

Cards are described by:
- cost
- speed
- text
- keywords
- `play` metadata
- optional generic `effectConfig`
- optional modifier effect configs
- optional triggers
- optional animation metadata

Stack effects are described by:
- targeting rules
- object rules
- generic behavior shape
- instruction builder

The preferred model is:
- card owns play metadata
- stack effect owns generic behavior
- generic play-effect / stack-effect registries own runtime dispatch

## Runtime Registries

The kernel now delegates most extension behavior through registries.

Important registry categories:
- legality / interaction
  - `directInteraction`
  - `cardCounterability`
  - `autoTargets`
- play / resolution
  - `playEffects`
  - `instructionHandlers`
  - `cardPlayModifiers`
  - `stackEffectMagnitudes`
- combat / stats / deployment
  - `combatHooks`
  - `unitDeployment`
  - `unitStatHooks`
  - `cascadeBranches`
- mechanics
  - `mechanicState`
  - `mechanicInstructions`
  - `mechanicAnimations`
  - `mechanicApis`
- consumers
  - `spellScoring`
  - `stackResolveAnimations`
  - `stackPreviews`
  - `boardBlastEffects`
  - `debugStackResponses`
  - `presentation`
- triggers
  - `triggerConditions`

Base Set currently installs many of these via `content/sets/base/installers/runtime.ts`.

## Keywords, Mechanics, And Triggers

Keywords are a real engine surface, but keyword ids and behavior are now set-owned.

Current live Base Set keywords:
- `stealth`
- `sprout`
- `relay`
- `surge`
- `bloom`
- `salvage`
- `bastion`
- `uncounterable`

The kernel-owned generic pieces are now:
- keyword queries and continuous-effect layering
- trigger engine dispatch
- namespaced mechanic state lifecycle

The set-owned pieces are:
- keyword ids
- mechanic APIs
- trigger evaluators
- direct-interaction hooks
- unit deployment hooks
- stat hooks
- mechanic-specific instruction behavior
- mechanic-specific animation behavior

Current trigger surface in the live Base Set includes:
- `on_owner_tactic_played`
- `on_owner_surged_tactic_played`
- `on_owner_salvaged`
- `on_cascaded`
- `on_self_bloomed`
- `on_owner_unit_bloomed`
- generic phase / battlefield entry hooks

## Combat And Economy Architecture

### Combat

`systems/combat.ts` is still the authoritative combat resolver.

Current combat properties:
- effective attack and armor are layered through `unitStats.ts`
- siege is an effective stat
- supply penalty applies by distance from friendly base
- minimum successful combat damage is `1`
- spell damage is still separate from combat damage

### Economy

Economy is intentionally split:
- `nodeControl.ts`
  - who controls nodes
- `harvesting.ts`
  - cargo lifecycle
  - deposit resolution
  - passive income

Important recent change:
- the kernel no longer hardcodes `"credits"` as the currency resource
- registered resource modules define which resource is currency
- deposit amounts and passive income now key off registered resource semantics

## Rendering And Animation

Rendering is canvas-based and read-only over state + animation queues.

Important characteristics:
- RAF drives animation only
- gameplay remains event-driven
- animations are built from state/event snapshots
- cards can own resolve animation metadata
- resource glyphs are now loaded from registered resource modules
- faction accents and presentation come from registered presentation data

Current animation capabilities include:
- movement / attack
- deploy / harvest
- death bursts
- match intro / victory
- cascade faux-3D hex showers
- board-wipe / haymaker visuals

## HMR, Migration, And Persistence

The runtime is intentionally HMR-safe:
- runtime singleton persists across reloads
- systems and bot logic can hot-swap
- `migrations.ts` upgrades restored state in place
- runtime can be recreated from explicit set/runtime-profile selections without kernel edits

Current migration model:
- explicit `CURRENT_STATE_VERSION`
- backfill missing fields
- update entity defaults and keyword sets
- rehydrate old stack items
- keep hot-loaded matches playable when schema changes

## Testing Strategy

The project relies heavily on deterministic tests.

Important coverage areas:
- reducers
- validators
- combat
- harvesting
- stack / priority
- trigger engine
- replacement engine
- continuous effects
- bot behavior
- starter deck validation
- content loader lifecycle
- render animation generation

## Current Architecture Strengths

- deterministic rules core is solid
- card content is data-driven
- named mechanics are now largely set-owned
- Base Set is much closer to behaving like a real plugin
- resource semantics and runtime defaults are now content-owned instead of kernel-owned
- AI / animation / preview / debug behavior can be installed by sets instead of hardcoded in core
- HMR workflow is still strong despite schema churn

## Current Architecture Pressure Points

These are the main areas where future features still want more structural work:

### Graveyard / Reanimation

Light recursion is possible, but real graveyard gameplay would want:
- discard-pile targeting UI
- richer zone-move instructions
- AI support for recursion choices
- clearer graveyard presentation

### Tokens

A real token strategy likely needs:
- token templates
- or a dedicated deploy-from-template instruction model

### Multi-Target Choice Cards

Current targeting is strong for:
- none
- entity
- stack item
- hex

But “choose two targets” or “choose up to N” still needs a deliberate extension.

### Infinite Combo Support

The engine currently supports bounded combo systems well.

True infinite combos would need:
- loop detection
- deterministic repeat rules
- explicit player choice flow
- AI handling for arbitrarily large lines

### Full Content Context Isolation

The game is much more extensible now, but it still uses process-global registries.

That is good enough for:
- one active loaded content world
- Base Set plus future expansion bundles loaded into the same runtime

It is not yet the final form for:
- multiple simultaneous content contexts
- side-by-side loaded game variants in the same process
- fully isolated expansion sandboxes

## Recommended Next Architecture Work

- keep moving toward set-owned installers and runtime behavior
- avoid reintroducing card-id or faction-id branches in kernel code
- treat graveyard/reanimation as its own feature wave
- treat tokens as their own feature wave
- treat multi-target choice as its own feature wave
- keep future migration work focused on real schema evolution rather than compatibility aliases
