# Attack Refactor

Last updated: April 6, 2026

## Goal

Replace the current shortcut-based local attack flow with explicit attack target selection.

The engine already supports explicit attack commands:

- `ATTACK_UNIT` carries both `attackerId` and `targetId` in [commands.ts](/Users/administrator/Projects/space-trader/src/game/actions/commands.ts)
- validation already checks a specific attacker against a specific target in [validators.ts](/Users/administrator/Projects/space-trader/src/game/rules/validators.ts)
- combat resolution already consumes a specific target in [combat.ts](/Users/administrator/Projects/space-trader/src/game/actions/handlers/combat.ts)

So this refactor is not about inventing attack targeting in the simulation layer. It is about fixing the player interaction model so the player can intentionally choose the target to attack.

## Why This Refactor Matters

Current player-facing behavior is too implicit:

- pressing `A` calls `attackSelectedUnitFirstTargetInRange()` in [GameCanvas.tsx](/Users/administrator/Projects/space-trader/src/GameCanvas.tsx) and [runtime.ts](/Users/administrator/Projects/space-trader/src/game/runtime.ts)
- that helper just finds the first legal enemy entity in object iteration order and attacks it
- board clicks do not currently support attack declaration at all; enemy clicks generally clear selection in [runtime.ts](/Users/administrator/Projects/space-trader/src/game/runtime.ts)

This is already weak in 1v1, and it becomes unacceptable for:

- better tactical play in 1v1
- future 3/4 player modes
- clearer UI
- explicit enemy-base targeting semantics

This refactor should land before the 4-player FFA work.

## Current State

### What Already Works

- `ATTACK_UNIT` is an explicit command with `attackerId` and `targetId`
- validators already enforce:
  - active player
  - priority
  - tactical phase
  - selected attacker
  - attack legality
  - range
- direct attack restrictions already route through [directInteraction.ts](/Users/administrator/Projects/space-trader/src/game/rules/directInteraction.ts)
- bots already choose explicit targets:
  - [mvpBot/tactical.ts](/Users/administrator/Projects/space-trader/src/game/ai/mvpBot/tactical.ts)
  - [minimax/generate.ts](/Users/administrator/Projects/space-trader/src/game/ai/minimax/generate.ts)
- hover combat preview already exists in:
  - [GameHudPanels.tsx](/Users/administrator/Projects/space-trader/src/ui/GameHudPanels.tsx)
  - [overlays.ts](/Users/administrator/Projects/space-trader/src/game/render/overlays.ts)

### What Is Wrong

- board click flow in [runtime.ts](/Users/administrator/Projects/space-trader/src/game/runtime.ts) only supports:
  - select friendly unit
  - move selected unit to empty hex
  - clear selection
- there is no player-level "I am choosing an attack target now" state
- `A` attacks the first legal target instead of letting the player choose
- enemy hover preview is informative, but not actionable
- the current local interaction model does not scale to multiple enemies or multiple enemy bases

## Design Direction

Recommended model:

- selecting a unit still works as it does today
- pressing `A` with an eligible selected unit enters `attack targeting` mode
- while in attack targeting mode:
  - valid enemy targets are highlighted
  - clicking a valid enemy submits `ATTACK_UNIT`
  - clicking outside the map or pressing `Escape` cancels attack targeting
  - clicking a friendly unit switches selection and exits attack targeting
  - clicking an invalid enemy target cancels or no-ops with a clear reason

This should mirror the existing pending card targeting pattern instead of creating a one-off targeting system.

The current card targeting path already has transient runtime-owned targeting state in [runtime.ts](/Users/administrator/Projects/space-trader/src/game/runtime.ts). Attack targeting should follow the same general shape.

## Recommended UX Rules

### Entering Attack Targeting

Primary path:

- player selects a unit
- player presses `A`

Recommended secondary path:

- optional later: clicking an enemy while an eligible selected unit is active can directly attack if there is exactly one valid selected attacker and the click is unambiguous

For the first pass, keep this simple:

- `A` enters attack targeting
- click confirms the target

### While Attack Targeting Is Active

- valid enemy units and bases in range should be visibly highlighted
- hovering a valid target should continue to show combat preview
- clicking a valid target should dispatch `ATTACK_UNIT`
- clicking a friendly unit should select it and leave attack targeting
- clicking empty space should cancel attack targeting
- `Escape` should cancel attack targeting
- re-pressing `A` should cancel attack targeting if already active

