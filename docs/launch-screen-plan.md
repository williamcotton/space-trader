# Launch Screen Plan

Last updated: April 19, 2026

## Goal

Introduce a shipped-game launch flow without giving up the current fast development loop.

The intended product behavior is:

- development can still boot directly into a playable match
- shipped builds open on a home/menu screen first
- the home/menu flow lets a player manage their name/profile, choose `Play vs AI` or `Play Online`, and access learning content
- multiplayer setup happens on a dedicated multiplayer screen
- match setup happens from the menu/setup flow instead of inside an already-running match

## Current State

The current app is optimized for iteration speed, not for first-run UX:

- [`src/App.tsx`](/Users/williamcotton/Projects/space-trader/src/App.tsx) always renders the live match shell
- [`src/game/runtime.ts`](/Users/williamcotton/Projects/space-trader/src/game/runtime.ts) creates a singleton runtime immediately at module load, and that runtime starts with a live local match
- [`src/ui/MultiplayerControls.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/MultiplayerControls.tsx) exposes queue/server controls inside the live match UI
- [`src/ui/GameTopBar.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/GameTopBar.tsx) exposes local-mode setup and debug actions inside the live match UI
- [`src/game/model/state.ts`](/Users/williamcotton/Projects/space-trader/src/game/model/state.ts) still creates players as `Player 1`, `Player 2`, etc.
- [`server/src/sessionStore.ts`](/Users/williamcotton/Projects/space-trader/server/src/sessionStore.ts) does not store any player display name
- [`scripts/capture-introduction-screenshots.ts`](/Users/williamcotton/Projects/space-trader/scripts/capture-introduction-screenshots.ts) currently assumes that visiting the dev app immediately yields a rendered canvas and a live `window.__gameRuntime`

That means the new front-door flow is not just a new component. It needs a small boot-flow layer above the match UI, and "player name" needs follow-on data work if we want the name to matter after match start.

## Product Direction

Recommended boot policy:

- add `VITE_BOOT_FLOW=home|direct_match`
- `home` is the default in both development and shipped builds
- `direct_match` is an explicit opt-in mode for development and automation only

Why an enum instead of a boolean:

- it gives us an explicit override for QA and debugging
- it avoids stacking multiple flags later
- it leaves room for future modes like `tutorial`

Additional requirement:

- `direct_match` is not only for developer convenience; it is also the compatibility path for automation like tutorial screenshot capture

Recommended rollout note:

- the final desired boot policy is `home` by default with explicit `direct_match` opt-in
- but the first implementation pass should remain behaviorally identical to the current game
- that means the boot-policy flip should happen only after the new menu/setup screens exist

## UX Goals

The shipped flow should optimize for an average player, not for someone already living in the dev build.

That means:

- reduce the number of decisions before the player can start a match
- use familiar game-menu language instead of internal or technical language
- separate first-time onboarding from returning-player quick access
- keep technical controls out of the primary flow
- make every screen answer:
  - where am I
  - what should I do next
  - how do I go back
- always give the player a clean destination after leaving a queue or ending a match

Recommended copy direction:

- `Play vs AI` instead of `Single-Player`
- `Play Online` instead of `Multiplayer`
- `Learn to Play` instead of burying tutorial content in docs
- `Settings` or `Profile` instead of exposing raw fields on the main screen

## Recommended UX

### Proposed Default UX

This document should assume the following V1 player-facing shape unless we explicitly decide otherwise:

- `Home` is the front door
- `Play vs AI` is the primary highlighted action
- `Play Online` is secondary but still prominent
- `Learn to Play` is always visible from the front door
- profile/callsign is visible on the home screen but is not a blocking full-screen form every launch
- solo play uses a minimal setup screen
- online play uses a dedicated setup screen plus a proper searching state
- gameplay uses a lightweight in-match menu instead of the current top network setup bar
- finished matches land on `Results`, then route cleanly back to `Home`
- bare `npm run dev` uses the same front-door flow as the shipped game
- direct-to-match boot only happens when explicitly requested via env flag

Recommended V1 screen order:

1. `Home`
2. `Play vs AI`
3. `Play Online`
4. `Learn to Play`
5. `Searching`
6. `In Match`
7. `In-Match Menu`
8. `Results`

### Main Menu / Home Screen

The launch screen should really be a lightweight main menu.

It should support:

- clear primary actions:
  - `Play vs AI`
  - `Play Online`
  - `Learn to Play`
- secondary actions:
  - `Settings` or `Profile`
  - `Quit`
- a visible profile/callsign area that is editable, but not necessarily a blocking field every time the app launches

Recommended first version:

- if no profile name exists yet, prefill a sensible default callsign and let the player edit it
- if a profile name already exists, show it as part of the home screen rather than forcing name entry before every session
- show the latest selected faction as a profile preference, not as a giant first-screen decision unless we decide otherwise
- visually treat `Play vs AI` as the safest default action for a new player
- keep the screen feeling like a game menu, not a setup form or debug dashboard

### First-Time Flow

For a new player, the app should avoid dumping them into a wall of setup controls.

Recommended first-run path:

1. Open on the home screen.
2. Highlight `Play vs AI` and `Learn to Play` as the two safest first actions.
3. If the player has no saved name, ask for a callsign inline or in a light first-run card.
4. Let the player start a recommended solo match with minimal setup.

### Returning-Player Flow

For a returning player, the app should feel faster:

- show the saved callsign immediately
- remember last-used faction and online format
- let the player get back to solo or online with one or two clicks
- keep advanced options available, but off the primary path

### Single-Player / Skirmish Screen

The average player still benefits from a dedicated solo setup screen, even if it stays simple.

Recommended first version:

- title it as `Skirmish` or `Play vs AI`
- keep only the core decisions visible:
  - player faction
- do not expose map, runtime profile, or experimental local format controls on the main solo path
- only expose AI difficulty if it is already meaningful and easy to understand
- keep advanced setup such as alternate maps or FFA formats out of the default first screen unless we decide they are core
- primary CTA:
  - `Start Skirmish`

Recommended first version:

- single-player starts a local 1v1 match against the existing bot flow
- advanced local formats such as 3-player and 4-player FFA can stay secondary until we know they belong in the shipped front door

### Learn Screen

This game is complex enough that an average player should not have to discover the tutorial content from the filesystem or external docs.

Recommended first version:

- add a dedicated `Learn to Play` screen reachable from the home screen
- reuse the material in [`docs/introduction.md`](/Users/williamcotton/Projects/space-trader/docs/introduction.md) and the generated introduction screenshots as the source content
- present it as a scrollable primer, stepper, or slideshow rather than a raw markdown document
- end with clear actions:
  - `Start Practice Match`
  - `Back to Menu`

### Dedicated Multiplayer Screen

The multiplayer screen should own all current pre-match network controls:

- server connection status
- server URL, if exposed at all
- format selection
- faction selection
- queue / leave queue actions
- queue status and waiting-state messaging
- quit/back-to-menu behavior before match start

Recommended first version:

- selecting `Play Online` on the home screen routes to this screen
- `Find Match` lives here, not in the in-match HUD
- the screen should speak in player language:
  - `Play Online`
  - `Searching for Match`
  - `Cancel Search`
  - `Connection Problem`
- once a match starts, the player transitions into the normal gameplay screen
- if the player leaves queue or backs out, they return to the home screen
- raw server URL input should not be a primary shipped control; keep it in an advanced/dev-only area

### Play Online Readiness

This needs a product decision, not just a UI decision.

If there is not yet a real shipped multiplayer endpoint, `Play Online` should not be presented as a normal consumer-ready feature.

Recommended first version:

- if online is ready for players, present it as a normal menu option
- if online is not ready, either:
  - hide it in shipped builds
  - label it clearly as testing/beta
  - or gate it behind a deliberate advanced/dev affordance

What we should avoid:

- showing `Play Online` as a normal front-door choice while it still assumes `localhost` or developer-managed setup

### Queue / Connecting State

