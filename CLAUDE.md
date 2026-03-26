# Space Trader Development Notes

## Stack
- Electron (desktop shell)
- React + TypeScript (renderer UI)
- Vite (build/dev server)
- Canvas 2D + `requestAnimationFrame` (game loop)

## Project Layout

### Electron Shell
- `electron/main.ts`: Electron process boot, BrowserWindow lifecycle, secure webPreferences.
- `electron/preload.ts`: Narrow bridge for safe renderer access.

### React Entrypoints
- `src/main.tsx`: React entrypoint.
- `src/App.tsx`: App root container.
- `src/App.css`: Full-window layout and canvas styling.
- `src/GameCanvas.tsx`: Canvas mount + RAF loop driver. Uses `getGameRuntime()` and does not own gameplay state.

### Core Game Loop
- `src/game/runtime.ts`: Persistent runtime singleton returned by `getGameRuntime()`. Holds mutable game state, derived state cache, and hot-swappable systems.
- `src/game/systems.ts`: `updateGame` and `renderGame` systems. Primary gameplay logic surface for HMR iteration.
- `src/game/types.ts`: Shared frame type definitions (`GameFrame`, `CanvasAnimation`, `FrameTransients`).
- `src/game/derived.ts`: Lazy-rebuilt `DerivedState` layer (spatial index, pre-computed move range overlay). Keyed on `stateVersion` for cache invalidation.
- `src/game/presentation.ts`: Centralized color/theme constants for players, resources, unit roles, and factions.

### Model Layer (`src/game/model/`)
- `state.ts`: Canonical `GameState` definition, entity types, zone types, `createInitialGameState`.
- `enums.ts`: Game enums (`GamePhase`, `Faction`, `ResourceType`, `UnitRole`).
- `ids.ts`: `PlayerId`, `EntityId`, `NodeId` type aliases and constants.
- `hex.ts`: Hex math — axial/cube/pixel conversions, distance, bounds, `hexKey`.
- `queries.ts`: O(E) entity lookup helpers (`hasEntityAtCoord`, `getEntityAtCoord`, `findEntityAtHex`, `getPlayerUnits`, `getEnemyEntities`). Used by validators/bot/autoFlow at command-dispatch frequency, not per-frame.
- `selectors.ts`: UI-focused selector functions for card display info, playability checks, stack previews.
- `migrations.ts`: Schema migration logic for hot-reloaded game state.

### Content (`src/game/content/`)
- `cards/catalog.ts`: Card definitions (data-driven IDs, costs, speed, keywords, and payloads).
- `decks/starterDecks.ts`: Premade 60-card starter deck lists + validation.
- `maps/frontierBelt.ts`: MVP map data and resource nodes.
- `stackEffects.ts`: Stack effect definitions and factories (damage, deploy, counter, cascade buffs).

### Actions Pipeline (`src/game/actions/`)
- `commands.ts`: Command type definitions.
- `events.ts`: Event type definitions.
- `reducers.ts`: Command dispatch — validates, applies instructions, emits events.
- `instructions.ts`: Instruction type definitions and context.
- `instructionHandlers.ts`: Low-level instruction execution (damage, destruction, effects).
- `handlers/cards.ts`: Card play command execution (deployment, drawing, zone management).
- `handlers/combat.ts`: Attack command execution and unit destruction.
- `handlers/phase.ts`: Phase advancement logic.
- `handlers/selection.ts`: Entity selection/deselection handling.

### Game Systems (`src/game/systems/`)
- `combat.ts`: Locked combat resolver formula and modifier hooks.
- `nodeControl.ts`: End-phase node occupancy capture logic.
- `harvesting.ts`: Harvest cargo validation helpers + economy-phase deposit resolution.
- `victory.ts`: Base HP win-resolution helper.
- `keywords.ts`: Keyword definitions and behavior (stealth, sprout, summoning sickness bypass).
- `continuousEffects.ts`: MTG-inspired layered effect system with stat modifiers, expiry conditions, and target filters.
- `unitStats.ts`: Computes effective unit stats through continuous effect layers.
- `cascade.ts`: Cascade spell wave propagation logic using BFS for adjacent hex targeting.
- `replacementEngine.ts`: Replacement effect system for preventing/redirecting damage and substituting instructions.
- `triggerEngine.ts`: Event trigger system for card-triggered abilities with auto-targeting strategies.
- `triggers.ts`: Trigger definitions with auto-target resolution.

