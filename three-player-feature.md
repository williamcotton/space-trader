# Three-Player FFA Feature

Last updated: April 7, 2026

## Goal

Add a real `3-player free-for-all` mode while preserving both existing online formats:

- `1v1 PvP`
- `4-player FFA`

This should build on the four-player work, not repeat it. The engine now has dynamic player order, elimination-aware priority, explicit attack targeting, FFA-safe content targeting, local 4-player maps/profiles, bot FFA work, and mode-aware online queues. Three-player support should be a focused feature pass.

## Current Foundation

The four-player refactor already solved the largest blockers:

- `GameState` has `playerOrder` and `eliminatedPlayerIds`.
- Turn order and priority now rotate through live players instead of assuming one opponent.
- Elimination removes a player from live match state immediately.
- Local runtime profiles can define different player counts through map/profile setup.
- The top bar and presentation paths tolerate dynamic player counts.
- Bots now evaluate multiple enemies instead of a single opponent.
- Online matchmaking is format-aware through `OnlineMatchFormat`.
- The server room model now fans out over `playerOrder`, not exactly two players.

So the three-player feature should not need a new kernel refactor.

## Design Lock

Use the same FFA rules as four-player unless we explicitly change them later:

- Mode: `3-player free-for-all`
- Formal alliances: `none`
- Duplicate factions: `allowed`
- Turn order: fixed seat order for the match
- Starting seat: random
- Priority: full around-the-table priority among live players
- Win condition: last surviving player wins
- Ties: allowed
- Elimination: immediate when a base hits `0`
- Elimination cleanup: eliminated player’s base, units, stack objects, effects, zones, and node control leave the live match immediately
- Targeting: `enemy` means any non-self live player/entity
- First implementation target: local/offline, then online

## Main Difference From Four-Player

The main difference is map geometry.

Do not fake a 3-player match by using the 4-player square map with an empty seat. That creates awkward routes, asymmetric safe space, and a missing-corner economy hole.

Three-player FFA needs a purpose-built triangular/radial map:

- three bases at symmetric triangle points
- equal base-to-base distances
- equal distance from each base to its nearby primary nodes
- equal distance from each base to its nearby credit/trade beacon
- central contested economy that is equidistant from all three bases
- enough space that one player is not trivially pinched between two others on turn 1

Because this is a hex grid, the map probably should not be a literal right-angled rectangle. A custom `playableHexes` footprint, similar to the square-footprint work for `frontier_crossroads`, is the right approach.

## Proposed New Content

Add a new Alpha map:

- `frontier_triad`
- display name: `Frontier Triad` or `Triad Expanse`
- `spawnPoints`:
  - `player_1`
  - `player_2`
  - `player_3`
- no `player_4`
- `startingUnitOffsets` defined per seat orientation
- three nearby safe primary-resource clusters, one per base
- three nearby safe credit beacons, one per base
- one small central contested credit cluster, if the geometry supports a true center

Add a new runtime profile:

- id: `alpha_three_player`
- label: `Alpha Three-Player FFA`
- default map: `frontier_triad`
- default factions:
  - `player_1`: `alloy_clan`
  - `player_2`: `flux_collective`
  - `player_3`: `biomass_swarm`
- match id prefix: `alpha_3p`

Add a new online format:

- id: `ffa_3p`
- label: `3-Player FFA`
- required players: `3`
- runtime profile: `alpha_three_player`

## Implementation Plan

## Phase 0. Map Geometry Spike

Goal:

- prove a symmetric 3-seat map shape before wiring the full feature

Work:

- sketch candidate axial coordinates for three bases
- calculate base-to-base distances
- calculate distance from each base to all local resource nodes
- pick a footprint that renders naturally as a triangular/radial battlefield
- avoid an empty fourth corner

Deliverable:

- agreed coordinates for bases, starting units, and local/central resource nodes

## Phase 1. Local Map And Runtime Profile

Goal:

- make a local 3-player match boot cleanly

Work:

- add `frontierTriad.ts` under `src/game/content/sets/alpha/maps/`
- register the map in the Alpha set map installer
- add `alpha_three_player` to `runtimeProfiles.ts`
- expose it in the local Mode selector automatically through existing runtime profile handling
- add map symmetry tests for base/resource distances
- add state bootstrap tests proving:
  - `playerOrder` is `["player_1", "player_2", "player_3"]`
  - `player_4` is not created
  - all three players get base/scout/harvester/zones
  - random starting player works with current starting-player disadvantage

Deliverable:

- local 3-player FFA can start from the UI

## Phase 2. UI And Presentation Pass

Goal:

- make 3-player mode readable, not just technically functional

Work:

