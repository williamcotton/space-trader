# Secure Online Hidden Information Refactor

Last updated: April 7, 2026

## Problem Statement

Current online multiplayer is trust-based. The UI hides opponent hands, but the client still receives enough information to reconstruct the full match.

This is not a small UI leak. It is an architecture leak.

The current online path sends every client:

- the match seed
- the runtime profile
- the map id
- all player factions
- the full player order
- the built-in content set ids
- the complete ordered command history on resync

The client then calls `startNetworkMatch(...)` and builds a full local `GameState` from the same seed and content bundle as the server. Because deck construction and command resolution are deterministic, each client can reconstruct:

- every player’s opening hand
- every player’s deck order
- every player’s future draws until shuffled or otherwise changed
- every hidden card in hand after draws, discards, and stack interactions
- all private zones present in `state.zones`

So even though the hand tray renders only the local player’s hand, an inspecting player can still read the opponent hand/deck state from client memory, devtools, or any code that can access the runtime snapshot.

This is acceptable for a prototype, but it is not secure hidden-information networking.

## Current Architecture

The live online model is:

- server creates canonical `GameState`
- server validates and orders `GameCommand`s
- server appends accepted commands to `history`
- server broadcasts accepted command envelopes
- each client replays those commands into its own full local runtime
- reconnect/resync sends `MatchStartPayload + commandHistory`

Key files:

- `src/network/protocol.ts`
- `src/network/client.ts`
- `src/game/runtime.ts`
- `server/src/createMatchState.ts`
- `server/src/matchRoom.ts`
- `server/src/index.ts`

This model is good for determinism and debugging. It is not good for secrecy because deterministic replay requires every client to possess enough information to rebuild the hidden state.

## Security Goal

The security goal is:

- the server owns the canonical full `GameState`
- each client receives only the public state plus that client’s private information
- no client receives enough data to reconstruct another player’s hidden zones

This does not mean the client can prevent all cheating. A malicious client can still automate legal actions or inspect the public board. The goal is narrower and concrete:

- a client must not be able to see another player’s hand
- a client must not know deck order
- a reconnect payload must not reveal hidden zones
- command/event history must not reveal hidden card identities unless those identities became public

## Information Visibility Rules

Recommended first-pass visibility model:

- `battlefield entities`: public
- `bases`: public
- `map resource nodes`: public
- `stack items`: public enough to render and respond once a spell is cast
- `discard`: public
- `exile`: public for now
- `hand`: private to owning player
- `deck`: hidden from all clients except count
- `deck order`: server-only
- `random seed`: server-only in secure online mode
- `mechanic state`: redacted unless public or required for rendering
- `continuous effects`: public if they affect visible board/card objects; otherwise redacted
- `logs`: public logs only, with no hidden card names before reveal

The deck rule is important. Even a player’s own deck order should not be sent to that player unless the game has a deliberate “look at top cards” mechanic.

## Recommended Architecture

Move online play from client-side deterministic replay to server-authoritative redacted state views.

The server keeps using the existing engine:

- full canonical `GameState`
- normal `validateCommand(...)`
- normal `dispatchCommand(...)`
- normal auto-flow draining
- normal command history for server debugging

The client no longer reconstructs the full authoritative state for online matches. Instead, it consumes a player-scoped view:

```ts
type PlayerViewState = {
  matchId: string;
  sequence: number;
  localPlayerId: PlayerId;
  playerOrder: PlayerId[];
  publicState: RedactedGameState;
  privateState: {
    hand: CardInstance[];
  };
};
```

The exact shape should be refined during implementation, but the key property is that opponent private zones never appear in the payload.

For the first pass, prefer full view snapshots over granular patches.

Why:

- simpler to make correct
- easier to test
- fewer edge cases around hidden draws and reveals
- current game state is small enough for turn-based play
- performance is acceptable compared to minimax/bot/rendering concerns