### Turn Management (`src/game/turn/`)
- `phaseMachine.ts`: Phase state machine and turn/phase transitions.
- `autoFlow.ts`: Automatic phase advancement and action availability checks.
- `stack.ts`: Priority/stack resolution with stack item creation and removal.

### Rules (`src/game/rules/`)
- `validators.ts`: Command legality checks (movement, attacks, harvesting, card plays).
- `cardPlayOptions.ts`: Valid target enumeration and legality checking for card plays.

### AI (`src/game/ai/`)
- `mvpBot.ts`: Deterministic MVP bot command policy.

### Render Pipeline (`src/game/render/`)
- `layout.ts`: Canvas layout, scaling, and hex metric calculations.
- `primitives.ts`: Low-level canvas drawing primitives (hex outlines, diamonds, polygons, rounded rects, resource glyphs).
- `grid.ts`: Hex grid, player territory auras, move range overlay, resource node rendering.
- `entities.ts`: Entity rendering (units with health/armor bars, bases).
- `overlays.ts`: Hover hex highlight, attack target preview line, stack anchor badge, map frame.
- `animations.ts`: Animation lifecycle management (creation from events, timing, stepping).
- `animationDrawing.ts`: Canvas animation rendering (move/attack trajectories, deploy/harvest effects, spell resolve, cascade hex showers).

### UI Components (`src/ui/`)
- `GameHudPanels.tsx`: Main HUD layout container and panel management.
- `GameTopBar.tsx`: Top status bar with phase, turn, and player indicators.
- `HandTray.tsx`: Bottom-center hand tray overlay and click-to-play card controls.
- `CommandStackPanel.tsx`: Debug panel displaying stack items with pass/counter controls.
- `ResourceIcon.tsx`: Reusable resource display component.
- `useGameSnapshot.ts`: Custom React hook using `useSyncExternalStore` for efficient game state subscription with version caching.

### Config & Docs
- `vite.config.ts`: Vite + React + Electron plugin setup.
- `game-design.md`: Living gameplay design document for ongoing brainstorming and decisions.
- `architecture.md`: System architecture blueprint.
- `todos.md`: Detailed phased build plan and immediate tasks.

## Commands
- `npm run dev`: Start Vite and Electron in development mode.
- `npm run build`: Type-check and produce production bundles.
- `npm run preview`: Preview renderer production build.
- `npm run typecheck`: Type-check TypeScript projects.
- `npm test`: Run deterministic rules tests with Vitest.
- `npm run test:watch`: Run tests in watch mode.

## Current Architecture Decisions
- Game state lives in `src/game/runtime.ts` (singleton), not React state, so gameplay state survives Fast Refresh.
- The loop is frame-rate independent using delta time.
- `update()` and `render()` are separate to keep game logic composable.
- Gameplay mutations flow through typed commands -> events -> reducers.
- `GameState` is canonical and includes phase/turn/priority/stack data for deterministic simulation.
- `DerivedState` sits outside canonical state, rebuilt lazily when `stateVersion` changes. Provides spatial index (`Map<string, EntityId[]>`) for O(1) coord lookups and pre-computed move range overlay cells for the render loop. New derived computations add fields to `DerivedState` and builder functions in `derived.ts`.
- Priority/stack shell is active with debug commands (`P` pass, `R` no-op, `T` damage, `C` counter).
- Bot controls are available with `B` (toggle `player_2`) and `Shift+B` (toggle `player_1`), plus debug panel toggles.
- Stack responses support explicit target metadata (currently used by `counter_top_item`).
- Stack effects are data-driven content IDs (`string`) validated at command time; resolver behavior stays typed via `StackResolutionRules`.
- Canvas interaction supports click-to-select and hovered-hex target preview overlays.
- Hover combat preview now uses the same combat resolver as authoritative attack events.
- Selection clear transitions also go through command/event (`CLEAR_SELECTION`) for deterministic logging.
- A small React debug overlay exposes stack controls (pass/no-op/ping/counter) in addition to keyboard shortcuts.
- Phase 4 economy loop is active:
  - end-phase node capture by occupancy
  - tactical-phase harvest command for resource units
  - economy-phase base-adjacent deposit only
  - loaded harvester cargo is lost on destruction
