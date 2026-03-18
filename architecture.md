# Space Trader Architecture

Last updated: March 18, 2026

## Purpose
Define a concrete, implementation-first architecture for the MVP described in `game-design.md`.

## MVP Targets
- Electron + React + TypeScript desktop game.
- One playable map: Frontier Belt.
- 1v1 match, turn-based hex tactics.
- 3 premade faction decks, 60 cards each, max 4 copies/card.
- Win by reducing enemy base HP to 0 (MVP target HP: 100).
- Full stack (LIFO) instant-speed interactions.
- StarCraft-style harvesting loop:
  - Capture nodes by occupancy.
  - Harvest cargo with resource units.
  - Deposit on base-adjacent tiles during Economy Phase.

## Architectural Principles
- Single source of truth: one authoritative mutable `GameState` inside the runtime.
- Deterministic simulation: same input action stream => same outcomes.
- Clear separation:
  - Rules/simulation are pure or side-effect constrained.
  - Rendering is view-only over state/events.
  - UI dispatches commands but does not mutate authoritative game state directly.
- HMR-safe development:
  - Runtime singleton persists through module reloads.
  - Simulation/render systems can be swapped without wiping match state.
- Data-driven content:
  - Cards, decks, map layouts, and resource skins loaded from content modules, not hardcoded in rules.

## Runtime Topology
- React UI layer
  - Menus, overlays, stack panel, logs, debug controls.
  - Sends typed commands to game runtime.
- Game runtime layer (`getGameRuntime()` singleton)
  - Owns authoritative game state.
  - Owns phase machine, priority, stack, action queue, event log.
  - Exposes read-only snapshots/selectors to UI.
  - Runs update/render bridge for canvas.
- Simulation/rules layer
  - Validates commands against state and phase.
  - Produces deterministic domain events.
  - Applies events to state.
- Presentation layer
  - Canvas renderer reads state + transient animation events.
  - RAF loop for animation only; turn progression remains event-driven.

## Simulation Clock vs Render Clock
- Simulation clock: discrete and rule-driven.
  - Advances only when actions/events resolve.
  - Handles phases, stack resolution, attacks, harvesting deposits.
- Render clock: continuous (`requestAnimationFrame`).
  - Interpolates visuals and plays effects.
  - Never decides rules outcomes.

## Proposed Module Layout
```text
src/game/
  runtime/
    gameRuntime.ts          # singleton, lifecycle, HMR persistence
    api.ts                  # command dispatch + read API for UI
  model/
    state.ts                # canonical GameState and subtypes
    ids.ts                  # branded IDs for entities/cards/players
    enums.ts                # phase/resource/faction/tag enums
  content/
    cards/                  # card definitions
    decks/                  # premade 60-card decklists
    maps/
      frontierBelt.ts       # MVP map layout + resource nodes
    resourceSkins.ts        # map flavor names/art -> canonical resource types
  rules/
    validators.ts           # action legality checks
    costs.ts                # payment and affordability
    targeting.ts            # target validation, LOS/range checks
    summoning.ts            # summoning sickness and exceptions
  turn/
    phaseMachine.ts         # Start/Economy/Main/Tactical/End transitions
    priority.ts             # active player priority pass logic
    stack.ts                # LIFO stack push/pop/resolve
  systems/
    movement.ts             # move budget and path/range checks
    combat.ts               # locked combat formula and retaliation
    nodeControl.ts          # occupancy capture at end step
    harvesting.ts           # load cargo, carry, base-adjacent deposit
    victory.ts              # base HP win condition
  actions/
    commands.ts             # command types from UI/AI
    events.ts               # deterministic event types
    reducers.ts             # apply events to GameState
  ai/
    mvpBot.ts               # heuristic 1v1 AI
  render/
    canvasRenderer.ts       # board/unit/effect drawing
    animations.ts           # transient visuals from event stream
  debug/
    inspector.ts            # dev overlays + state inspectors
    replay.ts               # action/event replay helpers
```

## Canonical State Shape (MVP)
```ts
type GameState = {
  matchId: string;
  seed: number;
  turn: number;
  phase: "start" | "economy" | "main" | "tactical" | "end";
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  stack: StackItem[];
  players: Record<PlayerId, PlayerState>;
  map: MapState;
  entities: Record<EntityId, EntityState>; // units, structures, bases
  zones: ZoneState; // deck/hand/discard/exile style zones
  pendingAnimations: AnimationCue[];
  log: MatchEvent[];
  winner: PlayerId | null;
};
```

