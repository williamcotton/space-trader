# Networked Multiplayer Feature

Last updated: April 2, 2026

## Goal

Add online 1v1 multiplayer to the current desktop game by introducing a Node.js server in `/server` and keeping the existing deterministic simulation model as the core synchronization strategy.

The right model for this codebase is not state replication at render rate. It is:

- one authoritative ordered command stream per match
- one authoritative server-side mirror of `GameState`
- deterministic replay of that same command stream on both clients

This matches the current architecture well. `architecture.md` already treats the simulation as deterministic, command-driven, and separate from rendering.

## Current Codebase Facts

These points come from the current implementation and materially affect the multiplayer design:

- The game already has a clean `GameCommand -> validateCommand -> dispatchCommand -> events -> state` pipeline in `src/game/actions/commands.ts` and `src/game/actions/reducers.ts`.
- The runtime already keeps one authoritative mutable `GameState` in `src/game/runtime.ts`.
- `createInitialGameState(...)` in `src/game/model/state.ts` already supports `randomSource`, so seeded match initialization is supported by the engine.
- The live runtime does not currently use seeded RNG. `src/game/runtime.ts` creates matches with `Math.random()` for both `matchId` decoration and deck shuffle initialization.
- `scripts/frontier-balance.ts` already has a deterministic seeded RNG helper (`createSeededRandom`), which should be promoted into shared gameplay code instead of living only in the simulator.
- Content loading is registry-driven through `src/game/content/loader.ts`, so server and clients must load the exact same set selection before simulating a match.
- The runtime currently auto-dispatches non-player actions locally through `getAutoFlowCommand(...)`, priority-stop yielding, and bot automation inside `src/game/runtime.ts`. That behavior cannot remain client-authoritative in a networked match.
- The bot currently exists in the runtime and worker path, but for online matches the server should be the only authority that drives bots or auto-flow.

## Recommended Architecture

Use a server-authoritative command relay with deterministic replay.

That means:

- clients send player intent as `GameCommand`
- server validates command legality against its own mirror state
- server appends accepted commands to ordered match history
- server broadcasts accepted commands with a sequence number
- clients apply only server-approved commands to their local runtime

This is slightly stricter than a pure dumb relay, and that is the correct choice for this repo. A pure relay becomes fragile because the current runtime also produces automatic commands locally:

- auto-flow phase advancement
- forced pass windows
- bot decisions

If each client is allowed to generate those on its own, drift is likely. The server should be the single producer of authoritative automatic commands.

## Why This Fits The Existing Engine

The engine is already close to what multiplayer needs:

- command types are serializable and already small
- validation is centralized
- state mutation is centralized
- rendering is downstream from simulation
- initial match construction is parameterized by map, factions, rules, and RNG source

The main missing piece is not simulation. It is authority routing:

- local UI intent must be separated from local execution
- the server must own command ordering
- the server must own automatic command generation in online matches

## Proposed Repository Layout

Keep the repo flat and add a server folder:

```text
/space-trader
  /src
    /game
    /ui
  /server
    package.json
    tsconfig.json
    /src
      index.ts
      protocol.ts
      matchmaker.ts
      matchRoom.ts
      createMatchState.ts
      seed.ts
      roomStore.ts
      reconnect.ts
```

The server should import shared engine code directly from `../src/game/...`.

That gives the server access to:

- `GameCommand`
- `createInitialGameState`
- `dispatchCommand`
- `validateCommand`
- `getAutoFlowCommand`
- content loading functions

For the MVP, that is better than a workspace split. A workspace refactor can happen later if the repo grows.

## Recommended Transport

Use Socket.IO for the MVP.

Reason:

- room support is built in
- reconnect behavior is easier
- ordered event streams and acknowledgements are convenient
- the game is not latency-critical enough to justify starting with lower-level `ws`

Plain `ws` is still viable later if transport simplicity or dependency weight becomes a concern. It is not the best first step.

## Matchmaking Model

The first version should support a simple public queue:

- client connects
- client selects faction
- client sends `QUEUE_JOIN`
- server places socket in a waiting queue
- once two compatible players are present, server creates a match room
- server assigns `player_1` and `player_2`
- server generates the shared seed and match parameters
- server sends `MATCH_START` to both players

The server should own:

- `matchId`
- player assignment
- RNG seed
- chosen map
- runtime profile
- allowed content set IDs

For MVP, keep deck construction fixed to existing starter decks derived from faction selection.

## Match Start Payload

The match start payload should include more than Gemini's original sketch:

```ts
type MatchStartPayload = {
  matchId: string;
  seed: number;
  localPlayerId: "player_1" | "player_2";
  factions: {
    player_1: Faction;
    player_2: Faction;
  };
  mapId: string;
  runtimeProfileId: string | null;
  builtInSetIds: string[];
  protocolVersion: number;
};
```

