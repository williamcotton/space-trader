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
- `src/GameCanvas.tsx`: Canvas mount + RAF loop driver. Delegates game logic to runtime/systems.
- `src/game/runtime.ts`: Persistent game runtime singleton with HMR state retention + system swapping.
- `src/game/systems.ts`: Game `update` and `render` systems. Safe to edit during HMR.
- `src/game/types.ts`: Shared game-state and frame type definitions.
- `src/App.css`: Full-window layout and canvas styling.
- `vite.config.ts`: Vite + React + Electron plugin setup.

## Commands
- `npm run dev`: Start Vite and Electron in development mode.
- `npm run build`: Type-check and produce production bundles.
- `npm run preview`: Preview renderer production build.
- `npm run typecheck`: Type-check TypeScript projects.

## Current Architecture Decisions
- Game state lives in `src/game/runtime.ts`, not React state, so gameplay state survives Fast Refresh.
- The loop is frame-rate independent using delta time.
- `update()` and `render()` are separate to keep game logic composable.
- `src/game/runtime.ts` accepts HMR updates from `src/game/systems.ts` and swaps logic in place.
- Electron runs with `contextIsolation: true` and `nodeIntegration: false`.

## Next Extension Points
- Introduce an entity model (player, ships, stations) in a game module.
- Add input systems and scene state into `src/game/systems.ts` + runtime state.
- Add an explicit game state manager (title, map, combat, market scenes).
- Add persistence (save/load) via preload-exposed APIs and IPC.
