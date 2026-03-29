# Space Trader - Game Design (Living Draft)

Last updated: March 29, 2026

## Purpose
This is the working game design document for Space Trader.
It should track both:
- the current playable rules and constraints in the prototype
- the intended direction as we add depth, synergy, and faction identity

## High Concept
Space Trader is a turn-based, hex-grid tactics card game.
Players command a faction base, gather resources from map nodes, download plans from an orbiting satellite, cast spells and unit cards onto a stack, deploy units onto the battlefield, and try to destroy the opposing base.

The target feel is:
- MTG-style resource tension, stack interaction, and combo moments
- StarCraft-style harvesting, expansion pressure, and base assault
- Civilization-style per-unit tactical turns on a hex map

## Current Build Snapshot
These are the rules the prototype should generally be designed around unless explicitly changed.

### Match Structure
- 1v1 on a single map: `Frontier Belt`
- Premade decks only
- Current playable factions:
  - `Alloy Clan`
  - `Flux Collective`
  - `Biomass Swarm`

### Win Condition
- Destroy the opposing base
- Bases currently use HP attrition, not capture
- Current base HP target: `20`

### Turn Structure
1. Start
   - Active player draws 1 card when the turn enters Start
   - The first player does not get an extra opening-turn draw
2. Economy
   - Active player gains `+1 Credit`
   - Loaded harvesters on base-adjacent tiles deposit cargo
3. Main
   - Main-speed cards can be cast
4. Tactical
   - Units move, attack, and harvest
5. End
   - Node control updates by occupancy
6. Discard
   - If the active player is above `7` cards, they discard down to `7`

### Stack and Priority
- The game uses a full LIFO stack
- Both tactic cards and unit cards are cast onto the stack
- Unit cards do not enter play immediately; they resolve from the stack into battlefield units
- Priority alternates between players until both pass in sequence
- While the stack is unresolved, phase changes and battlefield actions are halted
- Only legal stack responses and priority passing are allowed while the stack is non-empty

### Cards, Decks, and Draw
- Deck size: `60`
- Copy limit: `max 4` of any card
- Current starter decks are single-faction plus neutral support cards
- Opening hand: `5`
- Max hand size: `7`, enforced by end-of-turn discard
- Flavor: cards drawn each turn are downloaded plans from an orbital satellite

### Starting Economy
- Each player starts with:
  - `Player 1: 2 Credits`
  - `Player 2: 5 Credits`
  - `2` of that faction's primary resource
- This asymmetry is currently being used to smooth seat bias in mirrors

### Resource Model
- Universal resource:
  - `Credits`
- Faction resources:
  - `Alloy`
  - `Flux`
  - `Biomass`
- Resource nodes exist on the map and are tied to canonical resource types
- A node must be controlled before it can be harvested
- Resource units harvest cargo from controlled nodes and return it to a base-adjacent dropoff tile
- Deposit occurs during the Economy phase
- Current deposit values are `2` for all resource types
- Current passive income is `+1 Credit` during Economy and no passive primary-resource income
- Node control grants harvesting rights, not direct passive resource generation

### Unit Roles
Current unit roles are:
- `combat`
- `resource`
- `utility`

Current unit stat vocabulary is:
- HP
- Attack
- Armor
- Move
- Range
- Attacks per turn
- Siege bonus vs bases

### Tactical Model
- Summoning sickness is enabled
- Newly deployed units cannot act on the turn they resolve onto the battlefield unless a keyword or effect says otherwise
- Units act with Civ-like per-turn budgets
- Tactical auto-flow exists, but harvesting opportunities should not be skipped automatically
- Keywords currently matter in live rules, not just future design:
  - `sprout`
  - `stealth`
  - `relay`
  - `surge`
  - `bloom`
  - `salvage`
  - `bastion`
  - `uncounterable`