The average player experience should include a proper waiting state, not just a status pill.

Recommended first version:

- when searching, transition the multiplayer screen into a queue state
- keep the chosen faction and format visible
- show a clear primary action to cancel and return
- optionally rotate short tips pulled from the introduction content while waiting

### Post-Match Results Screen

The current plan has focused mostly on getting into a match, but average players also care about what happens after a match ends.

Recommended first version:

- after a local or online match ends, show a lightweight results screen instead of silently dropping the player into a raw disconnected state
- include:
  - win/loss/result summary
  - match format
  - return-to-menu action
  - `Play Again` or `Play vs AI Again` for local, if easy to support
- for online, keep this simple if rematch is not yet a real feature
- prefer `Results -> Home` over dumping the player directly back into setup without context

### Resume / Reconnect Handling

For online play, average-gamer UX should also cover interrupted sessions.

Recommended direction:

- if the client has a stored session and can re-establish a live online match, surface a clear `Reconnect to Match` path from the home screen or a dedicated reconnect screen
- if reconnect fails, fall back cleanly to the multiplayer screen with a human-readable error
- do not strand the player in a technical `error` state with no obvious next action

### Recommended Default Transitions

The screen transitions should be explicit and predictable:

1. `Home -> Play vs AI -> In Match -> Results -> Home`
2. `Home -> Learn to Play -> Start Practice Match -> In Match`
3. `Home -> Play Online -> Searching -> In Match -> Results -> Home`
4. `Searching -> Cancel -> Home`
5. `In Match -> In-Match Menu -> Return to Menu -> Results` or `Home`, depending on final design
6. `Reconnect failure -> Play Online` with a clear error and next action

### Screen-by-Screen Spec

#### Home

Purpose:

- give the player a clear first decision
- surface the safest way to start playing
- expose profile and learning without turning the screen into a form

Visible content:

- game title / branding
- primary buttons:
  - `Play vs AI`
  - `Play Online`
  - `Learn to Play`
- secondary buttons:
  - `Settings` or `Profile`
  - `Quit`
- profile card:
  - `Callsign`
  - last-used faction
  - optional `Edit` action
- optional reconnect card if an online session is recoverable:
  - `Reconnect to Match`

Fields:

- callsign field only if no profile exists yet, or when the player chooses `Edit`
- no format picker
- no server URL
- no queue controls
- no runtime-profile or map picker

Primary actions:

- `Play vs AI` -> `Play vs AI` screen
- `Play Online` -> `Play Online` screen
- `Learn to Play` -> `Learn to Play` screen

Secondary actions:

- `Settings` or `Profile` -> settings/profile surface
- `Quit` -> close app
- `Reconnect to Match` -> reconnect flow or directly back into match

Rules:

- highlight `Play vs AI` visually as the recommended first action
- if online is not actually player-ready, do not show `Play Online` as a normal primary button
- if no callsign exists, show an inline first-run prompt rather than a separate blocking full-screen form

#### Play vs AI

Purpose:

- let the player start a solo match with minimal friction

Visible content:

- screen title: `Play vs AI` or `Skirmish`
- brief subtitle explaining it is a local match versus the bot
- faction picker
- optional AI difficulty row only if it is real and understandable
- primary button:
  - `Start Skirmish`
- secondary buttons:
  - `Back`

Fields:

- `Faction`
- optional `Difficulty`

Fields intentionally omitted in V1:

- map selection
- runtime profile selection
- local FFA selection
- advanced deck/content settings

Default values:

- faction defaults to last-used local faction if available
- otherwise use a sensible default such as `Alloy Clan`

Primary actions:

- `Start Skirmish` -> create local 1v1 bot match -> `In Match`

Secondary actions:

- `Back` -> `Home`

Rules:

- one screen, one main decision
- the player should be able to go from `Home` to active solo match in two clicks

#### Play Online

Purpose:

- collect only the information needed to enter matchmaking

Visible content:

- screen title: `Play Online`
- connection status label
- format picker
- faction picker
- advanced disclosure:
  - server URL
- primary button:
  - `Find Match`
- secondary buttons:
  - `Back`

Fields:

- `Format`
- `Faction`
- advanced `Server URL` only if exposed in this build

Default values:

- format defaults to last-used online format
- faction defaults to last-used online faction
- server URL defaults from client config, but should stay outside the primary path

Primary actions:

- `Find Match` -> ensure session -> join queue -> `Searching`

Secondary actions:

- `Back` -> `Home`

Rules:

- use player-facing format labels like `1v1 PvP`
- keep any localhost or debug-only networking details hidden unless the build is explicitly meant for testers/developers
- if connection/session open fails, keep the player on this screen and show a human-readable error with retry behavior

#### Searching

Purpose:

- reassure the player that matchmaking is in progress
- give them one clear way to cancel

Visible content:

- title: `Searching for Match`
- chosen format
- chosen faction
- status text:
  - queue status
  - reconnecting if needed
  - clear connection problem text if needed
- primary button:
  - `Cancel Search`
- optional rotating tips or intro snippets

Fields:

- none

Primary actions:

- matchmaking success -> `In Match`

Secondary actions:

- `Cancel Search` -> leave queue -> `Home`

Rules:

- do not leave the player on the full setup form while queued
- do not expose unrelated setup while searching
- keep the screen calm and readable

#### Learn to Play

Purpose:

- give a new player a clear explanation path from inside the game UI

Visible content:

- title: `Learn to Play`
- tutorial content built from the existing introduction doc and screenshots
- previous/next or scroll navigation
- exit actions:
  - `Start Practice Match`
  - `Back to Menu`

Fields:

- none

Primary actions:

- `Start Practice Match` -> local practice match -> `In Match`

Secondary actions:

- `Back to Menu` -> `Home`

Rules:

- this should feel like in-game onboarding, not like opening a raw markdown file
- preserve the current screenshot-generation workflow as the content source

#### In-Match Menu

Purpose:

- provide session-level exit actions without reintroducing setup UI into gameplay

Visible content:

- menu title or utility drawer
- local match actions:
  - `Return to Menu`
- network match actions:
  - `Quit Match`
  - `Disconnect`
  - `Return to Menu` after cleanup
- close action:
  - `Resume`

Fields:

- none

Primary actions:

- `Resume` -> back to `In Match`
- `Return to Menu` -> `Results` or `Home`, depending on final match-exit design
- `Quit Match` -> leave network match cleanly -> `Results` or `Home`
- `Disconnect` -> disconnect client cleanly -> `Home` or `Play Online` with state reset

Rules:

- reachable by visible button and `Esc`
- must not contain faction, queue, or server setup controls

#### Results

Purpose:

- give closure after a match and a clear next step

Visible content:

- result headline:
  - `Victory`
  - `Defeat`
  - `Match Ended`
- summary details:
  - mode
  - format
  - optional winner/opponent summary
- primary button:
  - local: `Play Again`
  - online: `Return Home`
- secondary buttons:
  - `Return Home`
  - optional `Play vs AI Again` copy variant if clearer than `Play Again`

Fields:

- none

Primary actions:

- local `Play Again` -> restart same solo flow -> `In Match`
- `Return Home` -> `Home`

Rules:

- never drop the player from `In Match` straight into a blank disconnected state if we can show `Results`
- online rematch should not be faked if it does not exist yet

### In-Match UI After This Change

Once the player is in a match:

- the existing match UI remains the main play surface
- local-only debug controls should stay available in development
- shipped UX should not depend on in-match setup controls for basic mode selection
- the current top-of-screen network match bar should no longer be part of the gameplay shell
- the gameplay screen still needs an in-match way to leave:
  - local match: quit to menu
  - network match: quit match / disconnect

Recommended treatment:

- add a lightweight in-match system menu or top-level action, not the full current multiplayer bar
- make it reachable from the gameplay screen at all times
- support keyboard access such as `Esc` in addition to a visible button

## Architecture Recommendation

### 1. Add a Boot/Session Layer Above the Match UI

