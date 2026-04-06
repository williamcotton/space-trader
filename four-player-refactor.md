# Four-Player FFA Refactor

Last updated: April 6, 2026

## Goal

Add a real `4-player free-for-all` mode to the current game without breaking the existing 1v1 game.

This is not a small feature toggle. The current codebase is structurally 2-player at the type, rules, content, UI, AI, and server levels. A successful 4-player FFA implementation needs a staged refactor, not scattered one-off changes.

## Recommendation

Treat this as a multi-phase program:

1. Land an `attack-refactor` first so attacks use explicit target selection instead of the current shortcut flow.
2. Refactor the engine to support a dynamic player list and 4-player local matches.
3. Make the game actually playable as local 4-player FFA.
4. Reintroduce bots for 4-player.
5. Only then generalize online multiplayer to 4 seats.

Do not start with networked 4-player FFA first.

## Research Summary

Current hard 2-player assumptions were found in at least `61` files under `src/` and `server/`.

The most important structural hotspots are:

- `src/game/model/ids.ts`
  - `PlayerId` is a union of `"player_1" | "player_2"`.
- `src/game/model/state.ts`
  - `players`, `zones`, and `map.spawnPoints` are `Record<PlayerId, ...>`.
  - initial state creation hardcodes:
    - `base_player_1`
    - `base_player_2`
    - one scout + one harvester for each of the two players
  - `syncPlayerZoneCounts(...)` manually updates only two players.
- `src/game/turn/stack.ts`
  - `getOpponentPlayer(...)` assumes there is exactly one opponent.
- `src/game/turn/phaseMachine.ts`
  - turn order is `player_1 -> player_2 -> player_1`.
- `src/game/actions/handlers/phase.ts`
  - priority passing is based on exactly two consecutive passes.
- `src/game/systems/victory.ts`
  - victory checks only `player_1` and `player_2`.
- `src/game/content/sets/alpha/cards.ts`
  - multiple cards use single-opponent helpers like `getOpponentBaseEntityId(...)`.
- `src/game/content/sets/foundation/stackEffects.ts`
  - stack effects also assume a single opponent base.
- `src/game/ai/*`
  - both bots and AI scoring use `getOpponentPlayer(...)` heavily and target one enemy base.
- `src/ui/GameTopBar.tsx`
  - UI explicitly maps over `["player_1", "player_2"]`.
- `src/game/presentation.ts`
  - player labels and active themes only support two seats.
- `src/network/protocol.ts`
  - match start payload, local player assignment, and factions are all 2-player shaped.
- `server/src/matchmaker.ts`
  - queue creates exactly 2-player rooms.
- `server/src/createMatchState.ts`
  - match bootstrap only accepts `{ player_1, player_2 }`.
- `server/src/matchRoom.ts`
  - room logic, token assignment, disconnect handling, and fanout are all 2-player specific.

## Phase 0 Design Lock

These rules are now treated as locked unless explicitly revised later.

- Mode: `4-player free-for-all`
- Formal alliances: `none`
- Duplicate factions: `allowed`
- First playable milestone: `offline/local only`
- Bots in first playable milestone: `none`

- Turn order:
  - seat order is fixed for the entire match
  - starting seat is random each match
  - the current starting-player disadvantage should follow the randomly selected starting seat rather than a hardcoded player id
- Priority model:
  - full MTG-style around-the-table priority
  - spells, abilities, and empty-stack phase advancement all require passes from every non-eliminated player in succession
- Win condition:
  - `last surviving player wins`
  - ties are allowed when appropriate
- Elimination:
  - when a player's base reaches `0`, that player is eliminated immediately
- Elimination cleanup:
  - the player's base is removed immediately
  - their units are removed
  - their stack objects are removed immediately
  - their continuous effects are removed immediately
  - their node control is removed immediately
  - their hand / deck / discard / exile effectively leave the live match
- Targeting:
  - `enemy` means any non-self live player or entity they control
  - `opponent` means any other live player
  - `enemy base` semantics need a separate content/targeting pass
- Attack UX:
  - a separate `attack-refactor.md` should be created
  - attack target selection should become explicit rather than relying on the current shortcut behavior
  - this should be treated as a likely prerequisite to the 4-player content/targeting pass
- Map direction:
  - 4-player FFA should use a symmetric four-corner map
  - economy should keep a central contested resource cluster
  - each player should also have a nearby safer primary-resource node
  - 3-player support is not the goal of this document, but if added later it should use a symmetric triangle layout