- verify the top bar layout at 3 players
- verify resource rows and player pods do not leave awkward empty space
- verify player themes are distinct when factions duplicate
- verify selected-unit and attack-target overlays are readable with three enemy/ally colors
- verify victory/elimination messaging reads correctly for three seats

Deliverable:

- local 3-player human match is playable in the UI

## Phase 3. Content And Rules Audit

Goal:

- confirm existing FFA-safe content behavior works for exactly three players

Work:

- test explicit enemy-base targeting with three valid enemy bases before elimination
- test target lists update after one player is eliminated
- test stack objects owned by eliminated players are removed
- test winner after reducing from three players to one
- review any effects that implicitly choose weakest/nearest enemy base

Expected result:

- most of this should already work from the four-player content audit

Deliverable:

- tests proving 3-player targeting and elimination behave correctly

## Phase 4. Bot Pass

Goal:

- ensure three-player bot games do not regress from the 4-player bot work

Work:

- run local bot smoke tests in `alpha_three_player`
- confirm minimax budgets are reasonable for 3 players
- verify base-threat defense still works when two enemies can threaten the base
- verify bots choose among two enemy bases sensibly
- verify resource routing does not send harvesters across the entire triangular map when a safe local equivalent exists

Potential issue:

- three-player games are more prone to kingmaking and “attack the leader” logic gaps than four-player games. The bot may need a small scoring term for pressuring the strongest enemy rather than always nearest enemy.

Deliverable:

- 3-player local bot match is playable enough for iteration

## Phase 5. Online Match Format

Goal:

- add online 3-player FFA without breaking `1v1 PvP` or `4-player FFA`

Work:

- extend `OnlineMatchFormat` with `ffa_3p`
- add format config:
  - label: `3-Player FFA`
  - required players: `3`
  - runtime profile: `alpha_three_player`
- update format-storage validation in the multiplayer client
- verify the mode selector shows all three online formats:
  - `1v1 PvP`
  - `3-Player FFA`
  - `4-Player FFA`
- add matchmaking tests proving:
  - two `pvp_1v1` players still start a 2-player match
  - three `ffa_3p` players start a 3-player match
  - four `ffa_4p` players still start a 4-player match
  - different format queues do not consume each other

Deliverable:

- trust-based online 3-player FFA prototype works

## Phase 6. Balance Pass

Goal:

- make 3-player FFA feel intentionally tuned

Work:

- tune map size and travel distance
- tune local safe resource density
- review central economy reward
- watch for first-player disadvantage scaling
- watch for runaway leader dynamics
- decide whether base HP or economy needs a 3-player-specific profile later

Deliverable:

- 3-player FFA has a reasonable first-pass balance target

## Technical Notes

### Online

The current online architecture is now format-aware enough that adding `ffa_3p` should be incremental. The key files are:

- `src/network/protocol.ts`
- `src/network/client.ts`
- `src/ui/MultiplayerControls.tsx`
- `server/src/matchmaker.ts`
- `server/src/createMatchState.ts`
- `server/src/matchRoom.ts`
- `server/src/matchmaker.test.ts`

The important constraint is to keep all formats separate. Do not make a generic “FFA queue” that can match three players into four-player or vice versa.

### Hidden Information

Three-player online has the same trust-model problem as one- and four-player online: clients can still reconstruct hidden state from deterministic match setup and command replay.

Do not solve that in this feature unless we explicitly start the secure-hidden-information project. Treat this as the same trust-based prototype model used by current online multiplayer.

### Maps

The map is the highest-risk piece. Four-player had a natural square/corner layout. Three-player needs deliberate symmetry.

The acceptance bar for the map should be stricter than “it has three spawn points”:

- all bases must have equivalent local geometry
- all local resource distances must match
- central economy distance must be equivalent
- no player should have a shorter route to two opponents than the others

## Non-Goals

- 2v1 teams
- diplomacy or formal alliances
- 3-player-specific card bans in the first pass
- secure hidden-information networking
- spectator mode
- using the 4-player map with one empty seat

## Acceptance Criteria

The feature is in a good first-pass state when:

- `1v1 PvP` still works locally and online
- `4-player FFA` still works locally and online
- local `3-player FFA` boots on a purpose-built triangular map
- online `3-player FFA` waits for exactly 3 players
- player order, priority, stack resolution, and elimination work for exactly 3 live players
- eliminated players disappear correctly
- target selection shows two enemy bases before elimination and one enemy base after one player is eliminated
- bots can take turns in local 3-player mode without obvious stalls
- map symmetry tests cover base/resource distances

## Bottom Line

Three-player FFA should be a focused feature now that the four-player infrastructure exists. The work is mostly:

- build a real triangular map
- add a three-player runtime profile
- add `ffa_3p` as a third online format
- test exact-3-player targeting, priority, and elimination

Do not redo the four-player kernel refactor, and do not fake three-player mode with a missing fourth seat.