Create a top-level app controller that decides between:

- `home`
- `learn`
- `single_player_setup`
- `multiplayer_setup`
- `multiplayer_queue`
- `local_match`
- `network_match`
- `post_match`

This controller should own:

- reading the boot-flow env flag
- remembering launch form state
- deciding when to instantiate or reset the runtime
- deciding when to hand off to the existing match shell

### 2. Avoid Booting a Hidden Match Behind the Home/Menu Flow

This is the main architectural constraint.

Today, importing the live match shell pulls in the runtime singleton, which immediately creates a live local match. That is fine for development, but it is the wrong behavior for a shipped home/menu flow.

Recommended direction:

- do not import the live match shell on the initial home/menu path
- either lazy-load the match shell, or make runtime creation lazy, or both
- prefer a true "no active match yet" boot state rather than hiding a match behind the menu

Why this matters:

- avoids background bot automation and unnecessary match state before the player has chosen a mode
- avoids confusing state resets when the player finally clicks `Start`
- keeps the home/menu flow conceptually clean

### 3. Move Match Setup Entry Out of the Live Match HUD

The home screen should become the primary way to choose:

- play mode
- learn flow
- profile/settings entry

The single-player setup screen should become the primary way to choose:

- solo-match configuration

The dedicated multiplayer screen should become the primary way to choose and manage:

- format
- faction
- server connection details
- queue actions and waiting state

The live match UI can keep some setup affordances for development, but those should no longer be the main shipped UX path.