## Command -> Event -> State Flow
1. UI/AI emits a typed command (example: `PlayCard`, `DeclareAttack`, `HarvestNode`, `PassPriority`).
2. Validator checks legality against current phase/priority/resources/targets.
3. If legal:
   - Produce one or more domain events.
   - Push stack item if command is stack-using (spells/instants/abilities).
4. Resolver processes events:
   - Apply event reducer to mutate `GameState`.
   - Emit animation/log cues.
   - Re-evaluate triggers and priority.
5. Repeat until no pending mandatory resolutions.

This keeps rules deterministic and replayable.

## Turn/Phase Architecture
- Start Phase
  - Draw one card ("satellite download").
  - Start-of-turn triggers.
- Economy Phase
  - Deposit carried cargo for harvesters on base-adjacent tiles.
  - Economy effects.
- Main Phase
  - Play non-instant cards, deploy, activate main-phase abilities.
- Tactical Phase
  - Unit movement and attacks (respect move/attack budgets and sickness rules).
- End Phase
  - Node occupancy capture.
  - Cleanup and end triggers.
  - Pass turn.

Phase transitions should be implemented in a strict state machine; avoid ad hoc phase checks spread across code.

## Stack/Priority Architecture
- Full stack LIFO for stack-eligible actions.
- Priority passes between players.
- Resolve top stack item only after both players pass consecutively.
- Non-stack actions (movement, node ownership updates, deposit step) bypass stack.
- Maintain an explicit legality matrix in code for counterable vs uncounterable actions.

## Combat Architecture
- Use locked formula from design doc in one dedicated resolver (`systems/combat.ts`).
- Inputs:
  - attacker stats + temporary/faction bonuses
  - defender armor + terrain/tile/faction defenses
  - supply penalty by distance-from-friendly-base
- Output:
  - deterministic final damage, min 1 on successful hit
- Include hooks for:
  - before-attack triggers
  - on-hit/after-damage triggers
  - instant response windows before resolve

## Economy + Harvesting Architecture
- Node control and harvesting are separate:
  - `nodeControl.ts` owns ownership changes.
  - `harvesting.ts` owns cargo lifecycle.
- Cargo lifecycle:
  - `empty -> loaded(resourceType) -> deposited` or `lost`.
- Deposit rule:
  - base-adjacent tiles at Economy Phase.
- Keep harvesting data on unit state (`carriedCargo?: ResourceType`).

## Content Architecture
- Card definitions should be data objects with:
  - cost, speed, targets, tags, effect script IDs.
- Effect execution:
  - map effect IDs to deterministic resolver functions.
  - avoid arbitrary script eval.
- Decklists:
  - validated at load time (60 cards, max 4 copies/card ID).
- Maps:
  - canonical mechanics (resource types) + skin names/art per map.

## HMR and Development Workflow
- Continue using singleton runtime via `getGameRuntime()`.
- Persist runtime through `import.meta.hot.dispose`.
- Hot-accept simulation/render modules where safe.
- When state schema changes in incompatible ways:
  - add `stateVersion`.
  - provide migration or reset with explicit dev warning.

## Save/Replay Strategy
- Save format:
  - snapshot (`GameState`) + schema version.
- Replay format:
  - initial seed + command log.
- Deterministic replay should be a test target for every rules change.

## Testing Strategy
- Unit tests:
  - validators, combat formula, harvesting flow, node capture, phase transitions.
- Scenario tests:
  - stack interactions (counter wars), summoning sickness, base kill conditions.
- Replay tests:
  - command log determinism across runs.
- Content validation tests:
  - card/deck/map schema constraints.

## Incremental Build Plan
- Phase 1: Replace bouncing-text state with canonical `GameState`, map model, and phase machine shell.
- Phase 2: Implement command/event pipeline + basic movement and attacks.
- Phase 3: Implement stack/priority + instant cards.
- Phase 4: Implement node capture + harvester cargo + deposit at base-adjacent tiles.
- Phase 5: Load first premade decks + Frontier Belt content.
- Phase 6: Add MVP AI + UX for stack prompts and action legality feedback.

## Risks and Mitigations
- Risk: stack complexity slows progress.
  - Mitigation: strict command/event boundaries and priority tests early.
- Risk: economy feels slow or snowbally.
  - Mitigation: tune node density, harvester speed, and cargo throughput from telemetry.
- Risk: HMR breaks on schema churn.
  - Mitigation: state versioning and explicit migration/reset path.

## Done Criteria for Architecture
- A full match can be played on Frontier Belt from opening hand to base destruction.
- All authoritative outcomes are produced by simulation code, not render code.
- Stack/priority, harvesting, and node capture are deterministic and test-covered.
- Runtime survives HMR for normal logic edits without losing current match state.
