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
- `src/GameCanvas.tsx`: Bare-bones game loop (`update` + `render`), bouncing `"hello, world!"`.
- `src/App.css`: Full-window layout and canvas styling.
- `vite.config.ts`: Vite + React + Electron plugin setup.

## Commands
- `npm run dev`: Start Vite and Electron in development mode.
- `npm run build`: Type-check and produce production bundles.
- `npm run preview`: Preview renderer production build.
- `npm run typecheck`: Type-check TypeScript projects.

## Current Architecture Decisions
- Game state in `GameCanvas.tsx` is mutable local state inside the effect, not React state.
- The loop is frame-rate independent using delta time.
- `update()` and `render()` are separate to keep game logic composable.
- Electron runs with `contextIsolation: true` and `nodeIntegration: false`.

## Next Extension Points
- Introduce an entity model (player, ships, stations) in a game module.
- Extract input handling and camera transforms from `GameCanvas.tsx`.
- Add an explicit game state manager (title, map, combat, market scenes).
- Add persistence (save/load) via preload-exposed APIs and IPC.