### Network Matches

Attack targeting state should remain client-side transient state.

Only the final explicit `ATTACK_UNIT` command should be submitted to the authoritative server. This matches the existing model for local intent vs authoritative execution.

## Proposed Architecture

### 1. Add Pending Attack Targeting To Runtime

Add a runtime-only transient state alongside `pendingCardTargeting`, likely something like:

```ts
type PendingAttackTargeting = {
  playerId: PlayerId;
  attackerId: EntityId;
  prompt: string;
};
```

This should live in [runtime.ts](/Users/administrator/Projects/space-trader/src/game/runtime.ts), not in `GameState`.

Reason:

- it is UI interaction state, not simulation state
- card targeting already uses this pattern successfully
- it should not affect deterministic replay

### 2. Add Runtime Methods For Attack Targeting

Recommended public runtime methods:

- `beginAttackTargetingForSelectedUnit()`
- `cancelPendingAttackTargeting()`
- `getPendingAttackTargeting()`

Recommended behavior:

- refuse to begin unless:
  - there is a selected owned unit
  - the unit can declare attacks
  - it has attacks remaining
  - at least one legal target exists
- clear attack targeting when:
  - the unit is deselected
  - the attacker dies
  - the phase changes away from a usable attack window
  - the stack becomes non-empty
  - a network resync resets local runtime state

### 3. Rework Board Click Routing

`getBoardClickCommandForPlayer(...)` in [runtime.ts](/Users/administrator/Projects/space-trader/src/game/runtime.ts) should stop treating enemy clicks as generic clear-selection behavior whenever attack targeting is active.

Recommended flow:

- if `pendingCardTargeting` exists, resolve that first
- else if `pendingAttackTargeting` exists:
  - clicked valid enemy entity => `ATTACK_UNIT`
  - clicked friendly entity => `SELECT_ENTITY` and clear attack targeting
  - clicked outside / empty tile => clear attack targeting
- else use normal selection/move behavior

This ordering matters so targeting modes stay explicit and deterministic.

### 4. Add Target Enumeration Helpers

The runtime currently re-finds the first legal target inline. Replace that pattern with a reusable helper that enumerates legal attack targets for a given attacker.

Suggested helpers:

- `getLegalAttackTargets(state, attackerId)`
- `canSelectedUnitTargetEntity(state, playerId, targetId)`

These should use the existing rules seams:

- `canUnitDeclareAttack(...)`
- `canAttackEntityDirectly(...)`
- `getEffectiveUnitAttackRange(...)`

This avoids duplicated targeting math across:

- runtime input
- hover overlays
- HUD preview state
- future AI/UI enhancements

### 5. Add Render And HUD Support

Rendering should visually distinguish:

- selected unit
- attackable enemy targets
- currently hovered enemy target
- invalid enemy entities that cannot be attacked

Likely touch points:

- [overlays.ts](/Users/administrator/Projects/space-trader/src/game/render/overlays.ts)
- [GameHudPanels.tsx](/Users/administrator/Projects/space-trader/src/ui/GameHudPanels.tsx)

Recommended additions:

- a distinct "attack targeting" overlay mode
- a HUD hint such as `Choose attack target` when active
- explicit valid-target highlighting, not just line preview on hover

### 6. Update Keyboard Handling

In [GameCanvas.tsx](/Users/administrator/Projects/space-trader/src/GameCanvas.tsx):

- `A` should toggle attack targeting, not auto-attack the first target
- `Escape` should cancel pending targeting modes

Do not keep the current "first target in range" behavior as the main user path.

If a fast-path is still desired later, it should be opt-in and deterministic, not the primary default.

### 7. Keep AI Mostly Unchanged

Bots already produce explicit `ATTACK_UNIT` commands with specific targets.

That means:

- MVP bot target selection logic in [mvpBot/tactical.ts](/Users/administrator/Projects/space-trader/src/game/ai/mvpBot/tactical.ts) mostly does not need redesign
- minimax target generation in [minimax/generate.ts](/Users/administrator/Projects/space-trader/src/game/ai/minimax/generate.ts) already aligns with the explicit model

The main opportunity is to share a common target-enumeration helper so UI and AI rely on the same legal-target rules.

## Phased Implementation Plan