That specifically means the logic currently rendered by [`src/ui/MultiplayerControls.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/MultiplayerControls.tsx) should move out of the top of the match UI and into the multiplayer screen.

### 4. Keep Lightweight Session Exit Controls In-Match

Removing the full multiplayer bar does not mean removing all session controls from gameplay.

We still need an always-available way to:

- leave a local match and return to menu
- quit a live network match
- disconnect from the server when appropriate

Recommended direction:

- add a small in-match system menu, pause menu, or top-right utility button
- keep this focused on session-level actions, not setup/configuration
- do not reintroduce faction, format, queue, or server setup controls into the gameplay shell

Recommended first-pass actions:

- local match:
  - `Return to Menu`
- network match:
  - `Quit Match`
  - `Disconnect`
  - `Return to Menu` after the session is cleaned up

The important distinction is:

- pre-match setup belongs on the launch or multiplayer screens
- destructive session-exit actions still belong inside the gameplay screen

### 5. Preserve an Automation-Safe Direct Entry Path

This is required for [`scripts/capture-introduction-screenshots.ts`](/Users/williamcotton/Projects/space-trader/scripts/capture-introduction-screenshots.ts).

Today that script:

- opens the dev app at the root URL
- waits for `canvas`
- waits for `window.__gameRuntime`
- mutates runtime state directly to build tutorial scenes

That means the home/menu work must not force screenshot automation to click through the menu just to reach a usable runtime.

Recommended direction:

- preserve a guaranteed direct-to-match boot path for automation
- keep `window.__gameRuntime` available in dev-oriented direct-match flows
- add an explicit runtime-readiness signal for automation so scripts do not depend only on incidental timing
- prefer an explicit automation entry path over relying on whatever the current default happens to be

Practical options:

- keep `npm run dev` behaving like the regular home/menu flow by default
- start the dev server with an explicit env flag when direct-match boot is needed, for example:
  - `VITE_BOOT_FLOW=direct_match npm run dev`
- optionally add a helper script such as `npm run dev:direct-match` so developers and screenshot automation do not have to remember the exact env syntax

Recommendation:

- short term: require an explicit boot flag for direct-match dev behavior
- short term: define a small explicit automation-ready contract, for example:
  - set `window.__spaceTraderRuntimeReady = true` when direct-match gameplay is fully mounted
  - optionally also dispatch a `space-trader:runtime-ready` browser event for manual/dev debugging
- medium term: give screenshot automation and local iteration a stable helper entrypoint built on that same explicit env-driven mode

## Implementation Findings

### 1. The Current Match Shell Is Eager and Runtime-Coupled

Today the current app root is the match screen:

- [`src/App.tsx`](/Users/williamcotton/Projects/space-trader/src/App.tsx) directly imports and renders the gameplay shell
- [`src/GameCanvas.tsx`](/Users/williamcotton/Projects/space-trader/src/GameCanvas.tsx) grabs the runtime with `useRef(getGameRuntime())`
- [`src/ui/useGameSnapshot.ts`](/Users/williamcotton/Projects/space-trader/src/ui/useGameSnapshot.ts) and [`src/ui/useRuntimeViewSnapshot.ts`](/Users/williamcotton/Projects/space-trader/src/ui/useRuntimeViewSnapshot.ts) call `getGameRuntime()` during render
- [`src/ui/GameTopBar.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/GameTopBar.tsx), [`src/ui/HandTray.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/HandTray.tsx), [`src/ui/GameHudPanels.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/GameHudPanels.tsx), and [`src/ui/CommandStackPanel.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/CommandStackPanel.tsx) all assume that singleton runtime exists

Consequence:

- a real menu flow cannot be built by just conditionally hiding the current UI
- the gameplay shell needs to become a distinct screen entry point

### 2. The Runtime Singleton Is Created Too Early

[`src/game/runtime.ts`](/Users/williamcotton/Projects/space-trader/src/game/runtime.ts) currently creates the runtime singleton at module load:

- it initializes `hotData.runtime ?? new GameRuntime()` at the top level
- it immediately wires HMR around that instance
- in dev, it exposes that runtime on `window.__gameRuntime`

Consequence:

- importing the runtime module creates a live local match even before the player chooses a mode
- the first major implementation task is making runtime creation lazy

Recommended implementation direction:

- keep the singleton model, but create it on first use rather than at import time
- move singleton creation behind `getGameRuntime()` or a small `ensureGameRuntime()` helper
- only assign `window.__gameRuntime` once the runtime actually exists
- expose an explicit automation-ready marker once runtime-backed gameplay is actually ready
- preserve HMR behavior by storing `null | GameRuntime` in hot data instead of always constructing immediately

### 3. The Multiplayer Client Currently Pulls In the Runtime Module

[`src/network/client.ts`](/Users/williamcotton/Projects/space-trader/src/network/client.ts) imports `getGameRuntime` at the top of the module.

That matters because the new `Play Online` screen will need:

- `useMultiplayerSnapshot`
- `getMultiplayerClient`
- queue/session state

Consequence:

- with the current eager runtime module, even importing multiplayer setup UI would create a hidden local match
- after runtime creation is made lazy, the existing multiplayer client becomes much safer to reuse for new screens

### 4. The Multiplayer Client Already Covers Most Queue/Session Behavior

The good news is that the current multiplayer client already has most of the state needed for the new non-gameplay flow:

- persisted selected faction and format in `sessionStorage`
- status states:
  - `offline`
  - `connecting`
  - `connected`
  - `queued`
  - `in_match`
  - `reconnecting`
  - `error`
- explicit methods for:
  - `ensureSession()`
  - `joinQueue()`
  - `leaveQueue()`
  - `quitMatch()`
  - `disconnect()`

Consequence:

- the dedicated `Play Online` and `Searching` screens can be built mostly as UI reshaping around existing client state
- we do not need to invent a second multiplayer state system

### 5. There Is No App-Level Screen State Yet

[`src/main.tsx`](/Users/williamcotton/Projects/space-trader/src/main.tsx) simply renders [`src/App.tsx`](/Users/williamcotton/Projects/space-trader/src/App.tsx), and [`src/App.tsx`](/Users/williamcotton/Projects/space-trader/src/App.tsx) is currently just the match shell.

There is no existing concept of:

- current screen
- previous screen
- queued/searching screen state
- results screen state
- profile flow state

Consequence:

- we need a small app controller above gameplay
- this should be explicit application state, not hidden inside the runtime

### 6. Post-Match Results Need Separate App State

The runtime currently knows gameplay state, but not the product-level screen flow we want after the match ends.

Local details:

- local victory is represented inside the runtime via `state.winner`

Network details:

- the multiplayer client handles `match_ended`
- `quitMatch()` and `disconnect()` currently clean up network mode, but they do not route the app to a results or menu screen

Consequence:

- the app controller should own a small `lastMatchResult` or `postMatchState`
- results should not be inferred only from the existing on-screen match HUD

### 7. Profile Storage Does Not Exist Yet

There is currently no app-level profile store for:

- callsign
- last-used local faction
- first-run completion

By contrast, the multiplayer client already stores:

- session token
- preferred online faction
- preferred online format

Consequence:

- player profile data should live in a separate store from multiplayer session state
- profile data should likely use `localStorage`, while multiplayer token/session data can remain in `sessionStorage`

### 8. `Quit` Needs Shell-Level Support If We Want It To Be Real

[`electron/preload.ts`](/Users/williamcotton/Projects/space-trader/electron/preload.ts) currently exposes only version information to the renderer.

Consequence:

- a `Quit` button on the home screen either needs:
  - a simple renderer-side fallback such as `window.close()`, if acceptable
  - or a proper preload API such as `window.electron.quit()`

This is not a blocker for the broader flow, but it should be treated as a separate implementation seam.

### 9. The Current CSS Is Match-Screen-Oriented

[`src/App.css`](/Users/williamcotton/Projects/space-trader/src/App.css) is currently structured around:

- `.app-shell`
- `.multiplayer-bar`
- `.game-workspace`
- match HUD and stack layout

Consequence:

- adding menu/setup/results screens will be cleaner if we stop treating the current CSS file as one giant screen stylesheet
- we should expect either:
  - new screen-scoped CSS sections
  - or separate files/components for home/setup/results styles

## Proposed Build Strategy

### 1. Extract the Current Gameplay Shell Into `MatchScreen`

Recommended direction:

- keep the current gameplay UI largely intact
- move the current contents of [`src/App.tsx`](/Users/williamcotton/Projects/space-trader/src/App.tsx) into a dedicated match-screen component
- let `App` become a screen router/controller instead of remaining the gameplay screen

This gives us a clean place to mount:

- `Home`
- `Play vs AI`
- `Play Online`
- `Searching`
- `Learn to Play`
- `Results`
- `MatchScreen`

### 2. Introduce Explicit App Screen State

Recommended shape:

```ts
type AppScreen =
  | { kind: "home" }
  | { kind: "single_player_setup" }
  | { kind: "multiplayer_setup" }
  | { kind: "multiplayer_queue" }
  | { kind: "learn" }
  | { kind: "match"; mode: "local" | "network" }
  | { kind: "results"; result: MatchResultSummary };
```

This state should live above the gameplay runtime and above the individual screen components.

It should own:

- navigation between menu/setup/results screens
- starting local matches
- entering/exiting online queue flow
- post-match routing
- reconnect entry points

### 3. Make Runtime Creation Lazy, Not Eager

Recommended first implementation:

- keep one runtime singleton
- do not construct it until some screen actually needs gameplay
- do not create it just because the app imported a helper or multiplayer screen

Expected change in [`src/game/runtime.ts`](/Users/williamcotton/Projects/space-trader/src/game/runtime.ts):

- replace eager top-level creation with lazy `getGameRuntime()`
- keep HMR state nullable until first use
- expose `window.__gameRuntime` only after creation

This is the key enabling change for the rest of the plan.

### 4. Reuse the Existing Multiplayer Client, But Let the App Controller Own Navigation

Recommended split of responsibility:

- multiplayer client:
  - server/session/queue transport
  - persisted online preferences
  - authoritative network lifecycle
- app controller:
  - which screen is visible
  - when to show `Searching`
  - when to enter `MatchScreen`
  - when to show `Results`
  - where to send the player after cancel, quit, disconnect, or match end

This avoids pushing product-navigation logic into the network transport layer.

### 5. Add a Separate Profile Store

Recommended storage split:

- `localStorage`:
  - callsign
  - first-run completion
  - last-used local faction
- `sessionStorage`:
  - multiplayer token
  - online preferred faction
  - online preferred format

This avoids conflating player identity/preferences with ephemeral network session state.

### 6. Use App-Level Match Result Summaries

Recommended approach:

- when a local match ends, derive a lightweight result summary from runtime state and route to `Results`
- when a network match ends, quits, or disconnects, capture a product-level result/disconnect summary before routing away from gameplay

That summary does not need to mirror full `GameState`. It only needs enough for the `Results` screen:

- local vs network
- win/loss/ended/disconnected
- format label
- optional winner/opponent label

### 7. Keep the Learn Screen Static in V1

Recommended approach:

- do not over-engineer content loading
- treat [`docs/introduction.md`](/Users/williamcotton/Projects/space-trader/docs/introduction.md) and the generated screenshots as source material, not necessarily as something to parse live at runtime
- a static data structure or hand-built React screen is acceptable for V1

This keeps the scope focused on front-door UX rather than content tooling.

### 8. Standardize the Dev Shortcut

Recommended implementation:

- add `VITE_BOOT_FLOW` typing in [`src/vite-env.d.ts`](/Users/williamcotton/Projects/space-trader/src/vite-env.d.ts)
- keep [`package.json`](/Users/williamcotton/Projects/space-trader/package.json) `dev` pointed at the normal home/menu flow
- add a helper like `dev:direct-match` for local iteration
- update screenshot instructions to run against explicit `direct_match` boot

This keeps dev convenience without weakening the shipped flow.

### 9. Add an Explicit Automation Readiness Signal

Recommended implementation:

- do not rely only on `window.__gameRuntime != null` as the signal that direct-match boot is ready
- expose a small explicit readiness marker for scripts, for example:
  - `window.__spaceTraderRuntimeReady = true`
- optionally also dispatch a browser event like `space-trader:runtime-ready` for manual/dev debugging

Reason:

- this reduces brittleness when runtime creation becomes lazy and gameplay mounting is no longer an import-time side effect
- screenshot automation can wait on a stable contract instead of polling incidental internal state

## Recommended Delivery Strategy

The safest rollout is a two-step approach:

1. Refactor first, with no visible product change.
2. Ship the new front-door UX on top of that refactor.

This is better than trying to do the architectural cleanup and the player-facing menu flow in the same first pass.

### Refactor-First Principle

The first implementation phase should result in behavior that is effectively identical to the current game:

- app still boots directly into the current match shell
- current gameplay layout stays in place
- current multiplayer bar stays in place
- tutorial screenshot workflow keeps working exactly as it does now
- no new player-facing menu flow is required yet

What changes in that phase should be structural, not experiential:

- gameplay shell extracted into a dedicated screen component
- runtime creation made lazy instead of eager
- app-level screen controller introduced, even if it only routes to gameplay at first
- storage and result-summary seams prepared for later screens
- env-driven boot plumbing prepared for the later home/menu default

The reason for this split is simple:

- if Phase 1 both refactors the runtime boot path and introduces the full new UI flow, debugging gets much harder
- if Phase 1 preserves visible behavior, we can verify the architecture change in isolation before layering in the new UX

## Automation and Tutorial Screenshot Support

The screenshot capture workflow should be treated as a first-class requirement for this feature.

What must remain possible:

- start the dev server
- run [`scripts/capture-introduction-screenshots.ts`](/Users/williamcotton/Projects/space-trader/scripts/capture-introduction-screenshots.ts)
- have Playwright land directly in a live match state without manual menu interaction
- have the script continue to access `window.__gameRuntime` and manipulate deterministic match state for tutorial scenes
- have the script wait on an explicit runtime-ready signal rather than depending only on timing

What we should avoid:

- making the script depend on clicking menu controls
- making the script depend on fragile timing around lazy runtime creation
- removing the runtime global in the only environment where this script runs
- treating `window.__gameRuntime` existence by itself as the only definition of “ready”

Recommended implementation stance:

- shipped UX can default to the home/menu flow
- development and automation must retain a supported direct-entry path
- `npm run dev` should use the same home/menu flow a normal player sees unless `VITE_BOOT_FLOW=direct_match` is explicitly set
- screenshot automation should use that explicit env-driven path rather than implicit import side effects
- screenshot automation should prefer an explicit runtime-ready marker once direct-match gameplay is mounted

## Recommended Screen Map

Recommended player-facing screen set:

1. `Home`
2. `Play vs AI` / `Skirmish`
3. `Play Online`
4. `Learn to Play`
5. `Searching for Match`
6. `In Match`
7. `In-Match Menu`
8. `Match Results`
9. `Settings/Profile`

Not all of these need full production depth in the first implementation, but the flow should be designed around this shape rather than around a single overloaded launch form.

## Recommended Player Journeys

### New Player

1. Open app on `Home`.
2. See `Play vs AI`, `Play Online`, and `Learn to Play`.
3. Choose a callsign if none exists yet.
4. Read the intro or start a recommended solo match.
5. Finish the match and land on `Match Results`.
6. Return to `Home`.

### Returning Solo Player

1. Open app on `Home`.
2. Click `Play vs AI`.
3. Confirm or tweak faction.
4. Start match.
5. Use in-match menu to return to results or menu when finished.

### Returning Online Player

1. Open app on `Home`.
2. Click `Play Online`.
3. Pick format and faction.
4. Enter `Searching for Match`.
5. Transition into match automatically when ready.
6. End on `Match Results` or return cleanly to `Home`.

### Interrupted Online Session

1. Open app.
2. If a live session can be recovered, surface `Reconnect to Match`.
3. If not, route the player to `Play Online` with a clear error and a next action.

## Name Handling

There are two levels of "name" support:

### Phase A: Profile-Only Name

The menu/profile flow collects and persists a local name, but gameplay still labels seats as `Player 1`, `Player 2`, etc.

This is the cheapest path and is enough if the first goal is just better pre-match UX.

### Phase B: Real Match Display Names

If we want names to appear in match UI, queue UI, and multiplayer events, we need follow-on work in:

- client launch/profile state
- multiplayer session open/join payloads
- server session store
- match start payload
- `GameState.players[*].name`
- UI surfaces that currently call `getPlayerLabel(...)`

Recommendation:

- include profile-name capture in the home/profile flow from day one
- treat real propagated display names as a second implementation slice unless we want to take on the extra scope immediately

## Phased Plan

### Phase 0: Foundation Refactor, No UX Change

Goal:

- leave the game behaving like it does today while preparing the codebase for the new screen flow

Deliver:

- gameplay shell extracted into a dedicated `MatchScreen`
- top-level app controller introduced, but still routing to current gameplay by default
- lazy runtime creation instead of eager runtime boot
- app-level screen/result types introduced
- profile storage seam introduced
- explicit boot-flow env plumbing introduced, without yet flipping the player-facing default flow
- screenshot-capture compatibility preserved

Expected behavior:

- app still launches directly into the match like it does today
- current match UI still looks and behaves the same
- current multiplayer bar is still present
- current tutorial screenshot workflow still works

Expected code areas:

- [`src/main.tsx`](/Users/williamcotton/Projects/space-trader/src/main.tsx)
- [`src/App.tsx`](/Users/williamcotton/Projects/space-trader/src/App.tsx)
- [`src/game/runtime.ts`](/Users/williamcotton/Projects/space-trader/src/game/runtime.ts)
- [`src/vite-env.d.ts`](/Users/williamcotton/Projects/space-trader/src/vite-env.d.ts)
- [`package.json`](/Users/williamcotton/Projects/space-trader/package.json)
- extracted match-screen components
- [`src/network/client.ts`](/Users/williamcotton/Projects/space-trader/src/network/client.ts)
- [`scripts/capture-introduction-screenshots.ts`](/Users/williamcotton/Projects/space-trader/scripts/capture-introduction-screenshots.ts)

Acceptance criteria for this phase:

- visible behavior is effectively unchanged from the current game
- no hidden runtime or menu-screen regressions are introduced
- the runtime is no longer created purely because the module was imported
- the codebase is ready for non-gameplay screens without forcing them to ship immediately

### Phase 1: New Front Door UX

Deliver:

- top-level app controller
- home screen UI
- learn screen entry
- single-player setup screen
- dedicated multiplayer screen
- queue/waiting state
- online readiness treatment for shipped builds
- lightweight in-match session menu or exit controls
- post-match results screen
- single-player start path
- multiplayer queue entry from the dedicated multiplayer screen
- final boot-policy flip to `home` by default with explicit `direct_match` opt-in
- screenshot-capture compatibility preserved

Expected code areas:

- new home-screen components/state
- new learn-screen components/state
- new single-player-screen components/state
- new multiplayer-screen components/state
- results-screen components/state
- updated in-match shell/top-bar/system-menu components
- [`src/network/client.ts`](/Users/williamcotton/Projects/space-trader/src/network/client.ts)
- [`src/ui/MultiplayerControls.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/MultiplayerControls.tsx)
- [`scripts/capture-introduction-screenshots.ts`](/Users/williamcotton/Projects/space-trader/scripts/capture-introduction-screenshots.ts)
- [`docs/introduction.md`](/Users/williamcotton/Projects/space-trader/docs/introduction.md) as source material for the learn flow

