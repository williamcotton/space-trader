# Space Trader Development Notes

## Stack
- Electron (desktop shell)
- React + TypeScript (renderer UI)
- Vite (build/dev server)
- Canvas 2D + `requestAnimationFrame` (game loop)

## Project Layout
- `electron/main.ts`: Electron process boot, BrowserWindow lifecycle, secure webPreferences.
- `electron/preload.ts`: Narrow bridge for safe renderer access.
- `src/main.tsx`: React entrypoint.
- `src/App.tsx`: App root container.
- `src/GameCanvas.tsx`: Canvas mount + RAF loop driver. Uses `getGameRuntime()` and does not own gameplay state.
- `src/game/runtime.ts`: Persistent runtime singleton returned by `getGameRuntime()`. Holds mutable game state and hot-swappable systems.
- `src/game/systems.ts`: `updateGame` and `renderGame` systems. Primary gameplay logic surface for HMR iteration.
- `src/game/systems/nodeControl.ts`: End-phase node occupancy capture logic.
- `src/game/systems/harvesting.ts`: Harvest cargo validation helpers + economy-phase deposit resolution.
- `src/game/model/*`: Canonical game enums, IDs, state, and hex helpers.
- `src/game/content/cards/catalog.ts`: Card definitions (data-driven IDs, costs, speed, and payloads).
- `src/game/content/decks/starterDecks.ts`: Premade 60-card starter deck lists + validation.
- `src/game/content/maps/frontierBelt.ts`: MVP map data and resource nodes.
- `src/game/actions/*`: Command/event/reducer pipeline for authoritative state changes.
- `src/game/rules/validators.ts`: Command legality checks.
- `src/game/turn/*`: Phase machine and stack/priority helpers.
- `src/game/types.ts`: Shared frame type definitions.
- `src/App.css`: Full-window layout and canvas styling.
- `src/ui/HandTray.tsx`: Bottom-center hand tray overlay and click-to-play card controls.
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
- Priority/stack shell is active with debug commands (`P` pass, `R` no-op, `T` damage, `C` counter).
- Stack responses support explicit target metadata (currently used by `counter_top_item`).
- Stack effects are data-driven content IDs (`string`) validated at command time; resolver behavior stays typed via `StackResolutionRules`.
- Canvas interaction supports click-to-select and hovered-hex target preview overlays.
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
  - opening hand 7 + start-phase draw 1 on turn handoff
  - opening resources are non-zero for immediate playtesting (`credits: 3` + `2` faction resource)
  - `PLAY_CARD` command supports stack tactics and base-adjacent unit deployment
  - one-shot tactics move to discard on resolve/counter destination
  - hand/deck counters are derived from zones and re-synced after command processing
  - hand tray follows active player by default and displays `Hand X | Deck Y`
- `src/game/runtime.ts` accepts HMR updates from `src/game/systems.ts` via `import.meta.hot.accept` and swaps logic in place.
- `src/game/runtime.ts` persists runtime instance through `import.meta.hot.dispose(data.runtime = runtime)`.
- Runtime applies lightweight schema migration on hot-restored state (currently state version 8).
- Electron runs with `contextIsolation: true` and `nodeIntegration: false`.

## `getGameRuntime` Contract
- `getGameRuntime()` must return the same runtime instance for the life of the renderer session.
- `GameCanvas` should start one RAF loop and call `runtime.step(context, deltaSeconds)` each frame.
- UI/React props may update runtime through explicit runtime methods (for example `setMessage`, `setViewport`).
- Avoid storing canonical gameplay state in React component state/hooks.
- New gameplay code should prefer:
  - Types in `src/game/types.ts`
  - State fields + mutation methods in `src/game/runtime.ts`
  - Frame logic in `src/game/systems.ts`

## HMR Workflow
- Edit `src/game/systems.ts` for gameplay behavior changes. HMR will swap system functions without resetting runtime state.
- Edit `src/game/types.ts` and `src/game/runtime.ts` when introducing new persistent state.
- Keep HMR handlers in runtime when refactoring:
  - `accept("./systems", ...)` for system replacement
  - `dispose(...)` for state retention

## Next Extension Points
- Expand stack target rules beyond top-of-stack-only counters.
- Extract combat + victory into dedicated Phase 6 systems modules.
- Add MVP bot behavior loop for player 2.
- Add persistence (save/load) via preload-exposed APIs and IPC once gameplay loop stabilizes.
