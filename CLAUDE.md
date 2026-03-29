# Space Trader Development Notes

## Stack

- Electron
- React + TypeScript
- Vite
- Canvas 2D + `requestAnimationFrame`

## Project Layout

### Electron Shell

- `electron/main.ts`
- `electron/preload.ts`

### React Entrypoints

- `src/main.tsx`
- `src/App.tsx`
- `src/App.css`
- `src/GameCanvas.tsx`

### Core Runtime

- `src/game/runtime.ts`
  - persistent runtime singleton
  - authoritative mutable game state
  - bot toggles
  - pending targeting flow
  - debug helpers
  - animation queue
- `src/game/systems.ts`
  - `updateGame`
  - `renderGame`
- `src/game/types.ts`
  - frame, viewport, and animation types
- `src/game/derived.ts`
  - cached derived state keyed off runtime version
- `src/game/presentation.ts`
  - theme and faction color/presentation helpers

### Model Layer

- `src/game/model/state.ts`
  - canonical `GameState`
  - entity shapes
  - zones
  - initial-state creation
- `src/game/model/enums.ts`
  - phases, factions, resources, unit roles
- `src/game/model/ids.ts`
  - typed IDs and player constants
- `src/game/model/hex.ts`
  - axial hex math
- `src/game/model/queries.ts`
  - state query helpers
- `src/game/model/selectors.ts`
  - UI selectors
- `src/game/model/migrations.ts`
  - state migration / hot-state repair

### Content

- `src/game/content/cards/catalog.ts`
  - card definitions
  - play profiles
  - card-owned effect configs
  - keywords
  - triggers
  - animation metadata
- `src/game/content/cards/instructionFactories.ts`
  - generic instruction builders for effect families
- `src/game/content/stackEffects.ts`
  - generic stack behaviors and static effect definitions
- `src/game/content/decks/starterDecks.ts`
  - 60-card starter lists + validation
- `src/game/content/maps/frontierBelt.ts`
  - current map content

### Actions Pipeline

- `src/game/actions/commands.ts`
- `src/game/actions/events.ts`
- `src/game/actions/reducers.ts`
- `src/game/actions/instructions.ts`
- `src/game/actions/instructionHandlers.ts`
- `src/game/actions/handlers/cards.ts`
- `src/game/actions/handlers/combat.ts`
- `src/game/actions/handlers/phase.ts`
- `src/game/actions/handlers/selection.ts`

### Rules

- `src/game/rules/validators.ts`
  - command legality
- `src/game/rules/cardPlayOptions.ts`
  - shared legal-target enumeration

### Turn Management

- `src/game/turn/phaseMachine.ts`
- `src/game/turn/stack.ts`
- `src/game/turn/autoFlow.ts`
- `src/game/turn/priorityStops.ts`

### Systems

- `src/game/systems/combat.ts`
- `src/game/systems/nodeControl.ts`
- `src/game/systems/harvesting.ts`
- `src/game/systems/victory.ts`
- `src/game/systems/keywords.ts`
- `src/game/systems/continuousEffects.ts`
- `src/game/systems/unitStats.ts`
- `src/game/systems/cascade.ts`
- `src/game/systems/replacementEngine.ts`
- `src/game/systems/triggerEngine.ts`
- `src/game/systems/triggers.ts`

### AI

- `src/game/ai/mvpBot.ts`

### Render

- `src/game/render/layout.ts`
- `src/game/render/primitives.ts`
- `src/game/render/grid.ts`
- `src/game/render/entities.ts`
- `src/game/render/overlays.ts`
- `src/game/render/animations.ts`
- `src/game/render/animationDrawing.ts`

### UI

- `src/ui/GameHudPanels.tsx`
- `src/ui/GameTopBar.tsx`
- `src/ui/HandTray.tsx`
- `src/ui/CommandStackPanel.tsx`
- `src/ui/ResourceIcon.tsx`
- `src/ui/useGameSnapshot.ts`

### Docs

- `game-design.md`
- `architecture.md`
- `faction-identity.md`
- `new-cards.md`

## Commands

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run typecheck`
- `npm test`
- `npm run test:watch`

## Current Architecture Decisions

- Canonical gameplay state lives in `src/game/runtime.ts`, not React state.
- Gameplay mutations flow through:
  - commands
  - events
  - instructions
  - triggers
- The live phase loop is:
  - `start`
  - `economy`
  - `main`
  - `tactical`
  - `end`
  - `discard`
- Current live economy defaults:
  - player 1 starts with `2 credits + 2 primary`
  - player 2 starts with `5 credits + 2 primary`
  - deposits are `2`
  - passive economy is `+1 credit`
- Continuous effects are layered and authoritative for stat/keyword changes.
- Keywords are a real engine surface, not just labels.
  - current live keywords include:
    - `stealth`
    - `sprout`
    - `relay`
    - `bloom`
    - `salvage`
    - `bastion`
    - `uncounterable`
- Card resolution is now primarily data-driven through:
  - card play metadata in `catalog.ts`
  - generic behaviors in `stackEffects.ts`
  - reusable factories in `instructionFactories.ts`
- `StackResolutionRules` is no longer the main mental model for new work.
  - new effects should prefer generic stack behaviors + card-owned configs
- The trigger engine is live and supports real faction mechanics.
  - important current trigger conditions:
    - `on_owner_tactic_played`
    - `on_owner_surged_tactic_played`
    - `on_owner_salvaged`
    - `on_cascaded`
    - `on_self_bloomed`
    - `on_owner_unit_bloomed`
- Cascade uses deterministic BFS propagation.
- Card-owned resolve animations are supported and should be preferred over hardcoded card-id animation branches.
- Runtime state is migrated in place through `migrations.ts`.
  - current state version is `21`

## Current Faction Mechanics Snapshot

- Alloy:
  - `bastion`
  - `salvage`
  - formation / siege / damaged-matters shell
- Flux:
  - `relay`
  - `surge`
  - stack / spellchain / spatial combo shell
- Biomass:
  - `sprout`
  - `bloom`
  - swarm / growth / board-to-resource shell

## `getGameRuntime` Contract

- `getGameRuntime()` returns the same runtime instance for the life of the renderer session.
- React should subscribe to runtime snapshots, not copy gameplay state into component state.
- `GameCanvas` owns the RAF loop and calls runtime step/render plumbing.
- New gameplay state belongs in `state.ts` plus `migrations.ts`, not in React components.

## HMR Workflow

- Runtime instance persists through HMR.
- Simulation/render logic can be hot-swapped without wiping the match.
- State schema changes should always be accompanied by migration updates.
- Bot logic is hot-swappable separately from the rest of the runtime.

## Performance Notes

- Render-path spatial queries should prefer `DerivedState`.
- O(E) helpers in `model/queries.ts` are acceptable for command-frequency logic.
- Avoid putting authoritative gameplay work in the render loop.

## Current Extension Points

- more generic effect families in `instructionFactories.ts` / `stackEffects.ts`
- additional keywords that hook into `systems/keywords.ts` and `triggerEngine.ts`
- richer bot scoring in `mvpBot.ts`
- more card-owned animations in `catalog.ts`

## Architectural Pressure Points

These are likely to require real engine work, not just more card data:

- graveyard / reanimation / recursion UX and rules
- true token support
- multi-target choice cards
- explicit support for deterministic infinite combos
- any major change to spell-damage-vs-armor rules