## Phase 0. Lock Interaction Rules

Before coding, lock the user interaction model.

Recommended locked decisions:

- `A` enters attack targeting
- clicking a valid enemy confirms the attack
- `Escape` cancels attack targeting
- clicking empty space cancels attack targeting
- clicking a friendly unit changes selection and exits attack targeting
- attack targeting remains runtime-transient only

Deliverable:

- approved interaction spec

## Phase 1. Extract Legal Attack Target Helpers

Goal:

- centralize target enumeration and target legality checks

Work:

- add reusable helpers for legal attack targets
- update runtime and any duplicated logic to use them
- avoid repeated inline `Object.values(state.entities).find(...)` patterns

Deliverable:

- one shared source of truth for attack target enumeration

## Phase 2. Add Runtime Pending Attack Targeting

Goal:

- support explicit attack-target selection as a runtime interaction mode

Work:

- add `pendingAttackTargeting`
- add begin/cancel/query runtime methods
- clear pending attack targeting on state resets and invalidating transitions

Deliverable:

- runtime can enter and leave attack-targeting mode safely

## Phase 3. Rework Board Input

Goal:

- make board clicks resolve explicit attack targets

Work:

- update `selectUnitFromScreenPoint(...)`
- update `getBoardClickCommandForPlayer(...)`
- ensure enemy clicks attack only in attack-targeting mode
- preserve move/select behavior outside attack-targeting mode

Deliverable:

- player can choose exactly which enemy to attack by clicking

## Phase 4. Overlay And HUD Support

Goal:

- make attack targeting readable and discoverable

Work:

- highlight valid attack targets
- show attack-targeting prompt text
- keep or improve hover combat preview
- clearly indicate when attack is not currently legal

Deliverable:

- player can see who is attackable before clicking

## Phase 5. Keyboard And UX Cleanup

Goal:

- align shortcuts with the new model

Work:

- make `A` toggle attack targeting
- add `Escape` cancel behavior
- remove or deprecate `attackSelectedUnitFirstTargetInRange()` from player-facing usage
- keep any debug fast-path clearly separated if retained at all

Deliverable:

- keyboard flow matches the click flow

## Phase 6. Test Coverage

Goal:

- prevent regressions in both local and network play

Tests to add or update:

- runtime interaction tests in [runtime.test.ts](/Users/administrator/Projects/space-trader/src/game/runtime.test.ts)
- validator coverage for explicit target attacks
- overlay / HUD snapshot-style tests if practical
- networked attack-targeting flow:
  - local targeting state stays local
  - only `ATTACK_UNIT` is submitted

Recommended scenarios:

- entering attack targeting with no valid targets fails cleanly
- entering attack targeting with one valid target
- entering attack targeting with multiple valid targets and choosing a non-first target
- cancelling attack targeting
- changing selection while attack targeting is active
- networked tactical attack submission

Deliverable:

- explicit target selection is covered in local and network modes

## Non-Goals

This refactor should not also try to solve:

- 4-player targeting semantics in full
- enemy-base card targeting cleanup
- bot strategy redesign
- general card-targeting UX rewrite

Those are related, but separate.

## Risks

### 1. Runtime Input Complexity

The runtime already has card-targeting, movement, harvest, and network gating behavior. Attack targeting adds another transient interaction mode, so priority order in input handling must stay disciplined.

### 2. Confusing Overlap Between Hover Preview And Commit State

The HUD already previews attacks on hover. The refactor needs to make it clear when the player is only previewing versus when they are actively choosing an attack target.

### 3. Hidden Coupling To Selection Logic

Attack validation already requires the attacker to be selected. This is fine, but it means attack targeting must stay aligned with selection clearing and unit death handling.

## Acceptance Criteria

The refactor is successful when:

- local players can explicitly choose which enemy to attack
- `A` no longer attacks an arbitrary first target
- valid attack targets are visually clear
- network play still only sends the final authoritative `ATTACK_UNIT`
- bots still function without behavior regressions
- the new model is suitable as a prerequisite for multiplayer content targeting and 4-player FFA

## Bottom Line

This is a medium-sized runtime/UI refactor, not a combat-rules rewrite.

The good news is that the simulation layer is already explicit. The weak part is only the player interaction layer. That makes this a strong candidate to do now, before broader multiplayer targeting work and before any 4-player FFA implementation begins.
