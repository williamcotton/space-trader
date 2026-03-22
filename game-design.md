# Space Trader - Game Design (Living Draft)

Last updated: March 21, 2026

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
- `Biomass Swarm` remains part of the intended three-faction design space, but is not yet the focus of current content iteration

### Win Condition
- Destroy the opposing base
- Bases currently use HP attrition, not capture
- Current base HP target: `20`

### Turn Structure
1. Start
   - Active player draws 1 card
2. Economy
   - Loaded harvesters on base-adjacent tiles deposit cargo
3. Main
   - Main-speed cards can be cast
4. Tactical
   - Units move, attack, and harvest
5. End
   - Node control updates by occupancy

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
- Soft hand cap for passive draw: `7`
- Flavor: cards drawn each turn are downloaded plans from an orbital satellite

### Starting Economy
- Each player starts with:
  - `4` Credits
  - `2` of that faction's primary resource
- This is intentionally generous for prototyping and may be tuned later

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
- Node control grants harvesting rights, not passive income

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
- Newly deployed units cannot act on the turn they resolve onto the battlefield unless a future effect says otherwise
- Units act with Civ-like per-turn budgets
- Tactical auto-flow exists, but harvesting opportunities should not be skipped automatically

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
- industrial, armored, formation-based, direct pressure

Mechanical identity:
- adjacency buffs
- armor and durability
- stronger siege attacks on bases
- rewards clustered formations and disciplined lines

What Alloy should be best at:
- holding territory
- turning support positioning into stronger combat math
- finishing games once it has board control

### Flux Collective
Theme:
- high-tech, reactive, tempo-oriented, precision strikes

Mechanical identity:
- stack interaction
- mobility and repositioning
- spell-matter synergies
- combo turns that chain tactics with board effects

What Flux should be best at:
- punishing expensive plays with counters or tempo loss
- converting tactic cards into extra value
- finding clever swing turns rather than brute-force board presence

### Biomass Swarm
Theme:
- organic, recursive, sacrificial, growth through attrition

Mechanical identity:
- death triggers
- swarm pressure
- sacrifice/value conversion
- board snowball through unit losses and battlefield churn

What Biomass should be best at:
- turning losses into value
- wide boards and layered synergies
- growing pressure over several linked exchanges

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
The current card pool is too flat.
Most cards are either:
- stat-line unit cards
- counterspells
- direct damage to enemy base

That is enough for rules testing, but not enough for fun long-term play.

## New Content Direction: Make the Game More Exciting
The next wave of design should focus on:
- units that boost other units
- units with battlefield synergies
- small combo lines between units and tactics
- direct damage and interaction with battlefield units
- more reasons to care about support pieces, positioning, and sequencing

## Ability Vocabulary (Recommended)
Do not solve this by creating bespoke rules text for every card.
Build a small reusable vocabulary and make many cards out of it.

### Triggers
- `on_deploy`
- `on_attack`
- `on_harvest`
- `on_spell_cast`
- `on_death`
- `on_damage`

### Continuous / Positional Effects
- `adjacent_aura`
- `same_row_or_within_range_bonus` if needed later
- `while_controlling_node`

### Effect Payloads
- `deal_damage`
- `modify_attack`
- `modify_armor`
- `modify_range`
- `modify_move`
- `modify_siege`
- `destroy_target`
- `return_to_hand`
- `ready_unit` or `grant_attack_action` later
- `create_token` later

### Duration Buckets
- `until_end_of_turn`
- `permanent`
- `next_attack`
- `next_time_this_takes_damage` later

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
This is the highest-value content addition.
The prototype needs tactics that interact with units, not just the enemy base or stack.

### Priority Additions
- Deal damage to target unit
- Deal damage to target unit or base
- Buff target allied unit until end of turn
- Destroy target damaged unit
- Protect or reinforce a unit for a turn