## Core Pillars
- Faction identity matters: each faction should have a distinct economic and tactical rhythm
- Positioning matters: the hex board should create meaningful movement and attack decisions
- Economy matters: harvesting routes and timing should be core to gameplay, not background income
- Stack interaction matters: strong plays should be interactable and counterplay should be visible
- Synergy matters: units and tactics should create satisfying combinations, not just isolated efficiency
- Clarity matters: players should be able to understand what is legal, what is happening, and why outcomes occurred

## Player Fantasy
- Build a battlefield engine around your faction's strengths
- Convert map control into card tempo and board pressure
- Set up support pieces and payoff turns
- Outsmart the opponent through timing, positioning, and stack play
- Assemble small combos that feel powerful but still interactable

## Factions and Resource Identity
### Alloy Clan
Theme:
- industrial, disciplined, armored, line-based pressure

Mechanical identity:
- adjacency and formation payoffs
- armor and durability
- siege
- durable combat units
- damaged-matters finishers
- salvage payoffs
- positional bastion-style reinforcement

What Alloy should be best at:
- holding territory
- turning support positioning into stronger combat math
- converting board control into base pressure
- punishing already-weakened enemies

### Flux Collective
Theme:
- high-tech, reactive, spatial, precision strikes

Mechanical identity:
- stack interaction
- spell chaining
- precise removal
- spatial and hex-based tactics
- tempo
- card flow and selection
- combo turns built around cascade geometry and spell sequencing
- Relay and Surge as real combo infrastructure

What Flux should be best at:
- punishing expensive plays with counters or tempo loss
- converting tactic cards into extra value
- finding clever swing turns rather than brute-force board presence
- manipulating cascade/spatial effects better than the other factions

### Biomass Swarm
Theme:
- organic, spreading, adaptive, growth through board presence

Mechanical identity:
- sprout / immediate board presence
- go-wide play
- global buffs
- growth over time
- board-based resource generation
- recursion/regrowth themes
- Bloom as a board-growth engine keyword

Secondary identity, not the main axis:
- death payoffs
- battlefield churn
- rebuilding after trades

What Biomass should be best at:
- spreading bodies early
- scaling from already having a board
- turning cluster play into payoff
- snowballing from buffs and presence
- rebuilding after trades

### Neutral
Theme:
- generic infrastructure, salvage, and broad-spectrum tactical tools

Mechanical identity:
- simple bodies
- generic staples
- symmetrical effects
- expensive catch-all tools

What Neutral should be best at:
- filling holes in faction decks
- offering baseline answers and utility
- supporting archetypes without becoming the best payoff for them

### Neutral Tax
- Neutral cards should generally be weaker on rate than faction cards
- Faction cards should get better efficiency and synergy
- Neutral cards should get flexibility and accessibility
- Splashing outside your faction pie should cost tempo, stats, ceiling, or all three

## Map Resource Layer
### Canonical Resource Types
- Credits
- Alloy
- Flux
- Biomass

### Flavor Rule
Maps can rename and reskin node sources without changing underlying mechanics.

Examples:
- Alloy source may be `Ore Mine` on one map and `Wreck Quarry` on another
- Flux source may be `Ion Vent` on one map and `Arc Well` on another
- Biomass source may be `Xenobog` on one map and `Spore Basin` on another

### MVP Map
`Frontier Belt`
- Credits: `Trade Beacons`
- Alloy: `Ore Mines`
- Flux: `Ion Vents`
- Biomass: `Xenobogs`

Future maps can vary visual identity heavily while keeping the same economy rules.

## Current Combat Direction
### Base Combat
- Combat units attack bases directly
- Base destruction is the primary win condition
- Siege should live on units as a unit characteristic, not a global combat rule

### Unit-vs-Unit Combat
Current prototype stats support:
- attack damage
- armor
- attack range
- move range
- attacks per turn

The game still needs a tighter long-term answer on terrain and supply modifiers.
Current design intent remains:
- map position should matter
- not all combat should be decided by printed stats alone