After correctness is proven, optimize to patches if needed.

## Protocol Direction

The current protocol is command replay:

- `match_start`
- `match_command`
- `match_resync`

The secure protocol should add view events:

```ts
type SecureMatchStartPayload = {
  matchId: string;
  format: OnlineMatchFormat;
  playerOrder: PlayerId[];
  localPlayerId: PlayerId;
  factions: Record<PlayerId, Faction>;
  mapId: string;
  runtimeProfileId: string | null;
  builtInSetIds: string[];
  protocolVersion: number;
  view: PlayerViewState;
};

type MatchViewEvent = {
  type: "match_view";
  payload: PlayerViewState;
};

type MatchResyncPayload = {
  matchStart: SecureMatchStartPayload;
  view: PlayerViewState;
};
```

Important protocol changes:

- do not send `seed` to clients in secure online mode
- do not send full command history to clients in secure online mode
- do not send private command/event payloads that reveal hidden card ids
- keep `GameCommand` submission as the intent format
- server responses should include accepted/rejected status and then a fresh player-scoped view

The server may keep internal command history for debugging and replay. It just must not send full hidden-information history to clients.

## Redacted State Shape

There are two plausible implementation strategies.

### Option A: Redacted `GameState`

Create a `redactGameStateForPlayer(state, playerId)` helper that returns a `GameState`-like object with hidden zones replaced.

Example:

```ts
zones: {
  [localPlayerId]: {
    hand: fullHand,
    deck: hiddenCards(deck.length),
    discard: fullDiscard,
    exile: fullExile,
  },
  [opponentId]: {
    hand: hiddenCards(hand.length),
    deck: hiddenCards(deck.length),
    discard: fullDiscard,
    exile: fullExile,
  },
}
```

Pros:

- lowest disruption to renderer and UI code
- existing `GameRuntime` can still render a state-like object
- easy first migration path

Cons:

- placeholder card instances must never be playable
- some engine code may accidentally try to validate against redacted hidden cards
- strong typing may be misleading because redacted `CardInstance` is not a real card

### Option B: Explicit `GameViewState`

Create a new view model that is not pretending to be authoritative `GameState`.

Pros:

- clearer separation between simulation and presentation
- fewer accidental rule-engine calls on redacted data
- better long-term architecture

Cons:

- larger UI/render refactor
- more adapters needed for HUD, hand tray, top bar, command stack, overlays

Recommendation:

- Phase 1 should use Option A only if we need speed.
- The better final direction is Option B.
- A pragmatic path is to introduce `GameViewState` but initially make it structurally close to `GameState` so rendering can migrate gradually.

## Runtime Direction

Current `GameRuntime` is an authoritative local simulation runtime. In secure online mode, that is the wrong abstraction.

The target split:

- `GameRuntime`: local authoritative simulation runtime
- `OnlineGameViewRuntime`: online redacted-view renderer/input runtime

The online runtime should:

- store the latest `PlayerViewState`
- render public board state
- render local private hand only
- submit input intents to the server
- not run reducers for online commands
- not run local auto-flow
- not run bots
- not create initial state from seed
- not hold opponent private zones

For a lower-risk migration, this can start inside `GameRuntime` as a distinct online-view mode, but the code should avoid deepening the current “runtime is both authority and view” coupling.

## Command Submission With Redacted Clients

Clients can still submit `GameCommand`s, but some commands currently reference `cardInstanceId`.

That is acceptable for local-player cards:

- local player knows their own hand instance ids
- local player sends `PLAY_CARD` with their own card instance id
- server validates it against canonical hand state

For opponent cards:

- client should never receive opponent hand card instance ids
- client cannot submit commands against unknown hidden opponent cards
- stack interaction targets public stack item ids, not hidden hand ids

Potential issue:

- if hidden placeholder ids are exposed for opponent hand counts, a malicious client might try to submit those ids

Mitigation:

- do not expose stable hidden card ids for opponent hands/decks
- use view-only placeholders like `{ kind: "hidden_card", ownerId, zone, index }`
- server rejects any command that references a card instance not actually owned by the submitting player or not in a legal public zone

## Server View Builder

Add a server-side view builder:

```ts
function createPlayerView(state: GameState, playerId: PlayerId, sequence: number): PlayerViewState
```

It should:

- deep-clone only the data needed by the client
- include full local hand
- include public discard/exile
- include hand/deck counts for other players
- include public entities and map state
- include public stack data
- redact private mechanic buckets
- preserve enough ids for public actions and animations
- avoid exposing canonical deck order

This helper should live in shared code if the client needs its types, but execution should be server-only for online matches.

Suggested location:

- `src/game/network/redaction.ts` for shared types/helper if kept pure
- or `server/src/redaction.ts` if it should remain explicitly server-owned

Recommendation:

- put pure redaction helpers under `src/game/network/redaction.ts`
- keep server-only transport wiring under `server/src`
- add tests next to the redaction helper

## Match Room Flow After Refactor

Secure match start:

1. Matchmaker creates canonical server state.
2. Room stores canonical full state.
3. For each player, room sends `secure_match_start` or `match_start` with a player-specific view.
4. Client creates an online view runtime from the redacted view.

Secure command:

1. Client submits `GameCommand` intent.
2. Server checks session token and player id.
3. Server validates against canonical full state.
4. Server dispatches command on canonical full state.
5. Server drains auto-flow.
6. Server increments sequence.
7. For each player, server sends a fresh `match_view` generated for that player.
8. Client replaces its view state.

Secure resync:

1. Client calls `/api/match/resync`.
2. Server sends only that player’s latest view.
3. Server does not send full command history.
4. Client replaces its view state with the latest authoritative view.

## Reveal Semantics

Some hidden information becomes public during normal play.

Rules:

- a card in hand is hidden until played, discarded by a public discard effect, or revealed by a card effect
- a card on stack is public
- a unit card being cast should become public when it is put on the stack
- a tactic card being cast should become public when it is put on the stack
- discarded cards are public unless we add a future hidden-discard mechanic
- exiled cards are public unless we add a future face-down exile mechanic
- deck cards remain hidden unless a card explicitly reveals them

The redaction layer should encode this through zone semantics, not one-off card ids.

## Logs And Animation Events

Logs can leak hidden information too.

Audit log strings for:

- draw messages that name the drawn card
- discard messages that name a hidden discarded card before public reveal
- counter/resolve messages that are fine because stack items are public
- bot or debug logs that mention hidden hand contents

Recommendation:

- keep canonical server logs full if useful
- send client logs through the redaction view
- add a public log formatter that only names public cards

Animation events also need the same treatment. If an animation payload contains a hidden source card id, that payload must be redacted or delayed until reveal.

## Testing Strategy

Add tests at three levels.

Redaction unit tests:

- local player sees their own hand card ids
- local player does not see opponent hand card ids
- no player sees deck card ids or deck order
- discard/exile are public
- stack items are public
- `mechanicState` does not leak hidden card ids

Server match tests:

- `match_start` payloads differ per player
- player 1 payload does not contain player 2 hand ids
- player 2 payload does not contain player 1 hand ids
- resync payload does not contain command history or deck order
- playing a card reveals it on stack to all players
- drawing a card updates only the drawing player’s private hand view and public hand count for everyone else

Client/runtime tests:

- online view runtime renders local hand
- online view runtime cannot inspect opponent hand
- client command submission still works with local hand card ids
- reconnect replaces view without replaying full history
- existing local/offline simulation is unchanged

## Migration Plan

### Phase 0. Visibility Contract

Goal:

- define exactly which zones and fields are public/private

Work:

- add this contract to the doc and tests
- decide whether discard/exile are public in all current modes
- identify mechanic-state buckets that can leak card ids
- classify stack item fields as public or private