### Example Patterns
- `Arc Snap`: deal 2 damage to target unit
- `Slag Barrage`: deal 2 damage to target unit or base
- `Brace Protocol`: target allied unit gets +2 armor until end of turn
- `Overload Finish`: destroy target damaged unit
- `Feeding Frenzy`: target allied unit gets +2 attack this turn when attacking a damaged target

These create tactical swing turns immediately.

## Combo Philosophy
The game should support combos, but they should mostly be:
- two-card combos
- three-card sequences
- board-plus-spell setups

Avoid building around true infinite loops or opaque combo trees this early.
The target is satisfying linked plays, not rules-lawyer complexity.

### Good Combo Shapes
- Support unit + attacker + combat trick
- Spell-matter unit + two tactics in one stack exchange
- Harvester/value trigger + payoff card
- Damage spell + damaged-unit finisher
- Death trigger + sacrifice or disposable frontliner

### Combo Design Rules
- Combo pieces should be useful alone and stronger together
- Counterplay should exist through stack interaction, board removal, or positioning denial
- Combo turns should have strong visual feedback
- The best combos should feel earned, not automatic

## Faction-Specific Synergy Direction
### Alloy Clan Synergy Package
What Alloy should gain next:
- support commanders that buff adjacent combat units
- armor and siege enhancers
- formation rewards for clustered units
- combat tricks that make trades favorable

Example cards:
- `Forge Captain`: adjacent allied combat units get +1 attack
- `Siege Coordinator`: adjacent allies get +1 siege
- `Brace Protocol`: instant defensive buff
- `Slag Barrage`: direct damage to unit or base

### Flux Collective Synergy Package
What Flux should gain next:
- tactic-cast triggers
- precise unit removal and tempo spells
- mobility or range enhancers
- combo turns that reward good sequencing

Example cards:
- `Relay Savant`: whenever you cast a tactic, ping an enemy unit for 1
- `Phase Conduit`: adjacent allies get +1 move
- `Arc Snap`: direct unit damage
- `Overload Finish`: destroy damaged unit

### Biomass Swarm Synergy Package
What Biomass should gain next:
- death triggers
- growth through attrition
- expendable units feeding stronger pieces
- aggressive buffs that reward trading units away

Example cards:
- `Spore Matron`: when an allied unit dies, another ally gains a bonus
- `Carrion Caller`: deploy trigger that buffs a nearby ally
- `Tendril Lash`: small unit damage with rider payoff
- `Feeding Frenzy`: bonus against damaged enemies

## Concrete Card Pass - Wave 1
This is the first concrete content pass to make the game more fun.
It is intentionally small and focused.

Goals of this wave:
- give each faction at least one support/synergy card
- add direct damage that hits battlefield units
- create simple two-card and three-card combo lines
- stay within an ability vocabulary that the rules engine can plausibly support next

Implementation priority:
- first implement the `Alloy Clan` and `Flux Collective` cards
- keep the `Biomass Swarm` cards as the next faction package unless Biomass becomes active immediately

### Alloy Clan - Wave 1
#### Forge Captain
- Faction: `Alloy Clan`
- Type: `Unit`
- Speed: `Main`
- Role: `utility`
- Cost: `C2 A1`
- Suggested stats:
  - HP 5
  - ATK 1
  - ARM 1
  - MOV 2
  - RNG 1
- Rules text:
  - Adjacent allied combat units get `+1 ATK`.
- Design job:
  - First real formation-support unit for Alloy.
  - Makes clustered combat lines rewarding.
- Combo hooks:
  - pairs with `Frontline Scout` to turn cheap attackers into real threats
  - pairs with `Alloy Guard` to create stronger base-pressure turns

#### Brace Protocol
- Faction: `Alloy Clan`
- Type: `Tactic`
- Speed: `Instant`
- Cost: `C1 A1`
- Rules text:
  - Target allied unit gets `+2 ARM` until end of turn.
- Design job:
  - First Alloy combat trick.
  - Lets Alloy win trades and protect key support pieces.
- Combo hooks:
  - strong with `Forge Captain`
  - strong with `Alloy Guard` when holding a chokepoint