Why include these fields:

- `seed`: deterministic deck order and any future random effects
- `mapId`: clients must build the same initial state
- `runtimeProfileId`: rules and default map behavior stay aligned
- `builtInSetIds`: content installers and mechanic registries must match exactly
- `protocolVersion`: clean failure if client and server are out of sync

For the MVP, I would explicitly forbid `extraSets` in online matches. They are useful for local dev, but they complicate trust, content parity, and reconnect.

## Server Responsibilities

Each active match room should own:

- sockets for both players
- authoritative mirror `GameState`
- ordered command history
- sequence counter
- disconnect/reconnect bookkeeping
- match metadata

The server should not just relay commands. It should:

1. Verify the socket is allowed to act for the claimed `playerId`.
2. Validate the command against the current authoritative state.
3. Apply it to the authoritative state.
4. Broadcast the accepted command plus sequence number.
5. Generate any resulting automatic commands until the next real player decision point.

That last step is important. The current engine already has command-producing automation. In online play, the server should be the only place that runs:

- `getAutoFlowCommand(...)`
- bot turns, if a human-vs-bot mode is later supported online
- any future forced timeout command

## Command Flow

The online command lifecycle should be:

1. Local player clicks or taps a game action.
2. UI builds a normal `GameCommand`.
3. Client sends it to server as intent.
4. Client does not execute it locally yet.
5. Server validates and applies it to the authoritative state.
6. Server emits `MATCH_COMMAND` with:
   - `matchId`
   - `sequence`
   - `command`
7. Both clients apply that exact command to their local runtime.
8. If the server also generates automatic follow-up commands, it emits those in the same ordered stream.

This gives one canonical order for:

- pass-priority windows
- end-phase actions
- tactical clicks
- stack responses
- auto-flow transitions

## Protocol Sketch

Client to server:

- `QUEUE_JOIN`
- `QUEUE_LEAVE`
- `GAME_COMMAND`
- `MATCH_READY`
- `RECONNECT_MATCH`
- `RESYNC_REQUEST`

Server to client:

- `QUEUE_STATUS`
- `MATCH_FOUND`
- `MATCH_START`
- `MATCH_COMMAND`
- `MATCH_REJECTED`
- `PLAYER_DISCONNECTED`
- `MATCH_RESYNC`
- `MATCH_ENDED`

Suggested authoritative command packet:

```ts
type MatchCommandEnvelope = {
  matchId: string;
  sequence: number;
  command: GameCommand;
};
```

`sequence` matters even if Socket.IO preserves order in practice. It gives:

- duplicate suppression
- missed-packet detection
- deterministic resync boundaries

## Runtime Changes Required

`src/game/runtime.ts` currently assumes that UI intent and state mutation happen in the same place. Multiplayer needs those concerns split.

Recommended runtime API split:

- `submitLocalIntent(command: GameCommand): void`
- `applyAuthoritativeCommand(command: GameCommand): DispatchResult`

Behavior:

- offline mode: `submitLocalIntent(...)` can directly call `applyAuthoritativeCommand(...)`
- online mode: `submitLocalIntent(...)` sends to the network adapter and does not mutate state immediately
- network adapter calls `applyAuthoritativeCommand(...)` only for server-approved commands

In online mode, the runtime should also disable or bypass local authoritative automation:

- no local `getAutoFlowCommand(...)` dispatch
- no local bot autoplay
- no local priority-stop forced pass generation

Those become server-owned for the duration of the online match.

## Determinism Work Required Before Multiplayer

This is the most important codebase-specific prerequisite.

The architecture document claims deterministic simulation, and the engine mostly supports it, but the live runtime currently initializes new matches with `Math.random()`.

That must be fixed for multiplayer.

Recommended change:

- extract `createSeededRandom(seed)` from `scripts/frontier-balance.ts` into shared gameplay code, for example `src/game/random/seeded.ts`
- update runtime match creation to accept a seed when running a networked match
- use the same seeded RNG on server and both clients

The server should create the seed once and send it in `MATCH_START`.

Also worth doing:

- audit reducers, instructions, and mechanics for any use of ambient randomness
- keep random effects driven only by shared seeded sources

## Content Loading Requirements

Because content is installed through registries, server and client content parity is mandatory.

Required rule:

- both sides must load the same built-in set IDs before creating or replaying match state

For MVP:

- allow only built-in content in networked matches
- send `builtInSetIds` in `MATCH_START`
- load those sets on the server before creating match state
- load those sets on the client before constructing the runtime

This is also why a validating authoritative server is safer than a dumb relay. If the server does not load the same mechanics, it cannot safely validate or simulate anything.

## Reconnection Strategy

The good news is that this engine is replay-friendly.

Recommended MVP reconnect strategy:

- server stores the original `MATCH_START` payload
- server stores ordered command history
- reconnecting client receives:
  - `MATCH_START`
  - authoritative history through latest `sequence`
- client recreates the initial runtime
- client replays all authoritative commands locally without animation
- client resumes at the live state

This is acceptable for an MVP.

If command history becomes too large later, add periodic snapshots:

- every N commands
- or once per turn
- or after large stack resolutions

Then reconnect becomes snapshot + tail replay instead of full replay.

## Auto-Flow And Priority Windows

This is the biggest hidden complexity in this codebase.

Today, `src/game/runtime.ts` schedules automation from local state and can immediately emit:

- auto-flow commands
- priority-stop pass commands
- bot commands

That is fine offline. It is wrong for online matches if both clients can do it.

Recommendation:

- server runs the authoritative auto-flow loop after every accepted command
- server keeps applying automatic commands until:
  - a player decision is required
  - the match ends
- server emits every automatic command into the same authoritative sequence stream

That keeps the stack, phase changes, and pass windows aligned without client races.

## Bots In Online Matches

If online play later includes human-vs-bot or bot-vs-bot matches, bots should run server-side only.

Reason:

- clients must not be trusted to choose bot actions
- current bot execution is tied to runtime-side automation and a renderer worker
- online authority belongs on the server, not in Electron

The client can still render bot thinking and animations, but the decision itself should come from the server.

## Cheat Prevention

Minimal cheat prevention for MVP:

- bind each socket to one `playerId`
- reject any command whose `playerId` does not match the bound socket
- run shared `validateCommand(...)` on the authoritative server state
- reject commands for stale or ended matches
- ignore client attempts to send automatic commands if the server intends to own those flows

Do not trust:

- client-declared legality
- client-declared active player
- client-declared content selection
- client-declared match seed

## UI Flow

The app needs a top-level multiplayer flow above the current game view:

- Main Menu
- Faction Select
- Matchmaking Queue
- Match Found / Ready
- Live Match
- Disconnected / Reconnecting
- Match End

For MVP, the minimum useful UI is:

- choose faction
- click "Find Match"
- show queue status
- start the game on `MATCH_START`
- show reconnect banner if socket drops

## Proposed Server Files

### `server/src/index.ts`

- boot Express or bare HTTP server
- attach Socket.IO
- create queue and room store
- register connection handlers

### `server/src/protocol.ts`

- event names
- payload types
- protocol version constant

### `server/src/matchmaker.ts`

- queue join/leave
- pair compatible players
- create room instances

### `server/src/matchRoom.ts`

- own authoritative `GameState`
- receive `GAME_COMMAND`
- validate and dispatch
- emit authoritative command envelopes
- run auto-flow loop
- track history and disconnect state

### `server/src/createMatchState.ts`

- load content sets
- create seeded random source
- call `createInitialGameState(...)`
- return authoritative starting state

### `server/src/reconnect.ts`

- rebuild reconnect payloads
- optionally manage grace periods and forfeits

## Recommended Implementation Phases

### Phase 0: Determinism Cleanup

- move seeded RNG helper into shared code
- make runtime initialization seed-driven when requested
- add tests proving same seed + same command stream => same state

### Phase 1: Server Skeleton

- create `/server`
- add Socket.IO server
- add queue and room scaffolding
- add protocol types

### Phase 2: Authoritative Match Room

- create authoritative server mirror state
- wire `GAME_COMMAND` validation and broadcast
- assign seed, map, factions, runtime profile

### Phase 3: Client Runtime Network Adapter

- split local intent from authoritative apply
- disable local authoritative automation in online mode
- add queue/start/resync client flow

### Phase 4: Reconnect And Resync

- store match history
- support reconnect by replay
- add sequence tracking and drift handling

### Phase 5: Polish

- turn timers
- rematch flow
- friend invites or private rooms
- matchmaking rating
- spectator mode

## Risks And Gotchas

- Current runtime creation still uses `Math.random()`. This is the first thing to fix.
- Content mismatches will cause simulation drift even if command streams match.
- Local debug actions should be hidden or disabled in networked matches.
- Reconnect will only be safe if the server owns authoritative match parameters and history.
- Priority passing may feel latency-sensitive; the first version should optimize correctness before responsiveness tricks.
- A pure relay without server-side state will make later features harder:
  - reconnection
  - anti-cheat
  - timers
  - bots
  - server-owned auto-flow

## Recommendation

Build this as a server-authoritative command-replay system in `/server`, not as peer-to-peer sync and not as a dumb command echo service.

The codebase is already close to supporting it. The main work is:

- move RNG to deterministic shared seed handling
- separate local intent from local execution in `GameRuntime`
- let the server own ordering, validation, auto-flow, and reconnect history

That path preserves the current engine architecture instead of fighting it.