Notes:

- flip the app from current direct-match boot to the new home/menu flow in this phase, not before
- keep direct-match boot available for development behind an explicit env flag
- make bare `npm run dev` follow the normal home/menu flow once this phase lands
- keep tutorial screenshot automation able to reach a live runtime without menu clicks
- keep current local/multiplayer rules behavior unchanged once a match has started
- remove the network match bar from the gameplay shell and re-home that behavior in the multiplayer screen
- keep a minimal in-match exit/disconnect path available from the gameplay screen
- make the front door feel like a game menu, not a debug form
- avoid mixing home/menu responsibilities into the runtime itself unless needed

### Phase 2: Ship-Ready Cleanup

Deliver:

- better first-run profile handling
- clean reconnect/resume UX for online sessions
- settings/profile surface
- hide or demote dev-centric controls in shipped mode
- move server URL to advanced/dev-only
- define what happens on quit match / return to menu
- decide whether matchmaking should return to the home screen or results screen cleanly after a match ends

This phase is about making the new flow feel intentional instead of just layering a menu on top of dev tooling.

### Phase 3: Full Name Propagation

Deliver:

- player names stored in session/profile state
- server accepts and remembers display names
- match start payload includes names
- `GameState.players[*].name` initialized from launch/session data
- top bar / HUD / multiplayer status can show names instead of seat labels where appropriate

## Acceptance Criteria

We should consider the feature ready for coding once we agree on these outcomes:

- bare `npm run dev` uses the normal home/menu flow
- `npm run dev` can still be configured to land directly in a match when an explicit env flag is set
- a shipped build defaults to the home screen
- the player can clearly choose `Play vs AI`, `Play Online`, or `Learn to Play`
- `Play vs AI` is the primary recommended first action for a new player
- single-player can be started from a clean setup flow without relying on in-match controls
- multiplayer queue entry can be started from a dedicated multiplayer screen without relying on the current multiplayer bar
- tutorial/introduction content is reachable from the shipped UI
- if online is not truly consumer-ready, the shipped UI does not present it as a normal ready-for-everyone feature
- no hidden local match is running behind the home/menu path
- the current top-of-match network bar is removed from the normal gameplay shell
- the gameplay screen still provides a lightweight way to quit the current match or disconnect
- `scripts/capture-introduction-screenshots.ts` still works without manual menu interaction
- the first implementation makes a clear choice on whether the name is profile-only or fully propagated

## Open Questions

These are the main decisions to settle before implementation:

1. Should the first shipped front door be a true `Home` screen with `Play vs AI`, `Play Online`, and `Learn to Play`, or should we keep a more form-like launch screen?
2. Should the first single-player launch option be only `1v1 vs bot`, or should we expose local FFA formats immediately?
3. Should player name be profile-only in the first pass, or do we want full in-match name propagation in the same feature?
4. In shipped builds, should the multiplayer server URL be hidden entirely, or shown only behind an `Advanced` affordance?
5. After quitting or finishing a match, should the app return directly to `Home`, or land on a post-match summary first?
6. Do we want the current in-match setup controls to remain available in development only, or in all builds under a debug toggle?
7. What exact explicit dev/automation boot mechanism should we standardize on:
   `VITE_BOOT_FLOW=direct_match`,
   a helper script like `npm run dev:direct-match`,
   or both?
8. When a network match is live, do we want any reduced multiplayer status indicator to remain in-match, or should multiplayer state be entirely absent from the gameplay shell unless needed for errors/reconnects?
9. Should the in-match exit controls live in the top bar, an `Esc` menu, or both?
10. Do we want a reconnect/resume path on the first shipped pass, or leave that for follow-up work?
11. Is `Play Online` actually ready to be presented as a standard shipped menu option, or does it need gating/beta treatment?

## Recommended Decisions

To keep scope tight, my recommendation is:

1. The first shipped front door should be a real `Home` screen, not a form-first launcher.
2. Phase 1 single-player should be `1v1 vs bot` only.
3. The first pass should collect a name now but treat it as profile-only until Phase 3.
4. The server URL should move to advanced/dev-only UI.
5. Phase 1 should include a `Learn to Play` entry built from the existing introduction content.
6. Finishing or quitting a match should preferably land on a lightweight results screen, then `Home`.
7. Existing setup/debug controls should remain available in development, not as primary shipped UI.
8. We should standardize on an explicit env-driven direct-match override and likely add a helper dev script for convenience.
9. If we need in-match network status later, it should be a small status treatment, not the old setup bar.
10. The first pass should support both a visible in-match menu button and `Esc`.
11. Reconnect/resume can be a Phase 2 improvement if it complicates Phase 1 too much.
12. `Play Online` should only appear as a normal shipped menu option if it is backed by a real player-ready endpoint.
13. The first delivery phase should be refactor-only and preserve current visible behavior.
14. The boot default should not flip to `home` until the new front door actually exists.

## Implementation Order

Recommended coding order once this plan is approved:

1. Introduce the boot-flow flag plumbing, env typing, and helper dev shortcut plan.
2. Make runtime creation lazy so importing the runtime no longer creates a hidden match.
3. Split the live match UI into a distinct `MatchScreen` entry point.
4. Add the top-level app controller and explicit screen/result state, but keep it routing to the current gameplay flow.
5. Verify that visible behavior remains effectively unchanged and that screenshot capture still works.
6. Add the home screen with `Play vs AI`, `Play Online`, and `Learn to Play`.
7. Add the single-player setup screen and solo start flow.
8. Add the dedicated multiplayer screen and move current pre-match network controls into it.
9. Add a proper queue/wait state.
10. Replace the full multiplayer bar in gameplay with lightweight in-match exit/disconnect controls.
11. Wire tutorial content into a shipped learn screen.
12. Add post-match results flow.
13. Flip the default boot flow to `home`, while keeping explicit `direct_match` support for dev and screenshots.
14. Verify or update the tutorial screenshot workflow so it runs against explicitly flagged `direct_match` boot.
15. Clean up shipped-vs-dev control visibility.
16. Add full player-name propagation only if we decide it belongs in the same feature.

## File-by-File Implementation Plan

This section turns the rollout into a concrete file plan.

The intent is:

- Phase 0 changes architecture without changing visible behavior
- Phase 1 uses the new seams to add the actual player-facing menu/setup/results flow

### Phase 0: Foundation Refactor, No UX Change

#### [`src/game/runtime.ts`](/Users/williamcotton/Projects/space-trader/src/game/runtime.ts)

Responsibility in this phase:

- stop creating a live runtime at module import time
- keep the singleton model, but make creation lazy
- preserve HMR safety after the lazy-creation change
- preserve `window.__gameRuntime` for dev and screenshot use once a runtime has been created

Planned changes:

- replace eager top-level singleton construction with nullable hot data
- move construction behind `getGameRuntime()` or an `ensureGameRuntime()` helper
- ensure runtime creation still uses current default content/match behavior once invoked
- expose `window.__spaceTraderRuntimeReady` or equivalent once the runtime-backed gameplay screen is actually ready for automation
- keep existing runtime public APIs stable so gameplay components do not need to be rewritten in the same step

Acceptance check:

- importing `src/game/runtime.ts` alone no longer starts a hidden match
- once gameplay mounts, runtime behavior still matches the current game

#### [`src/App.tsx`](/Users/williamcotton/Projects/space-trader/src/App.tsx)

Responsibility in this phase:

- stop being the gameplay screen directly
- become the top-level app controller entry

Planned changes:

- extract the current gameplay JSX into a dedicated `MatchScreen`
- keep `App` behaviorally identical by routing straight to `MatchScreen` for now
- introduce minimal screen state types if needed, but do not yet expose new UX

Acceptance check:

- running the app still lands in the same gameplay screen as before

#### New [`src/screens/MatchScreen.tsx`](/Users/williamcotton/Projects/space-trader/src/screens/MatchScreen.tsx)

Responsibility in this phase:

- own the current gameplay shell that lives in `App.tsx` today

Planned changes:

- move the current structure into this screen:
  - `MultiplayerControls`
  - `GameTopBar`
  - `GameCanvas`
  - `HandTray`
  - `GameHudPanels`
  - `CommandStackPanel`
- preserve current layout and props behavior

Acceptance check:

- screen output matches current app behavior

#### [`src/main.tsx`](/Users/williamcotton/Projects/space-trader/src/main.tsx)

Responsibility in this phase:

- remain the root mount point
- stay simple unless app-controller boot wiring needs to move here

Planned changes:

- likely minimal or no behavior change
- only adjust if boot-mode initialization needs a cleaner root boundary

#### New [`src/app/types.ts`](/Users/williamcotton/Projects/space-trader/src/app/types.ts)

Responsibility in this phase:

- define app-level screen and result types before the actual screens ship

Planned contents:

- `AppScreen`
- `MatchResultSummary`
- any small app-shell enums or discriminated unions

Reason:

- keeps product-level navigation state out of the runtime model

#### New [`src/app/boot.ts`](/Users/williamcotton/Projects/space-trader/src/app/boot.ts)

Responsibility in this phase:

- centralize boot-flow env parsing

Planned contents:

- read `import.meta.env.VITE_BOOT_FLOW`
- normalize to app-level boot modes
- provide one place for dev-vs-normal boot decisions

Reason:

- avoids spreading env logic across screens and runtime code

#### New [`src/app/profileStore.ts`](/Users/williamcotton/Projects/space-trader/src/app/profileStore.ts)

Responsibility in this phase:

- create the seam for player-facing profile/preferences storage

Planned contents:

- read/write callsign
- read/write first-run completion
- read/write last-used local faction

Important separation:

- this stays separate from network session/token storage in `src/network/client.ts`

#### [`src/network/client.ts`](/Users/williamcotton/Projects/space-trader/src/network/client.ts)

Responsibility in this phase:

- remain the single multiplayer transport/session authority
- tolerate lazy runtime creation

Planned changes:

- verify that importing the client no longer causes hidden match boot once runtime is lazy
- avoid adding product navigation decisions here yet
- optionally add small hooks or events later, but keep Phase 0 minimal

Acceptance check:

- current multiplayer behavior still works from the existing gameplay bar

#### [`src/ui/useGameSnapshot.ts`](/Users/williamcotton/Projects/space-trader/src/ui/useGameSnapshot.ts)

#### [`src/ui/useRuntimeViewSnapshot.ts`](/Users/williamcotton/Projects/space-trader/src/ui/useRuntimeViewSnapshot.ts)