#### Rivet Volley
- Faction: `Alloy Clan`
- Type: `Tactic`
- Speed: `Instant`
- Cost: `C1 A1`
- Rules text:
  - Deal `2` damage to target unit or base.
- Design job:
  - Gives Alloy direct tactical reach instead of only base pings.
  - Helps finish damaged units or push final base damage.
- Combo hooks:
  - combines with `Forge Captain`-buffed attacks to finish defenders
  - softens blockers so `Alloy Guard` can punch through

### Flux Collective - Wave 1
#### Relay Savant
- Faction: `Flux Collective`
- Type: `Unit`
- Speed: `Main`
- Role: `utility`
- Cost: `C2 F1`
- Suggested stats:
  - HP 4
  - ATK 1
  - ARM 0
  - MOV 2
  - RNG 1
- Rules text:
  - Whenever you cast a tactic, deal `1` damage to target enemy unit.
- Design job:
  - First spell-matter engine card.
  - Turns reactive play into board control.
- Combo hooks:
  - makes every tactic better
  - enables damage-based setup for finishers

#### Arc Snap
- Faction: `Flux Collective`
- Type: `Tactic`
- Speed: `Instant`
- Cost: `C1 F1`
- Rules text:
  - Deal `2` damage to target unit.
- Design job:
  - Clean precision removal tool.
  - Gives Flux a concrete answer to support units and damaged frontliners.
- Combo hooks:
  - with `Relay Savant`, this effectively becomes a 3-damage sequence
  - sets up `Overload Finish`

#### Overload Finish
- Faction: `Flux Collective`
- Type: `Tactic`
- Speed: `Instant`
- Cost: `C2 F1`
- Rules text:
  - Destroy target damaged unit.
- Design job:
  - First payoff card for damage-marking and spell sequencing.
  - Gives Flux an actual combo closer instead of pure tempo stalls.
- Combo hooks:
  - ideal follow-up to `Arc Snap`
  - also turns `Relay Savant` pings into meaningful setup

### Biomass Swarm - Wave 1
#### Spore Matron
- Faction: `Biomass Swarm`
- Type: `Unit`
- Speed: `Main`
- Role: `utility`
- Cost: `C2 B1`
- Suggested stats:
  - HP 5
  - ATK 1
  - ARM 0
  - MOV 2
  - RNG 1
- Rules text:
  - Whenever an allied unit is destroyed, another allied unit gets `+1 ATK` until end of turn.
- Design job:
  - Establishes Biomass as the death-trigger faction.
  - Makes trading disposable bodies feel productive.
- Combo hooks:
  - rewards swarm attacks and sacrificial blocking
  - creates chain-attack turns when several units collide

#### Tendril Lash
- Faction: `Biomass Swarm`
- Type: `Tactic`
- Speed: `Instant`
- Cost: `C1 B1`
- Rules text:
  - Deal `1` damage to target unit.
  - If that unit is already damaged, deal `2` instead.
- Design job:
  - Simple damage card that naturally cares about prior combat.
  - Establishes Biomass as a faction that piles pressure onto wounded targets.
- Combo hooks:
  - combines with ordinary combat to finish units efficiently
  - works well with death-trigger support pieces

#### Feeding Frenzy
- Faction: `Biomass Swarm`
- Type: `Tactic`
- Speed: `Instant`
- Cost: `C1 B1`
- Rules text:
  - Target allied unit gets `+2 ATK` until end of turn.
  - If it attacks a damaged unit this turn, it also gets `+1 ARM`.
- Design job:
  - First aggressive Biomass combat trick.
  - Pushes the faction toward opportunistic finishing blows.
- Combo hooks:
  - works with `Tendril Lash`
  - works with `Spore Matron`-style attrition turns

### Wave 1 Combo Lines
These are the intended first combo patterns created by the above cards.

#### Alloy Combo Line
- `Forge Captain` + `Frontline Scout`
  - Scout attacks above rate because of adjacency buff.