## Card System Direction
### Card Types
Current implemented card types:
- `Unit`
- `Tactic`

Potential future types, only if justified:
- `Structure`
- `Upgrade`
- `Attachment`

Do not add extra card types unless they create genuinely different play patterns.
The current system should get deeper before it gets broader.

### Speed Model
- `Main`: playable only on your turn in Main phase with an empty stack
- `Instant`: playable whenever you have priority and the card has a legal target/context

### Current Content Problem
The current card pool is no longer purely flat, but it is still uneven.

What is already live:
- battlefield-targeting tactics
- support and synergy units
- cascade/spatial tactics
- haymaker tactics
- a real `Relay` shell
- a real `Surge` shell
- a real `Bloom` shell
- Alloy `Salvage` and `Bastion` packages
- faction-specific payoff units and payoff tactics

What still needs work:
- tighter faction balance
- stronger monofaction archetype depth
- more combo payoffs beyond the first live packages
- a cleaner Biomass regrowth / death-value package
- one louder Alloy signature payoff card
- a top-end Flux `Relay` / `Resonance` payoff

## New Content Direction: Make the Game More Exciting
The next wave of design should focus on:
- monofaction archetypes inside each faction
- combo packages that are readable and position-sensitive
- stronger support/payoff loops instead of isolated rate cards
- more reasons to care about support pieces, positioning, and sequencing
- faction-signature haymakers that still respect the faction pie

## Ability Vocabulary (Recommended)
Do not solve this by creating bespoke rules text for every card.
Build a small reusable vocabulary and make many cards out of it.

### Triggers
- `on_owner_tactic_played`
- `on_owner_surged_tactic_played`
- `on_owner_salvaged`
- `on_cascaded`
- `on_self_bloomed`
- `on_owner_unit_bloomed`
- `on_enter_battlefield`
- `on_death`
- `on_damage_dealt`
- `at_start_of_phase`
- `at_end_of_turn`

### Continuous / Positional Effects
- `adjacent_aura`
- `global_unit_buff`
- `temporary_stat_buff`
- `temporary_keyword_grant`
- `resource_conversion_from_board_state`
- `resource_conversion_from_turn_triggers`
- `while_controlling_node` if needed later
- `cascade_geometry`

### Effect Payloads
- `deal_damage`
- `destroy_entity`
- `deploy_unit`
- `apply_continuous_effect`
- `draw_cards`
- `gain_resources`
- `counter_stack_item`
- `return_to_hand` later
- `create_token` later

Current note:
- true graveyard / reanimation play still needs more than one payload; it likely needs a dedicated zone-move / graveyard-targeting feature pass

### Duration Buckets
- `until_end_of_turn`
- `permanent`
- `start_of_next_turn`
- `while_source_alive`
- `until_used` for future one-shot shields / wards

This keeps the design extensible without requiring a giant one-off exception list.

## Support and Synergy Units
Support units should be real gameplay pieces, not filler stats.
They should either:
- buff nearby allies
- reward a specific action pattern
- set up a payoff turn
- turn routine actions like harvesting or spellcasting into extra value

### Good Support Patterns
- adjacency buffs
- deploy triggers
- spell-matter triggers
- harvest triggers
- death triggers
- “damaged enemy” payoffs

### Bad Support Patterns
- invisible passive math with no board read
- tiny numeric bonuses that do not change decisions
- effects so broad that they are always correct and never interesting

## Battlefield-Targeting Tactics
This baseline is now online in the prototype and should remain a major content lane.

### Current Baseline
- Deal damage to target unit
- Deal damage to target unit or base
- Buff target allied unit until end of turn
- Destroy target damaged unit
- Protect or reinforce a unit for a turn
- Hex-targeted cascade/spatial tactics

