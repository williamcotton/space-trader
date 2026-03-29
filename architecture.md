# Space Trader Architecture

Last updated: March 29, 2026

## Purpose

This document describes the live architecture of the current prototype, not an earlier MVP plan.

It is implementation-first:
- where authoritative game state lives
- how commands resolve
- how content is modeled
- what extension points are already clean
- what future work still implies architectural changes

## Live Scope

- Electron + React + TypeScript desktop game
- one playable map: Frontier Belt
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
  - player 1: `2 credits + 2 primary`
  - player 2: `5 credits + 2 primary`
- deposits:
  - `2` credits
  - `2` primary
- passive economy income:
  - `+1 credit`
  - `+0 primary`
- max hand size: `7`

## Core Principles

- Single source of truth:
  - one authoritative mutable `GameState` inside the runtime
- Deterministic simulation:
  - same command stream => same state outcomes
- Event-driven rules:
  - commands validate
  - events mutate
  - triggers react
  - rendering never decides game rules
- Data-driven content:
  - cards, starter decks, maps, keywords, and stack behaviors are content/config driven
- HMR-safe development:
  - runtime survives module reloads
  - migrations backfill hot state when schema changes

## Runtime Topology

- React UI layer
  - panels, hand, top bar, stack, debug controls
  - subscribes to runtime snapshots
  - dispatches typed commands only
- Runtime layer: `src/game/runtime.ts`
  - owns the canonical `GameState`
  - owns bot toggles, pending targeting, priority-stop settings, and animation queue
  - bridges simulation and render systems
- Simulation layer
  - validators
  - reducers
  - instruction handlers
  - trigger engine
  - stack / phase / auto-flow logic
- Presentation layer
  - canvas rendering
  - frame animation stepping
  - no authority over gameplay outcomes

## Actual Module Layout

```text
src/game/
  runtime.ts                 # singleton runtime, subscriptions, debug/dev helpers
  systems.ts                 # updateGame/renderGame bridge
  types.ts                   # frame + animation types
  derived.ts                 # cached spatial/overlay derived state
  presentation.ts            # player/resource/faction themes

  model/
    state.ts                 # canonical GameState, entity shapes, initial state
    enums.ts                 # phases, factions, resources, roles
    ids.ts                   # typed IDs / player constants
    hex.ts                   # axial hex math
    queries.ts               # state query helpers
    selectors.ts             # UI selectors
    migrations.ts            # hot-state migrations

  content/
    cards/catalog.ts         # card definitions, play configs, keywords, animation metadata
    cards/instructionFactories.ts
    decks/starterDecks.ts
    maps/frontierBelt.ts
    stackEffects.ts          # generic stack behaviors + effect definitions

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
    cardPlayOptions.ts

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
    triggers.ts

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
- combo / turn bookkeeping
  - `tacticsCastThisTurn`
  - `bloomedUnitIdsThisTurn`
  - `lastBloomSourceItemId`
  - `lastBloomedUnitIds`
  - `salvageTriggersThisTurn`
  - `tacticalHarvestEligibleUnitIds`
  - `tacticalHarvestedUnitIds`

Current state version:
- `21`

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

This is the core deterministic loop.

## Turn And Priority Model

Turn structure is explicit and state-machine driven:
- `start`
  - turn draw and start-of-turn setup
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
  - `surgeActive`

## Data-Driven Card Architecture

Card definitions live in `src/game/content/cards/catalog.ts`.

Cards are not resolved by card-id-specific reducers.
They are described by:
- cost
- speed
- text
- keywords
- `play` metadata
- optional `effectConfig`
- optional `surgeEffectConfig`
- optional triggers
- optional resolve animation metadata

### Resolution Model

The preferred model is:
- card owns its play metadata
- stack effect owns generic behavior
- generic instruction factory produces instructions

This means new cards usually require:
- a catalog entry
- maybe a new generic effect family
- maybe AI scoring if the effect family is new

### Current Generic Effect Families

The engine already supports generic effect families for:
- mass damage
- global buffs
- destroy-damaged resets
- draw and gain resources
- unit-count resource conversion
- bloom-count resource conversion
- salvage-count resource conversion
- hex-area damage
- cascade unit buffs

## Keywords, Effects, And Triggers

Keywords are now a real engine surface, not just labels.

Current live keywords include:
- `stealth`
- `sprout`
- `relay`
- `bloom`
- `salvage`
- `bastion`
- `uncounterable`

Supporting systems:
- `systems/keywords.ts`
  - rules hooks and shared keyword helpers
- `systems/continuousEffects.ts`
  - layered stat and keyword grants
- `systems/triggerEngine.ts`
  - event-driven unit triggers
- `systems/cascade.ts`
  - BFS cascade propagation
- `systems/replacementEngine.ts`
  - instruction replacement / prevention hooks

Current trigger surface includes:
- `on_owner_tactic_played`
- `on_owner_surged_tactic_played`
- `on_owner_salvaged`
- `on_cascaded`
- `on_self_bloomed`
- `on_owner_unit_bloomed`

## Combat And Economy Architecture

### Combat

`systems/combat.ts` is the authoritative combat resolver.

Current combat properties:
- effective attack and armor are layered through `unitStats.ts`
- siege is also an effective stat now
- supply penalty applies by distance from friendly base
- minimum successful combat damage is `1`
- spell damage is separate from combat damage

### Economy

Economy is intentionally split:
- `nodeControl.ts`
  - who controls nodes
- `harvesting.ts`
  - cargo lifecycle and economy-phase deposits

Cargo lifecycle:
- empty
- loaded with resource
- deposited
- or lost on destruction

## Rendering And Animation

Rendering is canvas-based and read-only over state + animation queues.

Important characteristics:
- RAF drives animation only
- gameplay remains event-driven
- animations are built from state/event snapshots
- cards can own resolve animation metadata in the catalog

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

Current migration model:
- explicit `CURRENT_STATE_VERSION`
- backfill missing fields
- update entity defaults and keyword sets
- keep hot-loaded matches playable when schema changes

## Testing Strategy

The project already relies heavily on deterministic tests.

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
- render animation generation

## Current Architecture Strengths

- deterministic rules core is solid
- card content is much more data-driven than before
- named combo mechanics can be added without rewriting the rules engine
- HMR workflow is still strong despite schema churn
- render effects are attached to content much more cleanly

## Current Architecture Pressure Points

These are the main areas where future features will want more structural work:

### Graveyard / Reanimation

Light recursion is possible, but real graveyard gameplay would want:
- discard-pile targeting UI
- zone-move instructions beyond simple draw/discard patterns
- AI support for recursion choices
- clearer graveyard presentation

### Tokens

A real token strategy likely needs:
- token templates
- or a dedicated deploy-from-template instruction model

### Multi-Target Choice Cards

Current targeting is excellent for:
- none
- entity
- stack item
- hex

But “choose two targets” or “choose up to N” needs a deliberate extension.

### Infinite Combo Support

The engine currently supports bounded combo systems well.

True infinite combos would need:
- loop detection
- deterministic repeat rules
- explicit player choice flow
- AI handling for arbitrarily large lines

## Recommended Next Architecture Work

- keep extending cards through generic effect families first
- avoid card-specific resolver branches
- treat graveyard/reanimation as its own feature wave
- treat tokens as their own feature wave
- decide intentionally whether spell damage should ever respect armor