- `Forge Captain` + `Alloy Guard` + `Brace Protocol`
  - Alloy creates a durable front line that wins trades and keeps pressure on the base.
- `Rivet Volley` + any buffed attacker
  - direct damage clears the last blocker or finishes a weakened base.

#### Flux Combo Line
- `Relay Savant` + `Arc Snap`
  - one tactic cast turns into layered unit damage.
- `Arc Snap` + `Overload Finish`
  - clean two-card removal combo.
- `Relay Savant` + `Counter Pulse` / `Echo Recall`
  - even reactive stack play contributes to battlefield advantage.

#### Biomass Combo Line
- `Tendril Lash` + `Feeding Frenzy`
  - wound a unit, then send in a buffed attacker for the kill.
- `Spore Matron` + swarm attacks
  - dead allies turn into more pressure instead of lost tempo.

### Narrow-Scope Implementation Order
If we need to implement these in smaller slices, do it in this order:
1. `Rivet Volley`
2. `Arc Snap`
3. `Overload Finish`
4. `Brace Protocol`
5. `Forge Captain`
6. `Relay Savant`
7. Biomass package

This order gets battlefield-targeting tactics online first, then adds support engines.

## Economy Design Principles
- Resource gathering should continue to feel StarCraft-like, not abstract
- Harvesters should create meaningful route and escort decisions
- Resource denial and node contesting should matter
- There should be tension between spending on economy, support pieces, and combat finishers
- Support/synergy cards should not erase the importance of the map economy

## MVP Scope (Updated)
The MVP should now be understood as:
- one map: `Frontier Belt`
- 1v1 skirmish
- premade decks only
- stack + priority working for both tactics and unit spells
- resource harvesting loop working
- tactical movement/combat working
- simple bot opponent working
- enough card variety to make matches tactically interesting

Minimum interesting content target:
- each active faction should have:
  - at least 2 combat unit types
  - at least 1 resource unit type
  - at least 1 support/synergy unit
  - at least 1 direct-damage tactic for units
  - at least 1 counterspell or stack interaction card
  - at least 1 combat trick or temporary buff
  - at least 1 small combo line worth building toward

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
- Do we want all factions to share the same neutral support package, or should neutral cards be minimal?
- How much terrain complexity do we want in MVP before it slows iteration too much?
- Should support effects mostly be adjacency-based, or do we want some global engines too?
- How far should stack interaction go for battlefield abilities and triggered effects?
- When do we add damaged-unit targeting, death triggers, and deploy triggers to the actual rules engine?
- Do we want Biomass in the active implementation immediately, or after Alloy/Flux become genuinely fun?

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
- 2026-03-21: Passive draw cap updated to current build `7`.
- 2026-03-21: Starter decks clarified as single-faction plus neutral, not mixed-faction splashes.
- 2026-03-21: Unit cards now cast to the stack before entering play.
- 2026-03-21: Unresolved stack items now halt phase changes and battlefield actions until resolution.
- 2026-03-21: Base HP target updated from old draft `100` to current build `20`.
- 2026-03-21: Siege reframed as a unit stat, not a global combat rule.
- 2026-03-21: Design direction shifted toward support units, synergy engines, battlefield-targeting tactics, and small combo lines.
- 2026-03-21: First concrete content wave drafted with 9 cards across Alloy, Flux, and Biomass, prioritizing support units, direct unit damage, and simple combo lines.

## Backlog Seeds
- Add battlefield-targeting tactic rules and UI targeting flow
- Add temporary stat-modifier effect system
- Add support-unit aura system
- Add trigger system for deploy / spell-cast / death / harvest events
- Add direct-damage, finisher, and combat-trick cards for active factions
- Add at least one support/combo package to Alloy Clan and Flux Collective
- Re-evaluate Biomass implementation timing after Alloy and Flux become fun to play
- Define terrain/tile rules only after support and spell interaction are interesting
- Build clearer in-game previews for buffs, auras, and triggered effects