Responsibility in this phase:

- continue to work unchanged once runtime is lazy

Planned changes:

- ideally none, if `getGameRuntime()` remains a stable lazy accessor
- only adjust if lazy initialization creates timing issues

#### [`src/GameCanvas.tsx`](/Users/williamcotton/Projects/space-trader/src/GameCanvas.tsx)

Responsibility in this phase:

- continue to be the point where gameplay truly needs the runtime

Planned changes:

- likely no visual change
- verify that its current `useRef(getGameRuntime())` behavior still works correctly with lazy runtime construction

#### [`src/App.css`](/Users/williamcotton/Projects/space-trader/src/App.css)

Responsibility in this phase:

- keep current match-screen styling intact

Planned changes:

- minimal change, possibly only to follow the new `MatchScreen` wrapper
- avoid introducing the new menu styling in this phase

#### [`src/vite-env.d.ts`](/Users/williamcotton/Projects/space-trader/src/vite-env.d.ts)

Responsibility in this phase:

- add typing for `VITE_BOOT_FLOW`
- add typing for any explicit automation-ready window marker we expose

Planned changes:

- extend `ImportMetaEnv` / `ImportMeta` typings for the boot flag
- extend `Window` typings if we add `__spaceTraderRuntimeReady`

#### [`package.json`](/Users/williamcotton/Projects/space-trader/package.json)

Responsibility in this phase:

- keep `dev` as the normal current behavior until the new front door ships
- prepare explicit direct-match helper script

Planned changes:

- consider adding `dev:direct-match`
- do not change default `dev` behavior yet during the refactor phase

#### [`scripts/capture-introduction-screenshots.ts`](/Users/williamcotton/Projects/space-trader/scripts/capture-introduction-screenshots.ts)

Responsibility in this phase:

- keep screenshot generation working during the refactor

Planned changes:

- likely none initially if current direct-match behavior is preserved through Phase 0
- if needed, prepare for explicit `direct_match` boot later without changing current output
- update waits so the script can use the explicit runtime-ready signal once it exists instead of relying only on `window.__gameRuntime`

Acceptance check:

- screenshot generation still works after the runtime/app-shell refactor
- script waits are no more brittle than before

#### Phase 0 Execution Checklist

This is the recommended order for landing the refactor safely.

The intent is that each slice is small enough to verify independently and should preserve current visible behavior.

##### Slice 0.1: Add App-Level Types and Boot Plumbing

Goal:

- introduce product-level types and env parsing without changing runtime behavior yet

Files:

- new [`src/app/types.ts`](/Users/williamcotton/Projects/space-trader/src/app/types.ts)
- new [`src/app/boot.ts`](/Users/williamcotton/Projects/space-trader/src/app/boot.ts)
- [`src/vite-env.d.ts`](/Users/williamcotton/Projects/space-trader/src/vite-env.d.ts)

Expected visible behavior:

- none

Verification:

- typecheck passes
- app boots exactly as before

##### Slice 0.2: Extract `MatchScreen` Without Changing Layout

Goal:

- separate gameplay UI composition from app entry

Files:

- [`src/App.tsx`](/Users/williamcotton/Projects/space-trader/src/App.tsx)
- new [`src/screens/MatchScreen.tsx`](/Users/williamcotton/Projects/space-trader/src/screens/MatchScreen.tsx)
- [`src/App.css`](/Users/williamcotton/Projects/space-trader/src/App.css) only if wrapper changes require it

Expected visible behavior:

- app still opens straight into the same gameplay screen
- layout should be visually identical

Verification:

- manual visual comparison against current app
- no gameplay shell regressions

##### Slice 0.3: Make Runtime Creation Lazy

Goal:

- remove hidden match creation as a side effect of importing the runtime module

Files:

- [`src/game/runtime.ts`](/Users/williamcotton/Projects/space-trader/src/game/runtime.ts)
- any minimal follow-up in:
  - [`src/GameCanvas.tsx`](/Users/williamcotton/Projects/space-trader/src/GameCanvas.tsx)
  - [`src/ui/useGameSnapshot.ts`](/Users/williamcotton/Projects/space-trader/src/ui/useGameSnapshot.ts)
  - [`src/ui/useRuntimeViewSnapshot.ts`](/Users/williamcotton/Projects/space-trader/src/ui/useRuntimeViewSnapshot.ts)

Expected visible behavior:

- app still opens straight into gameplay
- runtime behavior inside gameplay remains unchanged

Verification:

- manual boot check
- gameplay still functions
- HMR still works
- importing multiplayer/session code no longer creates a hidden local match by itself
- if the automation-ready signal is added in this slice, it only flips true when gameplay is actually ready

##### Slice 0.4: Introduce App Controller Skeleton, Still Route Straight to Match

Goal:

- create the app-level navigation shell before adding any new screens

Files:

- [`src/App.tsx`](/Users/williamcotton/Projects/space-trader/src/App.tsx)
- [`src/main.tsx`](/Users/williamcotton/Projects/space-trader/src/main.tsx) only if needed
- [`src/app/types.ts`](/Users/williamcotton/Projects/space-trader/src/app/types.ts)

Expected visible behavior:

- app still lands in gameplay immediately
- no new menu is shown yet

Verification:

- manual boot check
- no navigation regressions inside the current gameplay flow

##### Slice 0.5: Add Profile and Result Seams, Unused by UX

Goal:

- prepare storage and result-summary boundaries without shipping new screens yet

Files:

- new [`src/app/profileStore.ts`](/Users/williamcotton/Projects/space-trader/src/app/profileStore.ts)
- new [`src/app/resultSummary.ts`](/Users/williamcotton/Projects/space-trader/src/app/resultSummary.ts)

Expected visible behavior:

- none

Verification:

- typecheck passes
- app still boots and plays as before

##### Slice 0.6: Add Explicit Dev Shortcut Support

Goal:

- prepare the future explicit `direct_match` dev path without changing current default boot behavior

Files:

- [`package.json`](/Users/williamcotton/Projects/space-trader/package.json)
- [`src/vite-env.d.ts`](/Users/williamcotton/Projects/space-trader/src/vite-env.d.ts)
- [`src/app/boot.ts`](/Users/williamcotton/Projects/space-trader/src/app/boot.ts)

Expected visible behavior:

- default `npm run dev` still behaves like the current game in Phase 0
- optional helper script can exist without being required yet

Verification:

- normal dev boot still works
- explicit direct-match helper or env boot works if added in this slice
- any explicit runtime-ready marker remains scoped to direct-match gameplay, not generic app boot

##### Slice 0.7: Verify Screenshot and Multiplayer Stability

Goal:

- confirm the refactor did not break the two most fragile dev workflows

Files:

- [`scripts/capture-introduction-screenshots.ts`](/Users/williamcotton/Projects/space-trader/scripts/capture-introduction-screenshots.ts) only if adjustment is needed
- [`src/network/client.ts`](/Users/williamcotton/Projects/space-trader/src/network/client.ts) only if lazy runtime changes expose any integration issues

Expected visible behavior:

- no player-facing change

Verification:

- screenshot capture still runs
- screenshot capture can wait on the explicit runtime-ready signal if it has been added by this point
- current multiplayer flow from the in-match bar still works

##### Phase 0 Exit Criteria

We should not start Phase 1 until all of the following are true:

- gameplay behavior is visually and functionally unchanged
- runtime is lazy-created
- `MatchScreen` exists as its own screen component
- an app controller exists above gameplay
- screenshot capture still works
- current multiplayer still works from the existing gameplay shell
- the codebase can now add non-gameplay screens without hidden-match side effects

### Phase 1: New Front Door UX

#### [`src/App.tsx`](/Users/williamcotton/Projects/space-trader/src/App.tsx)

Responsibility in this phase:

- become the real screen router/controller

Planned changes:

- route between:
  - `Home`
  - `Play vs AI`
  - `Play Online`
  - `Searching`
  - `Learn to Play`
  - `MatchScreen`
  - `Results`