- Phase 5 card loop is active:
  - per-player zones (`deck`, `hand`, `discard`, `exile`) in canonical state
  - premade faction starter decks with 60-card/max-4 validation
  - opening hand 5 + start-phase draw 1 on turn handoff
  - opening resources: P1 gets 2 credits + 2 faction resource, P2 gets 5 credits + 2 faction resource
  - `PLAY_CARD` command supports stack tactics and base-adjacent unit deployment
  - one-shot tactics move to discard on resolve/counter destination
  - hand/deck counters are derived from zones and re-synced after command processing
  - hand tray follows active player by default and displays `Hand X | Deck Y`
- Phase 6 loop is active:
  - unit attacks resolve through `systems/combat.ts` (locked formula)
  - base-destruction winner resolution runs through `systems/victory.ts`
  - deterministic bot policy drives optional autopilot for `player_2`
  - runtime bot policy is hot-swappable during HMR (`accept("./ai/mvpBot", ...)`)
- Continuous effects use an MTG-inspired layered system with stat modifiers, expiry conditions, and target filters (`systems/continuousEffects.ts`).
- Replacement engine intercepts and modifies game instructions before execution (prevent damage, exile instead of destroy, etc.).
- Trigger engine fires automatic abilities in response to game events with auto-targeting strategies.
- Cascade spells propagate in waves using BFS across adjacent hexes.
- `src/game/runtime.ts` accepts HMR updates from `src/game/systems.ts` via `import.meta.hot.accept` and swaps logic in place.
- `src/game/runtime.ts` persists runtime instance through `import.meta.hot.dispose(data.runtime = runtime)`.
- Runtime applies lightweight schema migration on hot-restored state (currently state version 16).
- Electron runs with `contextIsolation: true` and `nodeIntegration: false`.

## `getGameRuntime` Contract
- `getGameRuntime()` must return the same runtime instance for the life of the renderer session.
- `GameCanvas` should start one RAF loop and call `runtime.step(context, deltaSeconds)` each frame.
- UI/React props may update runtime through explicit runtime methods (for example `setMessage`, `setViewport`).
- React UI subscribes to state changes via `useGameSnapshot` hook (backed by `useSyncExternalStore` + `stateVersion`).
- Avoid storing canonical gameplay state in React component state/hooks.
- New gameplay code should prefer:
  - Types in `src/game/types.ts`
  - State fields + mutation methods in `src/game/runtime.ts`
  - Frame logic in `src/game/systems.ts`
  - Derived/cached data in `src/game/derived.ts`

## HMR Workflow
- Edit `src/game/systems.ts` for gameplay behavior changes. HMR will swap system functions without resetting runtime state.
- Edit `src/game/types.ts` and `src/game/runtime.ts` when introducing new persistent state.
- `DerivedState` auto-rebuilds after HMR via `rehydrateHotState()` reset + `stateVersion` dirty check.
- Keep HMR handlers in runtime when refactoring:
  - `accept("./systems", ...)` for system replacement
  - `accept("./ai/mvpBot", ...)` for bot policy replacement
  - `dispose(...)` for state retention

## Performance Notes
- Render-path entity lookups use `DerivedState.spatialIndex` for O(1) coord queries instead of O(E) scans. The spatial index and move range overlay are rebuilt once per state change, not per frame.
- `model/queries.ts` O(E) functions are still used by validators, bot AI, and autoFlow — these run at command-dispatch frequency, not 60 FPS, so the cost is acceptable.

## Next Extension Points
- Expand stack target rules beyond top-of-stack-only counters.
- Add concrete non-zero terrain/tile/faction combat modifiers.
- Replace keyboard-only phase advance with explicit UI actions.
- Add persistence (save/load) via preload-exposed APIs and IPC once gameplay loop stabilizes.
- Extend `DerivedState` with additional cached computations (attack range preview, fog of war, pathfinding) as needed.