### Example Patterns
- `Arc Snap`: deal 2 damage to target unit
- `Slag Barrage`: deal 2 damage to target unit or base
- `Brace Protocol`: target allied unit gets +2 armor until end of turn
- `Overload Finish`: destroy target damaged unit
- `Ion Shower`: choose a hex and cascade an attack buff
- `Meteor Chain`: choose a hex and hit that area

These should remain one of the most important gameplay layers because they convert stack play into real board-state swings.

## Combo Philosophy
The game should support combos, but they should mostly be:
- two-card combos
- three-card sequences
- board-plus-spell setups

Avoid building around true infinite loops or opaque combo trees for now.
The target is satisfying linked plays and bounded loop-feeling engines, not rules-lawyer complexity.

Current live combo vocabulary:
- Flux: `relay` + `surge`
- Biomass: `bloom`
- Alloy: `salvage` + `bastion`

### Good Combo Shapes
- Support unit + attacker + combat trick
- Spell-matter unit + two tactics in one stack exchange
- Harvester/value trigger + payoff card
- Damage spell + damaged-unit finisher
- Cascade setup + Relay extension + payoff
- Growth engine + wide board + anthem or resource conversion

### Combo Design Rules
- Combo pieces should be useful alone and stronger together
- Counterplay should exist through stack interaction, board removal, or positioning denial
- Combo turns should have strong visual feedback
- The best combos should feel earned, not automatic
- Loop-feeling mechanics should be bounded by per-turn or per-resolution limits unless the game deliberately grows into true infinite-combo support later

## Current Archetype Expansion Priorities
### Alloy Clan
What Alloy should gain next:
- one louder formation / siege / salvage payoff
- another damaged-matters finisher or artillery-style spell
- more incentives for disciplined board shape instead of isolated stats

### Flux Collective
What Flux should gain next:
- a top-end `Relay` payoff
- `Resonance` or another next-layer spatial payoff
- more reasons to assemble full spellchain turns rather than just efficient tactics

### Biomass Swarm
What Biomass should gain next:
- a regrowth / recursion package
- more death-value support
- a cleaner bridge between sprout/go-wide play and a true recovery engine

## Economy Design Principles
- Resource gathering should continue to feel StarCraft-like, not abstract
- Harvesters should create meaningful route and escort decisions
- Resource denial and node contesting should matter
- There should be tension between spending on economy, support pieces, and combat finishers
- Support/synergy cards should not erase the importance of the map economy

## Current Prototype Scope
The live prototype should now be understood as:
- one map: `Frontier Belt`
- 1v1 skirmish
- premade decks only
- stack + priority working for both tactics and unit spells
- resource harvesting loop working
- tactical movement/combat working
- simple bot opponent working
- enough card variety to make matches tactically interesting
- enough faction identity to support real monofaction play patterns

Minimum interesting content target:
- each active faction should have:
  - at least 2 combat unit types
  - at least 1 resource unit type
  - at least 1 support/synergy unit
  - at least 1 direct-damage tactic for units
  - at least 1 meaningful interaction card
    - stack interaction, tempo interaction, or a board-facing answer
  - at least 1 combat trick or temporary buff
  - at least 1 named or clearly readable synergy engine
  - at least 1 payoff turn or haymaker worth building toward

## Presentation Goals
The game should visually celebrate interactions.
Especially important beats:
- card cast to stack
- counterspell / negation
- unit deployment
- attack declaration
- damage to units
- unit destruction
- harvest load
- deposit at base
- synergy trigger or combo payoff

Readable feedback is part of the fun. If a combo happens, the player should feel it.

## Open Questions
- How much of the final game should remain single-map tactical skirmish versus broader campaign/trading structure?
- How much neutral support is healthy before it starts flattening faction identity?
- How much terrain complexity do we want in MVP before it slows iteration too much?
- Should support effects mostly be adjacency-based, or do we want some global engines too?
- How far should stack interaction go for battlefield abilities and triggered effects?
- Should spell damage continue to bypass armor, or should some spell families respect it?
- How much of Biomass should lean into growth/board engines versus regrowth/death-value?
- When do we support true infinite combos, if ever, versus staying with bounded loop-feeling mechanics?
- When do we support true graveyard/reanimation gameplay, if ever, as a major feature wave?
- Do tokens and multi-target choice cards deserve dedicated engine work, or should they remain postponed?