- flip default boot behavior to `home`
- keep explicit `direct_match` path for dev and screenshots

#### New [`src/screens/HomeScreen.tsx`](/Users/williamcotton/Projects/space-trader/src/screens/HomeScreen.tsx)

Responsibility in this phase:

- implement the front door

Planned contents:

- primary actions:
  - `Play vs AI`
  - `Play Online`
  - `Learn to Play`
- secondary actions:
  - `Settings` or `Profile`
  - `Quit`
- callsign/profile card
- optional reconnect entry

#### New [`src/screens/SinglePlayerSetupScreen.tsx`](/Users/williamcotton/Projects/space-trader/src/screens/SinglePlayerSetupScreen.tsx)

Responsibility in this phase:

- implement the minimal solo setup flow

Planned contents:

- faction picker
- optional simple difficulty choice only if retained
- `Start Skirmish`
- `Back`

#### New [`src/screens/MultiplayerSetupScreen.tsx`](/Users/williamcotton/Projects/space-trader/src/screens/MultiplayerSetupScreen.tsx)

Responsibility in this phase:

- replace the top-of-match multiplayer setup bar as the main pre-match online screen

Planned contents:

- format picker
- faction picker
- connection status
- advanced server URL affordance if needed
- `Find Match`
- `Back`

Implementation note:

- this should reuse `getMultiplayerClient()` and `useMultiplayerSnapshot()`, not replace them

#### New [`src/screens/MultiplayerQueueScreen.tsx`](/Users/williamcotton/Projects/space-trader/src/screens/MultiplayerQueueScreen.tsx)

Responsibility in this phase:

- present the searching/waiting state cleanly

Planned contents:

- format and faction summary
- queue/searching status
- cancel action
- optional tips

#### New [`src/screens/LearnScreen.tsx`](/Users/williamcotton/Projects/space-trader/src/screens/LearnScreen.tsx)

Responsibility in this phase:

- expose intro/tutorial content in shipped UI

Planned contents:

- structured content derived from `docs/introduction.md`
- screenshot-backed tutorial steps
- `Start Practice Match`
- `Back to Menu`

Implementation note:

- keep this static and simple in V1

#### New [`src/screens/ResultsScreen.tsx`](/Users/williamcotton/Projects/space-trader/src/screens/ResultsScreen.tsx)

Responsibility in this phase:

- provide post-match closure and next actions

Planned contents:

- victory/defeat/ended headline
- mode/format summary
- `Play Again` for local if supported
- `Return Home`

#### [`src/screens/MatchScreen.tsx`](/Users/williamcotton/Projects/space-trader/src/screens/MatchScreen.tsx)

Responsibility in this phase:

- remain the gameplay shell
- stop being responsible for pre-match online setup

Planned changes:

- remove `MultiplayerControls` from the primary gameplay layout
- mount the new in-match utility/menu entry point
- otherwise preserve gameplay composition as much as possible

#### [`src/ui/MultiplayerControls.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/MultiplayerControls.tsx)

Responsibility in this phase:

- either be retired or repurposed

Planned options:

- extract its logic/pieces into `MultiplayerSetupScreen`
- or shrink it into a reusable internal form/status block used by that screen

Preferred direction:

- reuse logic, not the current top-bar presentation

#### [`src/ui/GameTopBar.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/GameTopBar.tsx)

Responsibility in this phase:

- stop serving as the place for product-level setup controls in shipped UX

Planned changes:

- remove or hide local setup affordances from the shipped front path
- keep only match-relevant information and any allowed dev-only actions
- host or align with the lightweight in-match menu trigger if this is the chosen location

#### New [`src/ui/InMatchMenu.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/InMatchMenu.tsx)

Responsibility in this phase:

- provide `Resume`, `Return to Menu`, `Quit Match`, and `Disconnect` actions

Planned contents:

- visible menu button
- `Esc` interaction support
- local/network-specific actions

#### [`src/GameCanvas.tsx`](/Users/williamcotton/Projects/space-trader/src/GameCanvas.tsx)

Responsibility in this phase:

- support the in-match menu shortcut without breaking current gameplay shortcuts

Planned changes:

- keep current action-key handling
- reserve `Esc` behavior so it can close targeting first, then interact properly with the in-match menu flow

#### [`src/network/client.ts`](/Users/williamcotton/Projects/space-trader/src/network/client.ts)

Responsibility in this phase:

- continue to own online lifecycle
- provide enough hooks for the app controller to route screens

Planned changes:

- use existing snapshot state to drive `Searching` and `Play Online`
- possibly expose cleaner signals or callbacks for:
  - match start
  - match end
  - disconnect
  - reconnect failure
- avoid turning this into a UI-state router

#### [`src/app/profileStore.ts`](/Users/williamcotton/Projects/space-trader/src/app/profileStore.ts)

Responsibility in this phase:

- become the source of callsign and simple front-door preferences

Planned changes:

- wire callsign display/edit into `Home`
- wire last-used local faction into `Play vs AI`

#### New [`src/app/resultSummary.ts`](/Users/williamcotton/Projects/space-trader/src/app/resultSummary.ts)

Responsibility in this phase:

- derive lightweight product-level result objects from runtime/network outcomes

Planned contents:

- local result derivation
- network quit/disconnect/end summaries

#### [`src/vite-env.d.ts`](/Users/williamcotton/Projects/space-trader/src/vite-env.d.ts)

#### [`src/app/boot.ts`](/Users/williamcotton/Projects/space-trader/src/app/boot.ts)

Responsibility in this phase:

- enforce the actual shipped/default boot flip

Planned changes:

- make `home` the default
- keep `direct_match` explicit

#### [`package.json`](/Users/williamcotton/Projects/space-trader/package.json)

Responsibility in this phase:

- make the dev shortcut ergonomic without changing the intended default

Planned changes:

- keep `dev` as normal front-door flow
- add or finalize `dev:direct-match`

#### [`scripts/capture-introduction-screenshots.ts`](/Users/williamcotton/Projects/space-trader/scripts/capture-introduction-screenshots.ts)

Responsibility in this phase:

- move from “implicit current dev default” to “explicit direct-match mode”

Planned changes:

- update script expectations/instructions
- ensure it runs against explicitly flagged direct-match boot
- prefer waiting on the explicit runtime-ready signal rather than only polling `window.__gameRuntime`
- preserve current screenshot outputs

#### [`electron/preload.ts`](/Users/williamcotton/Projects/space-trader/electron/preload.ts)

Responsibility in this phase:

- support a real `Quit` action if we decide to expose one on `Home`

Planned changes:

- optionally expose a quit API to the renderer

This can remain optional if `Quit` stays out of scope or if `window.close()` is acceptable.

#### [`src/App.css`](/Users/williamcotton/Projects/space-trader/src/App.css)

Responsibility in this phase:

- stop being only the gameplay stylesheet

Planned changes:

- either add clearly separated screen sections
- or begin splitting styles by screen/component as new screens land

Preferred direction:

- avoid cramming all new menu/setup/results styles into one undifferentiated block

### Phase 2+: Follow-Up Files

These do not need to move in the first shipping pass, but they are the likely follow-up surfaces:

- [`server/src/sessionStore.ts`](/Users/williamcotton/Projects/space-trader/server/src/sessionStore.ts)
- [`server/src/matchmaker.ts`](/Users/williamcotton/Projects/space-trader/server/src/matchmaker.ts)
- [`src/network/protocol.ts`](/Users/williamcotton/Projects/space-trader/src/network/protocol.ts)
- [`src/game/model/state.ts`](/Users/williamcotton/Projects/space-trader/src/game/model/state.ts)
- [`src/ui/GameTopBar.tsx`](/Users/williamcotton/Projects/space-trader/src/ui/GameTopBar.tsx)
- any additional settings/profile screens

These would carry:

- full display-name propagation
- richer reconnect/resume
- settings UI
- any deeper post-match or online UX improvements
