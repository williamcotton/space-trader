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
- `src/game/types.ts`: Shared game-state and frame type definitions.
- `src/App.css`: Full-window layout and canvas styling.
- `vite.config.ts`: Vite + React + Electron plugin setup.
- `game-design.md`: Living gameplay design document for ongoing brainstorming and decisions.

## Commands
- `npm run dev`: Start Vite and Electron in development mode.
- `npm run build`: Type-check and produce production bundles.
- `npm run preview`: Preview renderer production build.
- `npm run typecheck`: Type-check TypeScript projects.

## Current Architecture Decisions
- Game state lives in `src/game/runtime.ts` (singleton), not React state, so gameplay state survives Fast Refresh.
- The loop is frame-rate independent using delta time.
- `update()` and `render()` are separate to keep game logic composable.
- `src/game/runtime.ts` accepts HMR updates from `src/game/systems.ts` via `import.meta.hot.accept` and swaps logic in place.
- `src/game/runtime.ts` persists runtime instance through `import.meta.hot.dispose(data.runtime = runtime)`.
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
- Introduce an entity model (player, ships, stations) in a game module.
- Add input systems and scene state into `src/game/systems.ts` + runtime state.
- Add an explicit game state manager (title, map, combat, market scenes).
- Add persistence (save/load) via preload-exposed APIs and IPC.
