# Space Trader MVP Todos

Last updated: March 19, 2026

## Purpose
Detailed implementation plan for the architecture in `architecture.md` and rules in `game-design.md`.

## Decisions Locked Up Front
- Hand UI rendering:
  - The hand will be rendered in React UI (DOM overlay), not painted on the canvas.
  - Location: bottom-center hand tray overlay above the canvas.
  - Reason: easier interaction, hover/select states, tooltips, accessibility, and rapid iteration.
- Card introduction timing:
  - Card/deck/hand/discard gameplay enters in Phase 5.
  - Before Phase 5, we can show hand size counters and placeholder card UI, but not full card gameplay.

## Phase Status
- Phase 1: Completed.
- Phase 2: Completed.
- Phase 3: Completed.
- Phase 4: Completed.
- Phase 5-6: Not started.

## Phase 1 - Core Shell (State + Map + Phase Machine)
Goal:
- Replace ad hoc demo loop state with canonical `GameState`, map model, and strict phase progression shell.

Scope:
- `src/game/model/*` foundational types and IDs.
- `src/game/content/maps/frontierBelt.ts` map content.
- `src/game/turn/phaseMachine.ts` phase progression.
- Runtime initializes canonical match state through `getGameRuntime()`.
- Canvas shows map nodes/base and current phase data.

Deliverables:
- [x] Canonical `GameState` + player/map/entity structures.
- [x] Frontier Belt content model.
- [x] `advancePhase` shell with turn rollover.
- [x] Runtime + renderer reading from canonical state.
- [x] Debug phase advance input (`N`) for shell validation.
- [x] Remove temporary bouncing banner once gameplay visuals replace it.
- [x] Add state version field for future HMR-safe schema migrations.

Acceptance criteria:
- App starts on Frontier Belt with stable runtime singleton.
- Phase changes are deterministic and visible in HUD.
- Build passes.

## Phase 2 - Command/Event Pipeline + Core Unit Actions
Goal:
- Move from direct state edits to authoritative command -> event -> reducer flow.

Scope:
- `actions/commands.ts`, `actions/events.ts`, `actions/reducers.ts`.
- `rules/validators.ts` for phase/legality checks.
- Basic tactical actions:
  - select unit
  - move unit
  - declare attack
  - end phase

Deliverables:
- [x] Typed command dispatcher in runtime API.
- [x] Event queue + reducer-based state mutation scaffold.
- [x] First unit selection + movement command path through command/event/reducer flow.
- [x] Illegal actions return structured errors (initial validator coverage).
- [x] Unit movement budgets and attack budgets tracked per turn (reset-on-turn + budget consumption).
- [x] Placeholder attack outcomes (defender HP decrement + base-destruction winner assignment).

Acceptance criteria:
- No direct UI mutation of canonical state.
- Core actions replay from command log to same outcomes.
- Deterministic tests for movement and attack legality.

## Phase 3 - Priority + Stack + Instant Framework
Goal:
- Implement full LIFO stack and priority passing for instant-speed interaction.

Scope:
- `turn/priority.ts`, `turn/stack.ts`.
- Integrate stack-eligible actions into command/event flow.
- Minimal instant effect skeleton:
  - counter-like response
  - simple damage/remove response

Deliverables:
- [x] Priority ownership in state.
- [x] Pass/respond UI state exposed via runtime selectors (keyboard + React debug overlay).
- [x] Stack item push/pop/resolve with deterministic logging.
- [x] Minimal stack effect stubs implemented:
  - no-op log effect
  - damage enemy base effect
  - counter effect
- [x] Counter response target metadata added (`targetStackItemId`) with cast-time legality checks.
- [x] Counterable vs uncounterable legality matrix scaffold wired in validators.
- [x] Scenario tests added for:
  - damage effect base HP changes
  - counter removing a legal target
  - uncounterable target rejection
  - stack-based lethal damage setting winner and locking further commands

Acceptance criteria:
- Two players can exchange responses on stack in deterministic order.
- Both-pass rule resolves top stack item correctly.
- Stack behavior covered by scenario tests.

## Phase 4 - Node Control + Harvesting Loop
Goal:
- Implement StarCraft-style economy: capture, harvest cargo, return to base-adjacent drop-off, deposit in Economy Phase.

Scope:
- `systems/nodeControl.ts`, `systems/harvesting.ts`.
- Harvest action + cargo carry state on resource units.
- Deposit resolution in Economy Phase only.

Deliverables:
- [x] End-phase occupancy node capture.
- [x] Resource unit `carries` lifecycle (`null -> resource -> deposited/lost`).
- [x] Base-adjacent deposit zone check.
- [x] UI indicators:
  - node ownership
  - loaded harvester marker
  - deposit event feedback

Acceptance criteria:
- [x] No passive income from mere node ownership.
- [x] Destroyed loaded harvester loses cargo.
- [x] Economy totals update only on valid deposit.

## Phase 5 - Cards, Zones, Decks, and Hand UI
Goal:
- Bring actual card gameplay online with premade decks and orbital draw flavor.

Scope:
- `content/cards/*` and `content/decks/*`.
- Zone model in state:
  - deck
  - hand
  - discard
  - stack references
- Start-phase draw implementation.
- React hand tray overlay implementation.

Hand UI plan (explicit):
- Build `src/ui/HandTray.tsx` (React component) rendered over canvas in `App`.
- Card rendering uses DOM cards with:
  - title/cost/type
  - playability highlight
  - selected/hovered state
- Canvas remains for battlefield visuals only.

Deliverables:
- Deck loader + validation (60 cards, max 4 copies).
- Start with 7 cards in hand and draw 1 at Start Phase.
- Play card command from hand into stack/battlefield as appropriate.
- Basic discard handling for one-shot card types.

Acceptance criteria:
- Real cards are visible in bottom hand tray.
- Cards can be played from hand with cost checks.
- Deck/hand state transitions are deterministic and logged.

## Phase 6 - Combat Resolution, Win Path, and MVP Bot
Goal:
- Complete playable loop from turn start to base destruction with one AI opponent.

Scope:
- `systems/combat.ts` with locked formula.
- `systems/victory.ts` for base HP win condition.
- `ai/mvpBot.ts` for simple opponent decision policy.
- UX prompts for stack/priority and legal action feedback.

Deliverables:
- Base HP attrition from combat-tagged units.
- Combat modifiers (terrain/tile/base-distance/faction) applied in locked order.
- AI behavior priorities:
  - defend base
  - capture needed resources
  - favorable attacks
  - hold key instant responses

Acceptance criteria:
- Full match can complete to win/loss without manual debug shortcuts.
- Core systems are test-covered and deterministic.
- HMR still preserves live match state through normal logic edits.

## Cross-Cutting Work Items
- Add replay tooling from command log.
- Add schema versioning + migration/reset for state changes.
- Build test matrix for:
  - phase transitions
  - stack exchanges
  - harvest/deposit flow
  - victory conditions
- Add debug HUD toggles for IDs, ranges, ownership, and carry state.

## Immediate Next Tasks
1. Start Phase 5 zone model shell:
   - add explicit deck/hand/discard zone state structures per player
   - introduce zone-safe card instance IDs (data-driven, no giant card unions)
2. Start Phase 5 draw flow:
   - implement opening hand setup (7 cards) from premade deck content
   - implement Start Phase draw 1 card (satellite download flavor log + deterministic tests)
3. Start Phase 5 hand UI shell:
   - add `HandTray` React overlay with card placeholders and playability affordance
   - wire click-to-play command stub from hand to stack for one tactic card path