Deliverable:

- redaction acceptance tests written against sample states

### Phase 1. Redaction Helper

Goal:

- create the first player-scoped view without changing transport

Work:

- add `PlayerViewState` / redacted zone types
- implement `createPlayerView(state, playerId, sequence)`
- test all zone redaction rules
- ensure hidden placeholders have no real card ids or stable instance ids

Deliverable:

- server can produce safe player-specific views from a full canonical `GameState`

### Phase 2. Server View Events

Goal:

- make the server capable of sending views in addition to command replay

Work:

- add `match_view` event type
- add secure `match_start` payload shape or extend current payload with `view`
- send per-player view after match start
- send per-player view after accepted commands and auto-flow
- add `/api/match/resync` path that sends view-only resync

Deliverable:

- server tests prove match/resync payloads are player-specific and redacted

### Phase 3. Client Online View Mode

Goal:

- let the client render server views without reconstructing canonical hidden state

Work:

- add online view state storage in runtime or a new online view runtime
- stop secure online `startNetworkMatch` from building full state from seed
- render board/top bar/hand/stack from `PlayerViewState`
- submit commands as intents exactly as today
- remove dependence on command-history replay for online resync

Deliverable:

- online clients can play from redacted snapshots

### Phase 4. Remove Seed And History From Client Payloads

Goal:

- close the actual leak

Work:

- stop sending `seed` to clients in secure mode
- stop sending full command history to clients in secure resync
- stop sending deck order anywhere in online payloads
- audit `MatchStartPayload`, `MatchResyncPayload`, and all SSE events
- bump `MULTIPLAYER_PROTOCOL_VERSION`

Deliverable:

- a network payload capture does not contain opponent hand ids or deck order

### Phase 5. Reveal/Log/Animation Audit

Goal:

- prevent secondary leaks outside zones

Work:

- audit match logs
- audit animation payloads
- audit rejection reasons
- audit debug output exposed to clients
- add public formatting for hidden-sensitive messages

Deliverable:

- tests prove hidden card names do not appear in public logs/events before reveal

### Phase 6. Remove Trust-Based Online Mode Or Gate It

Goal:

- avoid maintaining two subtly different online architectures unless there is a deliberate reason

Options:

- replace trust-based online entirely
- keep trust-based deterministic replay behind a dev-only flag

Recommendation:

- replace it for normal online play
- keep any replay tooling server-side or test-only

Deliverable:

- normal online formats use secure view networking by default

## Compatibility With Existing Online Formats

This refactor should apply to all online formats:

- `pvp_1v1`
- `ffa_3p`
- `ffa_4p`

Do not solve this only for 1v1. The player-scoped view builder should accept any `playerOrder` length.

## What This Does Not Solve

This refactor does not solve:

- clients using bots or scripts to choose legal actions
- collusion between players
- stream sniping
- denial-of-service against the local server
- server authentication/accounts
- authoritative anti-tamper beyond command validation
- secure spectators or judges

It only closes hidden-information leaks caused by sending deterministic setup and full replay data to every client.

## Acceptance Criteria

The refactor is successful when:

- no online match-start payload includes deck order
- no online match-start payload includes opponent hand card ids
- no online resync payload includes full command history
- clients do not receive the match seed in secure online mode
- each player receives their own hand and only opponent hand counts
- each player receives deck counts but not deck order
- public zones remain visible to all players
- stack cards become public when played
- reconnect restores the correct redacted view
- `pvp_1v1`, `ffa_3p`, and `ffa_4p` still work
- local/offline deterministic runtime behavior is unchanged

## Bottom Line

The current online model is deterministic and practical, but it cannot protect hidden information because every client can reconstruct the full state.

The secure direction is to keep the server authoritative over full state and move clients to player-scoped redacted views. Start with full view snapshots for correctness, then optimize to patches only if payload size becomes a real problem.