- Open balancing question:
  - target FFA match length is not locked yet and should be tuned after the first playable version exists

## What Already Generalizes Reasonably Well

Not everything is broken by multiplayer.

- Most entity ownership checks are already `target.ownerId !== sourcePlayerId`.
- Hex grid and coordinate math are not inherently 2-player.
- Command-driven simulation is the right base architecture.
- Deterministic match creation is a good foundation for larger matches.
- Registry-driven content is a good fit for incremental mechanic cleanup.

The main problem is not the rendering model or the content registry model. It is the assumption that every game decision can be modeled as:

- active player
- the other player

That assumption is everywhere.

## Main Refactor Workstreams

### 1. Core Player Model

The current player model must move from compile-time pair semantics to runtime seat semantics.

Required changes:

- Replace `PlayerId = "player_1" | "player_2"` with a dynamic player id type.
- Add ordered player seating to state, for example:
  - `playerOrder: PlayerId[]`
  - `eliminatedPlayerIds: PlayerId[]`
- Replace fixed `Record<PlayerId, ...>` assumptions with dynamic keyed collections where needed.
- Update `MapState.spawnPoints` so maps can define 4 seats.
- Generalize:
  - player names
  - faction assignment
  - base entity ids
  - zone counts
  - starting resources
  - starting unit deployment

This is the foundational step. Without it, everything else stays brittle.

### 2. Turn Order And Priority Engine

This is the hardest gameplay-system rewrite.

Current model:

- one active player
- one other player
- two consecutive passes close priority

4-player FFA needs:

- active player chosen from `playerOrder`, skipping eliminated players
- priority rotation through every non-eliminated player in seating order
- pass tracking across more than two players
- different resolution rules depending on whether the stack is empty

Recommended rules behavior:

- If the stack is non-empty:
  - resolve the top item only after all live players pass in succession
- If the stack is empty:
  - advance the phase only after all live players pass in succession
- After a stack item resolves:
  - priority returns to the active player

Impacted files include:

- `src/game/turn/stack.ts`
- `src/game/turn/phaseMachine.ts`
- `src/game/actions/handlers/phase.ts`
- `src/game/turn/autoFlow.ts`
- `src/game/turn/priorityStops.ts`

### 3. Victory, Elimination, And Cleanup

4-player FFA needs elimination, not just binary win detection.

Current model:

- if one base dies, the other player wins

4-player FFA needs:

- detect which players are eliminated
- remove them from turn and priority rotation
- decide what happens to their board state
- declare winner only when one live player remains

This is not just `victory.ts`. It affects:

- stack cleanup
- temporary effects
- node control
- targeting legality
- UI presence
- bots

### 4. Content And Card Text Audit

This is larger than it first appears.

Many cards and helpers assume a single opponent:

- direct enemy-base damage
- triggers that hit "the enemy base"
- AI scoring that values one enemy base
- stack effects that auto-pick the opposing base

Examples:

- `src/game/content/sets/alpha/cards.ts`
- `src/game/content/sets/foundation/stackEffects.ts`
- `src/game/content/sets/foundation/installers/runtime.ts`
- `src/game/content/sets/foundation/ai/spellScoring.ts`
- `src/game/content/sets/alpha/ai/spellScoring.ts`

Needed changes:

- rewrite single-opponent helpers to support:
  - explicit target selection
  - "all enemies"
  - "each opponent"
  - "target enemy base"
- audit text so card wording matches actual 4-player semantics
- re-evaluate cards that are too strong or too weak in FFA

Some 1v1 cards will need redesign in FFA rather than direct translation.

This work should assume the attack-targeting refactor exists or lands first. Otherwise, "choose which enemy to attack" and "choose which enemy base to affect" will stay awkward across rules, UI, and AI.

### 5. Map And Match Bootstrap

The current live map is a 2-base map and cannot just be stretched into FFA.

4-player FFA needs:

- new map definitions with 4 spawn points
- symmetric four-corner seat layouts
- spawn layouts that do not create immediate kingmaking
- central contested economy
- one nearby safer primary-resource node per player
- node placement balanced for 4 players
- starting-unit offsets that are defined per seat orientation

The current state bootstrap hardcodes adjacent spawn offsets for exactly two starting units per side. That logic must be generalized and made map-aware.

### 6. Runtime, Input, And UI

The runtime and UI have many direct 2-player assumptions.

Affected areas:

- board click routing
- local player identity
- top bar player summaries
- hand tray visibility and labels
- command stack / priority messaging
- player themes and colors
- victory banners
- debug controls

Examples:

- `src/game/runtime.ts`
- `src/ui/GameTopBar.tsx`
- `src/ui/HandTray.tsx`
- `src/ui/CommandStackPanel.tsx`
- `src/game/presentation.ts`

The UI challenge is not only correctness. It is readability. Four players on one screen is a layout problem.

### 7. Rendering And Presentation

The renderer is not as deeply 2-player as the rules, but presentation is.

Required work:

- support 4 distinct seat themes
- handle duplicate factions across multiple seats cleanly
- update board overlays and attack indicators to stay readable with more occupied space
- update animation palette selection where it assumes only two player themes

### 8. Bots

Both bot systems currently assume:

- one opponent
- one enemy base
- one opposing resource engine

That affects:

- tactical movement
- attack targeting
- spell scoring
- search evaluation
- threat assessment

Files impacted include:

- `src/game/ai/mvpBot/*`
- `src/game/ai/minimax/*`

Recommendation:

- do not block the core refactor on 4-player bots
- first ship `4-player local human-only`
- then add bots back as a separate phase

### 9. Multiplayer Server

The current server is a 2-seat room server, not a general match host.

Required work:

- queueing for 4 seats instead of 2
- 4-player faction assignment
- match start payload generalized to an arbitrary player list
- per-player reconnect / resync for 4 seats
- match room fanout to 4 clients
- disconnect / abandon handling for partial lobbies and live 4-player matches

Current protocol and room model are too narrow:

- `src/network/protocol.ts`
- `server/src/matchmaker.ts`
- `server/src/createMatchState.ts`
- `server/src/matchRoom.ts`

### 10. Hidden Information In Online Matches

This is a critical architecture issue.

Today, online matches are deterministic replay with enough data for clients to reconstruct all hidden zones. That is already insecure in 1v1, and it becomes worse in 4-player FFA.

If serious 4-player online play is a real goal, the current trust model is not enough.

Release-grade 4-player online would require:

- server-authoritative hidden zones
- per-player private state views
- redacted public match state
- reconnect using private resync payloads, not full deterministic hidden-state reconstruction

This is separate from the 4-player engine refactor, but the two become coupled once online FFA matters.

## Phased Implementation Plan

## Phase -1. Attack Refactor Prerequisite

Before 4-player content and UI work, add a separate targeted refactor for attack declaration.

Goal:

- make attacks use explicit target choice instead of the current shortcut-oriented attack flow

Why it should happen first:

- 4-player FFA multiplies valid attack targets
- explicit target choice is cleaner for rules, UI, AI, and content wording
- this also helps future enemy-base targeting cleanup

Deliverable:

- separate `attack-refactor.md`
- explicit attack target selection in local 1v1 without regressions

## Phase 0. Design Lock

Locked decisions:

- immediate elimination when a base hits `0`
- ties are allowed
- all live match state owned by an eliminated player disappears immediately
- stack objects from eliminated players are removed immediately
- no formal alliances
- duplicate factions are allowed
- fixed seat order, random starting seat
- full around-the-table MTG-style priority
- first target is offline/local only
- first playable version is human-only
- 4-player maps should be symmetric four-corner maps with central contest plus nearby safe primary nodes

Still intentionally open:

- exact 4-player starting-resource numbers beyond "the starting player carries the current disadvantage"
- target match length and pacing numbers
- whether any FFA-only card bans / nerfs are needed after playtesting

Deliverable:

- approved gameplay spec with only pacing/balance values left open

## Phase 1. Dynamic Player Kernel

Goal:

- remove the engine's hard dependency on exactly two player ids

Work:

- refactor `PlayerId`
- generalize `GameState.players`, `zones`, `spawnPoints`
- add `playerOrder`
- add elimination tracking
- generalize state creation and zone count syncing

Do not change gameplay behavior yet beyond keeping 1v1 working on the new structures.

Deliverable:

- 1v1 still works on a dynamic-player core

## Phase 2. Turn / Priority / Victory Rewrite

Goal:

- make the engine capable of multi-seat turn order and stack flow

Work:

- replace `getOpponentPlayer(...)`
- replace two-pass priority logic
- add seat-order traversal helpers
- support elimination-aware phase advancement
- rewrite victory resolution to "last surviving player"

Deliverable:

- local simulation can advance correctly with 3 or 4 players in tests

## Phase 3. Match Bootstrap And Maps

Goal:

- actually start 4-player matches

Work:

- add 4-player map definitions
- add 4-player seat-order metadata if needed by bootstrap and presentation
- generalize base and starting-unit placement
- make the starting-player disadvantage follow the randomly chosen starting seat instead of a hardcoded `player_1`
- add runtime profile / map support for 4-player setups
- update content/bootstrap helpers accordingly

Deliverable:

- a local 4-player match can initialize deterministically

## Phase 4. Targeting And Content Audit

Goal:

- make cards and stack effects correct in FFA

Work:

- remove implicit single-opponent targeting helpers
- add explicit targeting for enemy bases where needed
- audit Alpha and Foundation card definitions
- update wording and targeting legality

Deliverable:

- no 1v1-only content assumptions remain in live set code

## Phase 5. Runtime And UI

Goal:

- make 4-player matches understandable and playable

Work:

- top bar redesign for 4 players
- hand / visibility rules
- priority messaging for multi-pass windows
- theme/presentation updates
- selection and board interaction validation

Deliverable:

- local 4-player human match is playable in the UI

## Phase 6. Balance And Content Tuning

Goal:

- make the mode fun, not merely functional

Work:

- retune map size and resource density
- re-evaluate cards that scale badly in multiplayer
- review pacing and kingmaking pressure
- decide whether any FFA-only bans or variants are needed

Deliverable:

- internal playable balance target

## Phase 7. Bots

Goal:

- restore non-human seats

Work:

- generalize heuristics and minimax evaluation to multiple enemies
- teach bots how to pick targets among several opponents
- teach bots how to value survival vs opportunistic attacks

Deliverable:

- local 4-player with bots is playable

## Phase 8. Online 4-Player Prototype

Goal:

- generalize the current server from 2 seats to 4 seats

Work:

- queue and matchmaker refactor
- 4-player room model
- protocol updates
- reconnect / resync updates
- four-client authoritative command fanout

Deliverable:

- functional but still trust-based online 4-player prototype

## Phase 9. Secure Online Hidden Information

Goal:

- make online FFA resistant to hand/deck inspection cheating

Work:

- server-private hidden zones
- private per-player payloads
- redacted public match state
- reconnect/resync redesign

Deliverable:

- release-grade online hidden information model

## Non-Goals For The First Pass

To keep this tractable, the first implementation should not also try to do all of this:

- teams / 2v2 support
- 3-player gameplay support
- diplomacy or alliance rules
- spectator mode
- replays with hidden-information preservation
- draft / custom deckbuilding for 4-player online
- simultaneous-turn systems

## Risks

### 1. The Type Refactor Looks Smaller Than It Is

Changing `PlayerId` is the start, not the work.

Most of the risk is semantic:

- priority rotation
- elimination
- card targeting
- content wording

### 2. Card Design Debt Will Surface Quickly

Many current cards are fine in 1v1 because "enemy base" means one obvious target.

In FFA:

- some effects become too flexible
- some triggers become too weak
- some cards need explicit target choice UI

This is one reason the attack-targeting refactor should not be deferred until late in the project.

### 3. Online Security Is A Separate Major Project

Current deterministic replay is not enough for serious online FFA.

### 4. Bots Will Lag Behind

The easiest path is to get human 4-player working before trying to make bots good.

## Suggested Order Of Attack

If work starts now, the recommended implementation order is:

1. Phase -1
2. Phase 0
3. Phase 1
4. Phase 2
5. Phase 3
6. Phase 5
7. Phase 4
8. Phase 6
9. Phase 7
10. Phase 8
11. Phase 9

That order intentionally puts:

- attack targeting cleanup before multiplayer targeting expansion
- engine generalization before content audit
- local play before online play
- human play before bots
- insecure online prototype before secure hidden-state networking

## Acceptance Criteria

The refactor is in a good place when all of the following are true:

- 1v1 still works unchanged
- local 4-player FFA match bootstraps from content and maps cleanly
- active turn and priority pass around the table correctly
- elimination removes a player cleanly from the live match
- victory is awarded to the last surviving player
- all live card content has correct multiplayer targeting semantics
- UI shows four players clearly enough to play a real match
- tests cover multi-seat phase, stack, targeting, and elimination flow

## Bottom Line

This refactor is feasible, but it is large.

The codebase already has the right high-level architecture for it:

- command-driven simulation
- deterministic state transitions
- content registries
- a dedicated server layer

But the current implementation is still fundamentally a 2-player engine.

The right way to build 4-player FFA is:

- attack-targeting cleanup first
- dynamic-player kernel first
- local multiplayer second
- bots third
- online generalization after that

If this work starts, Phase 0 should be treated as mandatory, not optional.