## Decision Log
- 2026-03-18: Direction set to CCG + army tactics + turn-based hex grid.
- 2026-03-18: MVP will use premade decks only; deck builder/editor deferred.
- 2026-03-18: Three-faction model established around Credits + faction-specific resources.
- 2026-03-18: Resource economy shifted to map-based node harvesting with map-specific flavor skins.
- 2026-03-18: Primary win condition set to destroying the opponent base with combat units.
- 2026-03-18: Card draw flavor set to downloading plans from an orbiting satellite.
- 2026-03-18: MVP scope locked to a single playable map: `Frontier Belt`.
- 2026-03-18: Match start includes a home base for each player.
- 2026-03-18: Unit action model set to Civ-like move range plus attack budget per turn.
- 2026-03-18: Instant-speed interaction confirmed with full stack resolution.
- 2026-03-18: Node capture locked to occupancy at end of turn.
- 2026-03-18: Resource economy locked to StarCraft-style harvester trips from node to base-adjacent dropoff.
- 2026-03-18: Summoning sickness enabled for newly deployed units.
- 2026-03-18: Deck rules locked to 60 cards with max 4 copies.
- 2026-03-21: Opening hand target updated from draft `7` to current build `5`.
- 2026-03-21: Hand-size target updated to current build `7`.
- 2026-03-21: Starter decks clarified as single-faction plus neutral, not mixed-faction splashes.
- 2026-03-21: Unit cards now cast to the stack before entering play.
- 2026-03-21: Unresolved stack items now halt phase changes and battlefield actions until resolution.
- 2026-03-21: Base HP target updated from old draft `100` to current build `20`.
- 2026-03-21: Siege reframed as a unit stat, not a global combat rule.
- 2026-03-21: Design direction shifted toward support units, synergy engines, battlefield-targeting tactics, and small combo lines.
- 2026-03-28: Three-faction premade-deck prototype is now the live baseline, not Alloy/Flux-only focus.
- 2026-03-28: Turn flow now includes a discard phase when players finish above `7` cards.
- 2026-03-28: Live opening resources are asymmetric: `Player 1 = 2 Credits`, `Player 2 = 5 Credits`, both with `2` primary.
- 2026-03-28: Live economy now includes `+1 Credit` in Economy and `2`-resource cargo deposits for all resource types.
- 2026-03-28: Biomass primary identity clarified toward sprout, go-wide growth, and board-based resource engines; death/regrowth remains a secondary axis.
- 2026-03-28: Neutral cards are now intentionally governed by a neutral-tax philosophy rather than being generic best-rate glue.
- 2026-03-28: Cascade and Relay are now part of the live combo vocabulary.
- 2026-03-29: Surge is now part of the live Flux combo package.
- 2026-03-29: Bloom is now a live Biomass engine keyword with payoff units and a payoff tactic.
- 2026-03-29: Alloy now has live `Salvage` and `Bastion` identity hooks.

## Backlog Seeds
- Add a top-end Flux `Relay` / `Resonance` payoff
- Add more Alloy formation / siege / salvage payoffs
- Add Biomass regrowth / death-value support
- Decide whether graveyard / reanimation deserves a dedicated feature wave
- Decide whether tokens and multi-target choice cards deserve dedicated engine support
- Decide whether spell damage families should ever respect armor
- Continue tightening neutral rates so faction cards remain the best synergy homes
- Define terrain/tile rules only after support and spell interaction are interesting
- Build clearer in-game previews for buffs, keywords, and triggered effects
